/**
 * Escáner léxico mínimo: separa el script en sentencias conservando sus
 * posiciones y genera un "esqueleto" del texto (comentarios y contenido de los
 * literales sustituidos por espacios) sobre el que se buscan palabras clave sin
 * falsos positivos. El esqueleto tiene exactamente las mismas posiciones que el
 * original, así que cualquier offset sirve para ambos.
 */

export interface Statement {
  /** Offset del primer carácter de código de la sentencia. */
  readonly start: number;
  /** Offset tras el último carácter de código (sin incluir el `;`). */
  readonly end: number;
  /** Texto original, con comentarios y literales. */
  readonly text: string;
  /** Esqueleto de `text`. */
  readonly skeleton: string;
}

export type ScanErrorKind = 'unterminated-string' | 'unterminated-comment' | 'unbalanced-parentheses';

export interface ScanError {
  readonly kind: ScanErrorKind;
  readonly start: number;
  readonly end: number;
}

export interface ScanResult {
  readonly statements: readonly Statement[];
  readonly error?: ScanError;
}

export interface ScanOptions {
  /** `\'` escapa la comilla dentro de un literal (MySQL). */
  readonly backslashEscapes: boolean;
  /** `#` inicia un comentario de línea (MySQL). En Oracle es parte de los identificadores. */
  readonly hashComments: boolean;
  /**
   * Sintaxis de Oracle / SQL*Plus: `/` en su propia línea termina la sentencia,
   * los bloques PL/SQL no terminan en `;`, los comandos de SQL*Plus se omiten
   * y los literales `q'[…]'` son cadenas.
   */
  readonly oracle: boolean;
}

/** Tramo `[start, end)` dentro de un texto. */
export interface Segment {
  readonly start: number;
  readonly end: number;
}

const DOLLAR_QUOTE = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;
const COPY_FROM_STDIN = /^COPY\b[\s\S]*\bFROM\s+STDIN\b/i;
const COPY_DATA_END = /^\\\.[ \t]*\r?$/m;
/** Bloques PL/SQL: sus `;` internos no terminan la sentencia; la termina una `/`. */
const PLSQL_BLOCK =
  /^(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:TRIGGER|PROCEDURE|FUNCTION|PACKAGE|TYPE|LIBRARY)\b|DECLARE\b|BEGIN\b)/i;
const SQLPLUS_TERMINATOR = /^\/\s*$/;
/** Comandos de SQL*Plus: ocupan una línea y no llevan `;`. */
const SQLPLUS_COMMAND =
  /^(?:@@?|(?:REM(?:ARK)?|PRO(?:MPT)?|SET|SPO(?:OL)?|WHENEVER|SHO(?:W)?|EXIT|QUIT|CONN(?:ECT)?|DEF(?:INE)?|UNDEF(?:INE)?|COL(?:UMN)?|TTITLE|BTITLE|EXEC(?:UTE)?)\b)/i;
const Q_QUOTE_CLOSERS: Readonly<Record<string, string>> = { '[': ']', '{': '}', '(': ')', '<': '>' };

export function scanSql(input: string, options: ScanOptions): ScanResult {
  const length = input.length;
  const skeleton = input.split('');
  const statements: Statement[] = [];
  const openParens: number[] = [];
  let start = -1;
  let end = -1;
  let atLineStart = true;
  let i = 0;

  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) {
      if (skeleton[k] !== '\n' && skeleton[k] !== '\r') skeleton[k] = ' ';
    }
  };
  const lineEnd = (from: number) => {
    const index = input.indexOf('\n', from);
    return index < 0 ? length : index;
  };
  const fail = (kind: ScanErrorKind, from: number): ScanResult => ({
    statements,
    error: { kind, start: from, end: lineEnd(from) },
  });
  const pushStatement = () => {
    if (start >= 0) {
      statements.push({
        start,
        end,
        text: input.slice(start, end),
        skeleton: skeleton.slice(start, end).join(''),
      });
    }
    start = -1;
  };

  while (i < length) {
    const c = input.charAt(i);
    const next = input.charAt(i + 1);

    if (c === '\n') {
      atLineStart = true;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }

    // Comentarios de línea y metacomandos de psql (`\connect`, `\.`…).
    if ((c === '-' && next === '-') || (c === '#' && options.hashComments) || (c === '\\' && atLineStart)) {
      const stop = lineEnd(i);
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const close = input.indexOf('*/', i + 2);
      if (close < 0) return fail('unterminated-comment', i);
      blank(i, close + 2);
      i = close + 2;
      continue;
    }

    if (options.oracle && atLineStart) {
      const line = input.slice(i, lineEnd(i));
      if (SQLPLUS_TERMINATOR.test(line)) {
        pushStatement();
        blank(i, i + line.length);
        i += line.length;
        continue;
      }
      if (start < 0 && SQLPLUS_COMMAND.test(line)) {
        blank(i, i + line.length);
        i += line.length;
        continue;
      }
    }

    atLineStart = false;
    if (start < 0) {
      if (c === ';') {
        i++;
        continue;
      }
      start = i;
    }

    if (options.oracle && isOracleQQuote(input, i)) {
      // q'[…]' (o nq'[…]'): el literal termina en el delimitador de cierre seguido de comilla.
      const delimiter = input.charAt(i + 2);
      const close = input.indexOf(`${Q_QUOTE_CLOSERS[delimiter] ?? delimiter}'`, i + 3);
      if (close < 0) return fail('unterminated-string', i);
      blank(i + 3, close);
      i = close + 2;
      end = i;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      const close = findQuoteEnd(input, i, c, options.backslashEscapes && c !== '`');
      if (close < 0) return fail('unterminated-string', i);
      if (c === "'") blank(i + 1, close - 1);
      i = close;
      end = i;
      continue;
    }

    if (c === '$' && !isIdentifierChar(input.charAt(i - 1))) {
      DOLLAR_QUOTE.lastIndex = i;
      const tag = DOLLAR_QUOTE.exec(input)?.[0];
      if (tag) {
        const close = input.indexOf(tag, i + tag.length);
        if (close < 0) return fail('unterminated-string', i);
        blank(i + tag.length, close);
        i = close + tag.length;
        end = i;
        continue;
      }
    }

    if (c === '(') {
      openParens.push(i);
    } else if (c === ')') {
      if (openParens.pop() === undefined) return fail('unbalanced-parentheses', i);
    } else if (c === ';' && openParens.length === 0) {
      if (options.oracle && PLSQL_BLOCK.test(skeleton.slice(start, Math.min(i, start + 200)).join(''))) {
        i++;
        end = i;
        continue;
      }
      pushStatement();
      i++;
      const last = statements[statements.length - 1];
      if (last && COPY_FROM_STDIN.test(last.skeleton)) {
        // Los datos de `COPY … FROM stdin` (pg_dump) no son SQL: se saltan hasta `\.`.
        const terminator = COPY_DATA_END.exec(input.slice(i));
        const stop = terminator ? i + terminator.index + terminator[0].length : length;
        blank(i, stop);
        i = stop;
      }
      continue;
    }

    i++;
    end = i;
  }

  if (openParens.length > 0) {
    const unclosed = openParens[openParens.length - 1] ?? 0;
    return {
      statements,
      error: {
        kind: 'unbalanced-parentheses',
        start: start >= 0 ? start : unclosed,
        end: lineEnd(unclosed),
      },
    };
  }
  pushStatement();
  return { statements };
}

function findQuoteEnd(input: string, open: number, quote: string, backslashEscapes: boolean): number {
  for (let k = open + 1; k < input.length; k++) {
    const c = input.charAt(k);
    if (backslashEscapes && c === '\\') {
      k++;
      continue;
    }
    if (c === quote) {
      if (input.charAt(k + 1) === quote) {
        k++;
        continue;
      }
      return k + 1;
    }
  }
  return -1;
}

function isIdentifierChar(c: string): boolean {
  return /[A-Za-z0-9_$#]/.test(c);
}

/** `q'<delim>…<delim>'` o `nq'…'` de Oracle, que no forme parte de un identificador. */
function isOracleQQuote(input: string, index: number): boolean {
  const c = input.charAt(index);
  if ((c !== 'q' && c !== 'Q') || input.charAt(index + 1) !== "'" || input.length < index + 3) return false;
  const previous = input.charAt(index - 1);
  if (previous === 'n' || previous === 'N') return !isIdentifierChar(input.charAt(index - 2));
  return !isIdentifierChar(previous);
}

/** Salta un identificador o literal entrecomillado en un esqueleto. */
function skipQuoted(skeleton: string, index: number): number {
  const quote = skeleton.charAt(index);
  const close = skeleton.indexOf(quote, index + 1);
  return close < 0 ? skeleton.length : close + 1;
}

function isQuote(c: string): boolean {
  return c === "'" || c === '"' || c === '`';
}

/** Índice del `)` que cierra el `(` situado en `open`, o -1 si no se cierra. */
export function findClosingParen(skeleton: string, open: number): number {
  let depth = 0;
  for (let i = open; i < skeleton.length; ) {
    const c = skeleton.charAt(i);
    if (isQuote(c)) {
      i = skipQuoted(skeleton, i);
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
    i++;
  }
  return -1;
}

/**
 * Divide `skeleton[from, to)` por las comas de primer nivel (fuera de
 * paréntesis y comillas). Los tramos devueltos no incluyen espacios en los
 * extremos y sus offsets son relativos a `skeleton`.
 */
export function splitTopLevel(skeleton: string, from = 0, to = skeleton.length): Segment[] {
  const segments: Segment[] = [];
  let depth = 0;
  let segmentStart = from;

  const push = (start: number, end: number) => {
    while (start < end && /\s/.test(skeleton.charAt(start))) start++;
    while (end > start && /\s/.test(skeleton.charAt(end - 1))) end--;
    if (start < end) segments.push({ start, end });
  };

  for (let i = from; i < to; ) {
    const c = skeleton.charAt(i);
    if (isQuote(c)) {
      i = skipQuoted(skeleton, i);
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      push(segmentStart, i);
      segmentStart = i + 1;
    }
    i++;
  }
  push(segmentStart, to);
  return segments;
}
