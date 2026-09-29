import { cleanIdentifier, IDENTIFIER, parseIdentifierList, QUALIFIED_IDENTIFIER } from './identifiers';
import { findClosingParen } from './sqlScanner';

/** Elemento de un CREATE TABLE (o de un `ALTER TABLE … ADD`) ya clasificado. */
export type TableElement =
  | { readonly kind: 'column' }
  | { readonly kind: 'primary-key'; readonly name?: string; readonly columns: readonly string[] }
  | { readonly kind: 'unique'; readonly name?: string; readonly columns: readonly string[] }
  | {
      readonly kind: 'foreign-key';
      readonly name?: string;
      readonly columns: readonly string[];
      readonly referencedTable: string;
      /** Vacío si el script no las indica: se resuelven a la PK de la tabla referenciada. */
      readonly referencedColumns: readonly string[];
    }
  /** Índices y CHECK: válidos, pero no afectan al modelo. */
  | { readonly kind: 'ignored' }
  /** LIKE, EXCLUDE, restricciones sobre expresiones… */
  | { readonly kind: 'unsupported' };

const CONSTRAINT_NAME = new RegExp(`^CONSTRAINT\\s+(${IDENTIFIER})\\s*`, 'i');
const UNIQUE_INDEX_NAME = new RegExp(`^UNIQUE\\s+(?:KEY|INDEX)\\s+(${IDENTIFIER})\\s*(?:USING\\s+\\w+\\s*)?\\(`, 'i');
const REFERENCES = new RegExp(`^\\s*REFERENCES\\s+(${QUALIFIED_IDENTIFIER})\\s*`, 'i');
const IGNORED_ELEMENT = /^(?:KEY|INDEX|FULLTEXT|SPATIAL|CHECK)\b/i;
const UNSUPPORTED_ELEMENT = /^(?:LIKE|EXCLUDE|PERIOD)\b/i;

const UNSUPPORTED: TableElement = { kind: 'unsupported' };

/** Clasifica un elemento a partir de su esqueleto (sin comentarios ni literales). */
export function parseTableElement(skeleton: string): TableElement {
  let rest = skeleton.trim();
  let name: string | undefined;

  const constraint = CONSTRAINT_NAME.exec(rest);
  if (constraint?.[1]) {
    name = cleanIdentifier(constraint[1]);
    rest = rest.slice(constraint[0].length);
  }

  if (/^PRIMARY\s+KEY\b/i.test(rest)) {
    const columns = readParenthesizedList(rest, 0);
    return columns ? { kind: 'primary-key', name, columns: columns.names } : UNSUPPORTED;
  }

  if (/^UNIQUE\b/i.test(rest)) {
    const indexName = UNIQUE_INDEX_NAME.exec(rest)?.[1];
    const columns = readParenthesizedList(rest, 0);
    return columns
      ? { kind: 'unique', name: name ?? (indexName && cleanIdentifier(indexName)), columns: columns.names }
      : UNSUPPORTED;
  }

  if (/^FOREIGN\s+KEY\b/i.test(rest)) {
    const columns = readParenthesizedList(rest, 0);
    if (!columns) return UNSUPPORTED;
    const afterColumns = rest.slice(columns.end + 1);
    const reference = REFERENCES.exec(afterColumns);
    if (!reference?.[1]) return UNSUPPORTED;
    const referencedColumns = readReferencedColumns(afterColumns.slice(reference[0].length));
    if (!referencedColumns) return UNSUPPORTED;
    return {
      kind: 'foreign-key',
      name,
      columns: columns.names,
      referencedTable: cleanIdentifier(reference[1]),
      referencedColumns,
    };
  }

  if (IGNORED_ELEMENT.test(rest)) return { kind: 'ignored' };
  if (constraint || UNSUPPORTED_ELEMENT.test(rest)) return UNSUPPORTED;
  return { kind: 'column' };
}

/**
 * Columnas referenciadas tras `REFERENCES tabla`: `[]` si no se indican,
 * `null` si hay algo que no es una lista de columnas.
 */
export function readReferencedColumns(afterTable: string): string[] | null {
  if (!afterTable.startsWith('(')) return [];
  return readParenthesizedList(afterTable, 0)?.names ?? null;
}

/** Lee la primera lista `( … )` a partir de `from`. */
function readParenthesizedList(text: string, from: number): { names: string[]; end: number } | null {
  const open = text.indexOf('(', from);
  if (open < 0) return null;
  const close = findClosingParen(text, open);
  if (close < 0) return null;
  const names = parseIdentifierList(text.slice(open + 1, close));
  return names ? { names, end: close } : null;
}
