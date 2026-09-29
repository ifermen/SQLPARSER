import { splitTopLevel } from './sqlScanner';

/** Identificador SQL: entre comillas dobles, backticks, corchetes o sin comillas. */
export const IDENTIFIER =
  '(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\\[[^\\]]+\\]|[A-Za-z_\\u00C0-\\uFFFF][\\w$\\u00C0-\\uFFFF]*)';

/** Identificador opcionalmente cualificado: `schema.tabla`, `tabla.columna`… */
export const QUALIFIED_IDENTIFIER = `${IDENTIFIER}(?:\\s*\\.\\s*${IDENTIFIER})*`;

const IDENTIFIER_PART = new RegExp(IDENTIFIER, 'g');

const LIST_ITEM = new RegExp(
  `^(${IDENTIFIER})\\s*(?:\\(\\s*\\d+\\s*\\))?(?:\\s+(?:ASC|DESC))?(?:\\s+NULLS\\s+(?:FIRST|LAST))?$`,
  'i',
);

function unquote(part: string): string {
  switch (part.charAt(0)) {
    case '"':
      return part.slice(1, -1).replace(/""/g, '"');
    case '`':
      return part.slice(1, -1).replace(/``/g, '`');
    case '[':
      return part.slice(1, -1);
    default:
      return part;
  }
}

/** Partes de un identificador cualificado, sin comillas: `public."Users"` → `['public', 'Users']`. */
export function identifierParts(raw: string): string[] {
  return (raw.match(IDENTIFIER_PART) ?? []).map(unquote);
}

/** Nombre sin comillas ni cualificador de esquema: `public."Users"` → `Users`. */
export function cleanIdentifier(raw: string): string {
  const parts = identifierParts(raw);
  return parts[parts.length - 1] ?? raw.trim();
}

/**
 * Lista de columnas de una restricción o índice (`a, b DESC, c(10)`).
 * Devuelve `null` si algún elemento es una expresión y no un nombre de columna.
 */
export function parseIdentifierList(skeleton: string): string[] | null {
  const names: string[] = [];
  for (const segment of splitTopLevel(skeleton)) {
    const identifier = LIST_ITEM.exec(skeleton.slice(segment.start, segment.end))?.[1];
    if (!identifier) return null;
    names.push(cleanIdentifier(identifier));
  }
  return names.length > 0 ? names : null;
}
