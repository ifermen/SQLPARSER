import { readColumnDefinitionInfo } from '../columnDefinition';
import { PARSER_DIAGNOSTICS } from '../diagnosticCodes';
import { cleanIdentifier, IDENTIFIER, QUALIFIED_IDENTIFIER } from '../identifiers';
import { findColumn, findTable, type ParseContext, type TableDraft } from '../parseContext';
import { readColumnDefinition } from '../sqlSchemaLibrary';
import { splitTopLevel, type Segment, type Statement } from '../sqlScanner';
import { addColumn, addConstraint, replaceColumn } from '../tableDraft';
import { parseTableElement } from '../tableElement';

const ALTER_TABLE = new RegExp(
  `^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${QUALIFIED_IDENTIFIER})\\s*`,
  'i',
);
const ADD = /^ADD\s+/i;
const ADD_COLUMN = /^COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?/i;
const MODIFY = /^MODIFY\s+(?:COLUMN\s+)?/i;
const CHANGE = new RegExp(`^CHANGE\\s+(?:COLUMN\\s+)?(${IDENTIFIER})\\s+`, 'i');
const ALTER_COLUMN = new RegExp(`^ALTER\\s+(?:COLUMN\\s+)?(${IDENTIFIER})\\s+`, 'i');
/** Acciones válidas que no afectan al modelo de entidades. */
const IGNORED_ACTION =
  /^(?:OWNER\s+TO|AUTO_INCREMENT|ENGINE|DEFAULT\s+CHARSET|CHARSET|CHARACTER\s+SET|COLLATE|ROW_FORMAT|ENABLE|DISABLE|CLUSTER\s+ON|REPLICA\s+IDENTITY|VALIDATE\s+CONSTRAINT|SET\s+(?:WITH|WITHOUT|LOGGED|UNLOGGED|TABLESPACE|SCHEMA))\b|^(?:SET|RESET)\s*\(/i;

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

  for (const segment of splitTopLevel(statement.skeleton, head[0].length)) {
    applyAction(context, table, {
      skeleton: statement.skeleton.slice(segment.start, segment.end),
      text: statement.text.slice(segment.start, segment.end),
      span: { start: statement.start + segment.start, end: statement.start + segment.end },
    });
  }
}

function applyAction(context: ParseContext, table: TableDraft, action: AlterAction): void {
  const add = ADD.exec(action.skeleton);
  if (add) {
    let offset = add[0].length;
    const columnKeyword = ADD_COLUMN.exec(action.skeleton.slice(offset));
    if (columnKeyword) offset += columnKeyword[0].length;
    const rest = sliceAction(action, offset);
    const element = columnKeyword ? ({ kind: 'column' } as const) : parseTableElement(rest.skeleton);

    if (element.kind === 'column') {
      const info = readColumnDefinitionInfo(rest.skeleton, rest.text, context.backslashEscapes);
      const libraryColumn = readColumnDefinition(rest.text, context.backslashEscapes) ?? undefined;
      addColumn(context, table, info, libraryColumn, action.span);
    } else {
      addConstraint(context, table, element, action.span);
    }
    return;
  }

  const modify = MODIFY.exec(action.skeleton);
  if (modify) {
    redefineColumn(context, table, action, modify[0].length, null);
    return;
  }

  const change = CHANGE.exec(action.skeleton);
  if (change?.[1]) {
    redefineColumn(context, table, action, change[0].length, cleanIdentifier(change[1]));
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

/** `MODIFY col def` (`previousName` null) o `CHANGE old new def` de MySQL. */
function redefineColumn(
  context: ParseContext,
  table: TableDraft,
  action: AlterAction,
  offset: number,
  previousName: string | null,
): void {
  const definition = sliceAction(action, offset);
  const info = readColumnDefinitionInfo(definition.skeleton, definition.text, context.backslashEscapes);
  const libraryColumn = readColumnDefinition(definition.text, context.backslashEscapes);
  if (!info || !libraryColumn) {
    addColumn(context, table, null, undefined, action.span);
    return;
  }

  const targetName = previousName ?? info.name;
  if (targetName.toLowerCase() !== info.name.toLowerCase()) {
    // Renombrar columnas obligaría a actualizar las restricciones que las usan.
    reportUnsupportedAction(context, table, action);
    return;
  }

  const target = findColumn(table, targetName);
  if (!target) {
    reportUnknownColumn(context, table, targetName, action);
    return;
  }
  replaceColumn(context, table, table.columns.indexOf(target), info, libraryColumn, action.span);
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

  const rest = sliceAction(action, offset);
  const setDefault = /^SET\s+DEFAULT\s+/i.exec(rest.skeleton);
  if (setDefault) {
    const value = rest.text.slice(setDefault[0].length).trim();
    column.defaultValue = value;
    if (/\bnextval\s*\(/i.test(value)) column.autoIncrement = true;
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

function sliceAction(action: AlterAction, offset: number): Pick<AlterAction, 'skeleton' | 'text'> {
  return { skeleton: action.skeleton.slice(offset), text: action.text.slice(offset) };
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
