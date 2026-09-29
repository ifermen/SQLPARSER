import { PARSER_DIAGNOSTICS } from '../diagnosticCodes';
import { cleanIdentifier, parseIdentifierList, QUALIFIED_IDENTIFIER } from '../identifiers';
import { findTable, type ParseContext } from '../parseContext';
import { findClosingParen, type Statement } from '../sqlScanner';

const CREATE_UNIQUE_INDEX = new RegExp(
  '^CREATE\\s+UNIQUE\\s+(?:CLUSTERED\\s+|NONCLUSTERED\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?' +
    `(?:(${QUALIFIED_IDENTIFIER})\\s+)?ON\\s+(?:ONLY\\s+)?(${QUALIFIED_IDENTIFIER})\\s*(?:USING\\s+\\w+\\s*)?\\(`,
  'i',
);

/** `CREATE UNIQUE INDEX … ON tabla (columnas)` se modela como restricción UNIQUE. */
export function handleCreateUniqueIndex(context: ParseContext, statement: Statement): void {
  const span = { start: statement.start, end: statement.end };
  const unsupported = (message: string) =>
    context.report('warning', PARSER_DIAGNOSTICS.unsupportedIndex, message, span);

  const match = CREATE_UNIQUE_INDEX.exec(statement.skeleton);
  if (!match?.[2]) {
    unsupported('Índice único no soportado; se ignora.');
    return;
  }

  const tableName = cleanIdentifier(match[2]);
  const table = findTable(context, tableName);
  if (!table) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unknownTable,
      `Índice único sobre la tabla "${tableName}", que no está definida en el script; se ignora.`,
      span,
    );
    return;
  }

  const open = match[0].length - 1;
  const close = findClosingParen(statement.skeleton, open);
  const columns = close < 0 ? null : parseIdentifierList(statement.skeleton.slice(open + 1, close));
  if (!columns) {
    unsupported(`Índice único con expresiones en la tabla "${table.name}" no soportado; se ignora.`);
    return;
  }
  if (/\bWHERE\b/i.test(statement.skeleton.slice(close + 1))) {
    unsupported(
      `Índice único parcial (WHERE) en la tabla "${table.name}": no garantiza unicidad en toda la tabla; se ignora.`,
    );
    return;
  }

  table.uniqueConstraints.push({
    name: match[1] ? cleanIdentifier(match[1]) : undefined,
    columns,
    ...span,
  });
}
