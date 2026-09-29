import { PARSER_DIAGNOSTICS } from '../diagnosticCodes';
import { cleanIdentifier, IDENTIFIER, QUALIFIED_IDENTIFIER } from '../identifiers';
import { findColumn, findTable, type ParseContext } from '../parseContext';
import type { Statement } from '../sqlScanner';

const BEFORE_INSERT_TRIGGER = new RegExp(
  '^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:NON)?EDITIONABLE\\s+)?TRIGGER\\s+' +
    `${QUALIFIED_IDENTIFIER}\\s+BEFORE\\s+INSERT\\b[\\s\\S]*?\\bON\\s+(${QUALIFIED_IDENTIFIER})`,
  'i',
);

/** Asignación de una secuencia a una columna del registro nuevo. */
const SEQUENCE_ASSIGNMENTS = [
  // :NEW.id := seq.NEXTVAL;
  new RegExp(`:NEW\\s*\\.\\s*(${IDENTIFIER})\\s*:=\\s*${QUALIFIED_IDENTIFIER}\\s*\\.\\s*NEXTVAL\\b`, 'gi'),
  // SELECT seq.NEXTVAL INTO :NEW.id FROM dual;
  new RegExp(
    `\\bSELECT\\s+${QUALIFIED_IDENTIFIER}\\s*\\.\\s*NEXTVAL\\s+INTO\\s+:NEW\\s*\\.\\s*(${IDENTIFIER})`,
    'gi',
  ),
];

/**
 * Antes de las columnas identidad (Oracle 12c), el autoincremento se hacía con
 * una secuencia y un trigger `BEFORE INSERT` que asigna `seq.NEXTVAL` a la
 * columna. Ese patrón se interpreta marcando la columna como autoincremental;
 * cualquier otro trigger se avisa como no soportado.
 */
export function handleCreateTrigger(context: ParseContext, statement: Statement): void {
  const span = { start: statement.start, end: statement.end };
  const trigger = BEFORE_INSERT_TRIGGER.exec(statement.skeleton);
  const columnNames = SEQUENCE_ASSIGNMENTS.flatMap((pattern) =>
    [...statement.skeleton.matchAll(pattern)].map((match) => cleanIdentifier(match[1] ?? '')),
  );

  if (!trigger?.[1] || columnNames.length === 0) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unsupportedStatement,
      'Sentencia no soportada; se ignora.',
      span,
    );
    return;
  }

  const tableName = cleanIdentifier(trigger[1]);
  const table = findTable(context, tableName);
  if (!table) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unknownTable,
      `Trigger sobre la tabla "${tableName}", que no está definida en el script; se ignora.`,
      span,
    );
    return;
  }

  for (const columnName of columnNames) {
    const column = findColumn(table, columnName);
    if (column) {
      column.autoIncrement = true;
    } else {
      context.report(
        'warning',
        PARSER_DIAGNOSTICS.unknownColumn,
        `El trigger asigna una secuencia a la columna "${columnName}", que no existe en la tabla "${table.name}".`,
        span,
        { table: table.name, column: columnName },
      );
    }
  }
}
