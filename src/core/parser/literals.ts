const BACKSLASH_ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', '0': '\0' };

/**
 * Lee el literal de cadena que empieza en `quoteIndex` (comilla simple) y
 * devuelve su contenido sin escapar, o `undefined` si no hay un literal válido.
 */
export function readStringLiteral(
  text: string,
  quoteIndex: number,
  backslashEscapes: boolean,
): string | undefined {
  if (text.charAt(quoteIndex) !== "'") return undefined;

  let value = '';
  for (let i = quoteIndex + 1; i < text.length; i++) {
    const c = text.charAt(i);
    if (backslashEscapes && c === '\\') {
      const next = text.charAt(i + 1);
      value += BACKSLASH_ESCAPES[next] ?? next;
      i++;
      continue;
    }
    if (c === "'") {
      if (text.charAt(i + 1) === "'") {
        value += "'";
        i++;
        continue;
      }
      return value;
    }
    value += c;
  }
  return undefined;
}
