/**
 * Adaptador de `@khanakia/sql-schema-core`: el único fichero del proyecto que
 * importa la librería.
 *
 * Se usa para leer las definiciones de columna (nombre, tipo, nulabilidad,
 * valor por defecto y comentarios `--`). Las restricciones, los ALTER TABLE y
 * los diagnósticos los resuelve el propio parser, porque la librería pierde
 * información: separa las FK compuestas, fusiona las UNIQUE compuestas, ignora
 * los ALTER TABLE que no son FK y no informa de posiciones ni fragmentos.
 *
 * A la librería se le pasa una tabla sintética con el cuerpo original para
 * que el nombre real de la tabla (con comillas, espacios o esquema) no influya.
 */
import { parseSchema, type Column } from '@khanakia/sql-schema-core';

export interface LibraryColumn {
  readonly name: string;
  /** `null` si la librería no ha reconocido el tipo. */
  readonly type: string | null;
  readonly nullable: boolean;
  readonly defaultValue?: string;
  readonly comment?: string;
}

export interface LibraryTableBody {
  readonly columns: readonly LibraryColumn[];
  /** Comentarios `--` situados antes de la primera columna. */
  readonly comment?: string;
}

const SYNTHETIC_TABLE = '__sqlparser_table__';

/** Lee las columnas del cuerpo de un CREATE TABLE (lo que va entre paréntesis). */
export function readTableBody(body: string, backslashEscapes: boolean): LibraryTableBody | null {
  const source = backslashEscapes ? normalizeBackslashEscapes(body) : body;
  // El salto de línea evita que un comentario `--` final se coma el paréntesis de cierre.
  const [table] = parseSchema(`CREATE TABLE ${SYNTHETIC_TABLE} (${source}\n)`).tables;
  if (!table) return null;

  return {
    columns: table.columns.map(toLibraryColumn),
    ...(table.comment ? { comment: table.comment } : {}),
  };
}

/** Lee una definición de columna suelta (`ADD COLUMN …`, `MODIFY …`). */
export function readColumnDefinition(definition: string, backslashEscapes: boolean): LibraryColumn | null {
  return readTableBody(definition, backslashEscapes)?.columns[0] ?? null;
}

function toLibraryColumn(column: Column): LibraryColumn {
  return {
    name: column.name,
    type: column.type === '?' ? null : column.type,
    nullable: column.nullable,
    ...(column.default !== undefined ? { defaultValue: column.default } : {}),
    ...(column.comment ? { comment: column.comment } : {}),
  };
}

/**
 * La librería no entiende los escapes con barra invertida de MySQL (`'it\'s'`).
 * Se reescriben como comillas duplicadas (`'it''s'`), con la misma longitud.
 */
function normalizeBackslashEscapes(text: string): string {
  let result = '';
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);

    if (quote) {
      if (c === '\\') {
        result += next === quote ? quote + quote : c + next;
        i++;
        continue;
      }
      if (c === quote) quote = null;
      result += c;
      continue;
    }

    if ((c === '-' && next === '-') || c === '#') {
      const stop = text.indexOf('\n', i);
      const end = stop < 0 ? text.length : stop;
      result += text.slice(i, end);
      i = end - 1;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    result += c;
  }
  return result;
}
