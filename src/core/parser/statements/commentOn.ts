import { PARSER_DIAGNOSTICS } from '../diagnosticCodes';
import { identifierParts, QUALIFIED_IDENTIFIER } from '../identifiers';
import { readStringLiteral } from '../literals';
import { findColumn, findTable, type ParseContext } from '../parseContext';
import type { Statement } from '../sqlScanner';

const COMMENT_ON = new RegExp(`^COMMENT\\s+ON\\s+(TABLE|COLUMN)\\s+(${QUALIFIED_IDENTIFIER})\\s+IS\\s+`, 'i');

/** `COMMENT ON TABLE t IS '…'` y `COMMENT ON COLUMN t.c IS '…'` (PostgreSQL). */
export function handleCommentOn(context: ParseContext, statement: Statement): void {
  const match = COMMENT_ON.exec(statement.skeleton);
  // Los comentarios sobre otros objetos (esquemas, índices…) no afectan al modelo.
  if (!match?.[1] || !match[2]) return;

  const valueStart = match[0].length;
  const isNull = /^NULL\b/i.test(statement.skeleton.slice(valueStart));
  const comment = isNull ? undefined : readStringLiteral(statement.text, valueStart, context.backslashEscapes);
  if (!isNull && comment === undefined) return;

  const span = { start: statement.start, end: statement.end };
  const parts = identifierParts(match[2]);
  const isColumn = match[1].toUpperCase() === 'COLUMN';
  const tableName = parts[parts.length - (isColumn ? 2 : 1)];
  const table = tableName === undefined ? undefined : findTable(context, tableName);
  if (!table) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unknownTable,
      `COMMENT ON sobre una tabla que no está definida en el script; se ignora.`,
      span,
    );
    return;
  }

  if (!isColumn) {
    table.comment = comment;
    return;
  }

  const columnName = parts[parts.length - 1] ?? '';
  const column = findColumn(table, columnName);
  if (!column) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unknownColumn,
      `La columna "${columnName}" no existe en la tabla "${table.name}"; se ignora el comentario.`,
      span,
      { table: table.name, column: columnName },
    );
    return;
  }
  if (comment === undefined) delete column.comment;
  else column.comment = comment;
}
