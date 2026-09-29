import { isSequenceValue, readColumnDefinitionInfo } from '../columnDefinition';
import { PARSER_DIAGNOSTICS } from '../diagnosticCodes';
import { cleanIdentifier, IDENTIFIER, QUALIFIED_IDENTIFIER } from '../identifiers';
import { findColumn, findTable, type ParseContext, type TableDraft } from '../parseContext';
import { readColumnDefinition } from '../sqlSchemaLibrary';
import { findClosingParen, splitTopLevel, type Segment, type Statement } from '../sqlScanner';
import { addColumn, addConstraint, modifyColumnPartially, replaceColumn } from '../tableDraft';
import { parseTableElement } from '../tableElement';

const ALTER_TABLE = new RegExp(
  `^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${QUALIFIED_IDENTIFIER})\\s*`,
  'i',
);
const ADD = /^ADD\b\s*/i;
const ADD_COLUMN = /^COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?/i;
const MODIFY = /^MODIFY\b\s*(?:COLUMN\s+)?/i;
const CHANGE = new RegExp(`^CHANGE\\s+(?:COLUMN\\s+)?(${IDENTIFIER})\\s+`, 'i');
const ALTER_COLUMN = new RegExp(`^ALTER\\s+(?:COLUMN\\s+)?(${IDENTIFIER})\\s+`, 'i');
const COLUMN_NAME = new RegExp(`^\\s*${IDENTIFIER}\\s*`);
/** Acciones válidas que no afectan al modelo de entidades. */
const IGNORED_ACTION = new RegExp(
  '^(?:' +
    [
      'OWNER\\s+TO',
      'AUTO_INCREMENT',
      'ENGINE',
      'DEFAULT\\s+CHARSET',
      'CHARSET',
      'CHARACTER\\s+SET',
      'COLLATE',
      'ROW_FORMAT',
      'ENABLE',
      'DISABLE',
      'CLUSTER\\s+ON',
      'REPLICA\\s+IDENTITY',
      'VALIDATE\\s+CONSTRAINT',
      'SET\\s+(?:WITH|WITHOUT|LOGGED|UNLOGGED|TABLESPACE|SCHEMA)',
      // Oracle: almacenamiento y paralelismo.
      'NO(?:LOGGING|PARALLEL|CACHE|COMPRESS|MONITORING)',
      'LOGGING',
      'PARALLEL',
      'CACHE',
      'COMPRESS',
      'MONITORING',
      'MOVE',
      'SHRINK\\s+SPACE',
      '(?:DE)?ALLOCATE',
    ].join('|') +
    ')\\b|^(?:SET|RESET)\\s*\\(',
  'i',
);

interface AlterAction {
  readonly skeleton: string;
  readonly text: string;
  readonly span: Segment;
}

export function handleAlterTable(context: ParseContext, statement: Statement): void {
  const span = { start: statement.start, end: statement.end };
  const head = ALTER_TABLE.exec(statement.skeleton);
  if (!head?.[1]) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unsupportedStatement,
      'Sentencia ALTER TABLE no soportada; se ignora.',
      span,
    );
    return;
  }

  const name = cleanIdentifier(head[1]);
  const table = findTable(context, name);
  if (!table) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unknownTable,
      `ALTER TABLE sobre la tabla "${name}", que no está definida en el script; se ignora.`,
      span,
    );
    return;
  }

  const whole: AlterAction = { skeleton: statement.skeleton, text: statement.text, span };
  for (const segment of splitTopLevel(statement.skeleton, head[0].length)) {
    applyAction(context, table, slice(whole, segment));
  }
}

function applyAction(context: ParseContext, table: TableDraft, action: AlterAction): void {
  const add = ADD.exec(action.skeleton);
  if (add) {
    const rest = from(action, add[0].length);
    // Oracle: `ADD (columna …, CONSTRAINT …)`.
    const items = parenthesizedItems(rest);
    for (const item of items ?? [rest]) addElement(context, table, item);
    return;
  }

  const modify = MODIFY.exec(action.skeleton);
  if (modify) {
    const rest = from(action, modify[0].length);
    // Oracle: `MODIFY (col …, col …)` o `MODIFY col …` parcial; MySQL: redefinición completa.
    const items = parenthesizedItems(rest);
    if (items) for (const item of items) modifyPartially(context, table, item);
    else if (context.dialect === 'oracle') modifyPartially(context, table, rest);
    else redefineColumn(context, table, rest, null);
    return;
  }

  const change = CHANGE.exec(action.skeleton);
  if (change?.[1]) {
    redefineColumn(context, table, from(action, change[0].length), cleanIdentifier(change[1]));
    return;
  }

  const alterColumn = ALTER_COLUMN.exec(action.skeleton);
  if (alterColumn?.[1]) {
    alterColumnProperty(context, table, action, alterColumn[0].length, cleanIdentifier(alterColumn[1]));
    return;
  }

  if (IGNORED_ACTION.test(action.skeleton)) return;
  reportUnsupportedAction(context, table, action);
}

/** Añade una columna (`[COLUMN] def`) o una restricción. */
function addElement(context: ParseContext, table: TableDraft, item: AlterAction): void {
  const columnKeyword = ADD_COLUMN.exec(item.skeleton);
  const definition = columnKeyword ? from(item, columnKeyword[0].length) : item;
  const element = columnKeyword ? ({ kind: 'column' } as const) : parseTableElement(definition.skeleton);

  if (element.kind === 'column') {
    const info = readColumnDefinitionInfo(definition.skeleton, definition.text, context.backslashEscapes);
    const libraryColumn = readColumnDefinition(definition.text, context.dialect) ?? undefined;
    addColumn(context, table, info, libraryColumn, item.span);
  } else {
    addConstraint(context, table, element, item.span);
  }
}

/** `MODIFY col def` (`previousName` null) o `CHANGE old new def` de MySQL: redefinición completa. */
function redefineColumn(
  context: ParseContext,
  table: TableDraft,
  definition: AlterAction,
  previousName: string | null,
): void {
  const info = readColumnDefinitionInfo(definition.skeleton, definition.text, context.backslashEscapes);
  const libraryColumn = readColumnDefinition(definition.text, context.dialect);
  if (!info || !libraryColumn) {
    addColumn(context, table, null, undefined, definition.span);
    return;
  }

  const targetName = previousName ?? info.name;
  if (targetName.toLowerCase() !== info.name.toLowerCase()) {
    // Renombrar columnas obligaría a actualizar las restricciones que las usan.
    reportUnsupportedAction(context, table, definition);
    return;
  }

  const target = findColumn(table, targetName);
  if (!target) {
    reportUnknownColumn(context, table, targetName, definition);
    return;
  }
  replaceColumn(context, table, table.columns.indexOf(target), info, libraryColumn, definition.span);
}

/** `MODIFY` de Oracle: solo cambia lo indicado. */
function modifyPartially(context: ParseContext, table: TableDraft, item: AlterAction): void {
  const info = readColumnDefinitionInfo(item.skeleton, item.text, context.backslashEscapes);
  if (!info) {
    addColumn(context, table, null, undefined, item.span);
    return;
  }
  const column = findColumn(table, info.name);
  if (!column) {
    reportUnknownColumn(context, table, info.name, item);
    return;
  }

  const nameLength = COLUMN_NAME.exec(item.skeleton)?.[0].length ?? 0;
  modifyColumnPartially(
    context,
    table,
    column,
    info,
    readColumnDefinition(item.text, context.dialect),
    item.skeleton.slice(nameLength),
    item.span,
  );
}

/** `ALTER [COLUMN] col SET DEFAULT … | DROP DEFAULT | SET/DROP NOT NULL | ADD GENERATED … AS IDENTITY`. */
function alterColumnProperty(
  context: ParseContext,
  table: TableDraft,
  action: AlterAction,
  offset: number,
  columnName: string,
): void {
  const column = findColumn(table, columnName);
  if (!column) {
    reportUnknownColumn(context, table, columnName, action);
    return;
  }

  const rest = from(action, offset);
  const setDefault = /^SET\s+DEFAULT\s+/i.exec(rest.skeleton);
  if (setDefault) {
    const value = rest.text.slice(setDefault[0].length).trim();
    column.defaultValue = value;
    if (isSequenceValue(value)) column.autoIncrement = true;
  } else if (/^DROP\s+DEFAULT\b/i.test(rest.skeleton)) {
    delete column.defaultValue;
  } else if (/^SET\s+NOT\s+NULL\b/i.test(rest.skeleton)) {
    column.nullable = false;
  } else if (/^DROP\s+NOT\s+NULL\b/i.test(rest.skeleton)) {
    column.nullable = true;
  } else if (/^ADD\s+GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(rest.skeleton)) {
    column.autoIncrement = true;
  } else if (!/^SET\s+(?:STATISTICS|STORAGE|COMPRESSION)\b/i.test(rest.skeleton)) {
    reportUnsupportedAction(context, table, action);
  }
}

/** Subacción desde `offset` hasta el final. */
function from(action: AlterAction, offset: number): AlterAction {
  return slice(action, { start: offset, end: action.skeleton.length });
}

/** Subacción `[segment.start, segment.end)`, con offsets relativos a la acción. */
function slice(action: AlterAction, segment: Segment): AlterAction {
  return {
    skeleton: action.skeleton.slice(segment.start, segment.end),
    text: action.text.slice(segment.start, segment.end),
    span: { start: action.span.start + segment.start, end: action.span.start + segment.end },
  };
}

/** Elementos de una lista `( a, b, … )` que ocupa toda la acción, o `null` si no la hay. */
function parenthesizedItems(action: AlterAction): AlterAction[] | null {
  if (!action.skeleton.startsWith('(')) return null;
  const close = findClosingParen(action.skeleton, 0);
  if (close < 0 || action.skeleton.slice(close + 1).trim() !== '') return null;
  return splitTopLevel(action.skeleton, 1, close).map((segment) => slice(action, segment));
}

function reportUnknownColumn(
  context: ParseContext,
  table: TableDraft,
  columnName: string,
  action: AlterAction,
): void {
  context.report(
    'warning',
    PARSER_DIAGNOSTICS.unknownColumn,
    `La columna "${columnName}" no existe en la tabla "${table.name}"; se ignora la acción.`,
    action.span,
    { table: table.name, column: columnName },
  );
}

function reportUnsupportedAction(context: ParseContext, table: TableDraft, action: AlterAction): void {
  context.report(
    'warning',
    PARSER_DIAGNOSTICS.unsupportedAlterAction,
    `Acción de ALTER TABLE sobre "${table.name}" no soportada; se ignora.`,
    action.span,
    { table: table.name },
  );
}
