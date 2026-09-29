const BACKSLASH_ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', '0': '\0' };
const Q_QUOTE_CLOSERS: Readonly<Record<string, string>> = { '[': ']', '{': '}', '(': ')', '<': '>' };

/**
 * Lee el literal de cadena que empieza en `quoteIndex` y devuelve su contenido
 * sin escapar, o `undefined` si no hay un literal válido. Admite `'…'` y el
 * literal alternativo de Oracle `q'[…]'` (con `[]`, `{}`, `()`, `<>` u otro
 * delimitador).
 */
export function readStringLiteral(
  text: string,
  quoteIndex: number,
  backslashEscapes: boolean,
): string | undefined {
  // Prefijo de literal nacional: N'…' o nq'…'.
  if (/^[nN][qQ']/.test(text.slice(quoteIndex, quoteIndex + 2))) {
    return readStringLiteral(text, quoteIndex + 1, backslashEscapes);
  }

  const first = text.charAt(quoteIndex);
  if ((first === 'q' || first === 'Q') && text.charAt(quoteIndex + 1) === "'") {
    return readOracleQuotedLiteral(text, quoteIndex);
  }
  if (first !== "'") return undefined;

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

function readOracleQuotedLiteral(text: string, qIndex: number): string | undefined {
  const delimiter = text.charAt(qIndex + 2);
  if (!delimiter) return undefined;
  const closer = `${Q_QUOTE_CLOSERS[delimiter] ?? delimiter}'`;
  const close = text.indexOf(closer, qIndex + 3);
  return close < 0 ? undefined : text.slice(qIndex + 3, close);
}
