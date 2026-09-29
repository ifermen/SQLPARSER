import { readColumnDefinitionInfo } from '../columnDefinition';
import { PARSER_DIAGNOSTICS } from '../diagnosticCodes';
import { cleanIdentifier, QUALIFIED_IDENTIFIER } from '../identifiers';
import { readStringLiteral } from '../literals';
import { findTable, type ParseContext, type TableDraft } from '../parseContext';
import { readTableBody } from '../sqlSchemaLibrary';
import { findClosingParen, splitTopLevel, type Statement } from '../sqlScanner';
import { addColumn, addConstraint } from '../tableDraft';
import { parseTableElement } from '../tableElement';

const CREATE_TABLE = new RegExp(
  '^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:GLOBAL|LOCAL)\\s+)?(?:(?:TEMPORARY|TEMP|UNLOGGED)\\s+)?' +
    `TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED_IDENTIFIER})\\s*`,
  'i',
);
const TABLE_COMMENT = /\bCOMMENT\s*=?\s*'/i;

export function handleCreateTable(context: ParseContext, statement: Statement): void {
  const { skeleton, text } = statement;
  const span = { start: statement.start, end: statement.end };
  const invalid = (message: string) =>
    context.report('error', PARSER_DIAGNOSTICS.invalidCreateTable, message, span);

  const head = CREATE_TABLE.exec(skeleton);
  if (!head?.[1]) {
    invalid('No se ha podido interpretar la sentencia CREATE TABLE.');
    return;
  }
  const name = cleanIdentifier(head[1]);
  const open = head[0].length;

  if (skeleton.charAt(open) !== '(') {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unsupportedStatement,
      `CREATE TABLE sin definición de columnas (AS SELECT, LIKE…) no está soportado; se ignora la tabla "${name}".`,
      span,
      { table: name },
    );
    return;
  }

  const close = findClosingParen(skeleton, open);
  const library = close < 0 ? null : readTableBody(text.slice(open + 1, close), context.backslashEscapes);
  if (!library) {
    invalid(`No se ha podido interpretar la definición de la tabla "${name}".`);
    return;
  }

  if (findTable(context, name)) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.duplicateTable,
      `La tabla "${name}" ya está definida; se ignora esta definición.`,
      span,
      { table: name },
    );
    return;
  }

  const commentMatch = TABLE_COMMENT.exec(skeleton.slice(close + 1));
  const explicitComment = commentMatch
    ? readStringLiteral(text, close + 1 + commentMatch.index + commentMatch[0].length - 1, context.backslashEscapes)
    : undefined;

  const table: TableDraft = {
    name,
    comment: explicitComment ?? library.comment,
    columns: [],
    uniqueConstraints: [],
    foreignKeys: [],
    ...span,
  };

  for (const segment of splitTopLevel(skeleton, open + 1, close)) {
    const segmentSkeleton = skeleton.slice(segment.start, segment.end);
    const segmentSpan = { start: statement.start + segment.start, end: statement.start + segment.end };
    const element = parseTableElement(segmentSkeleton);

    if (element.kind === 'column') {
      const info = readColumnDefinitionInfo(
        segmentSkeleton,
        text.slice(segment.start, segment.end),
        context.backslashEscapes,
      );
      const libraryColumn = info ? library.columns.find((column) => column.name === info.name) : undefined;
      addColumn(context, table, info, libraryColumn, segmentSpan);
    } else {
      addConstraint(context, table, element, segmentSpan);
    }
  }

  context.tables.set(name.toLowerCase(), table);
}
