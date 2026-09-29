import { describe, expect, it } from 'vitest';
import { findClosingParen, scanSql, splitTopLevel } from './sqlScanner';

const scan = (sql: string, backslashEscapes = false) => scanSql(sql, { backslashEscapes });

describe('scanSql', () => {
  it('separa sentencias por `;` e ignora los `;` dentro de literales, comentarios y paréntesis', () => {
    const sql = "CREATE TABLE a (x TEXT DEFAULT ';'); -- fin; de verdad\nINSERT INTO a VALUES ('b;c');";
    const { statements, error } = scan(sql);

    expect(error).toBeUndefined();
    expect(statements.map((statement) => statement.text)).toEqual([
      "CREATE TABLE a (x TEXT DEFAULT ';')",
      "INSERT INTO a VALUES ('b;c')",
    ]);
  });

  it('el esqueleto oculta comentarios y contenido de literales conservando las posiciones', () => {
    const [statement] = scan("SELECT 'PRIMARY KEY' /* UNIQUE */ AS x").statements;

    const literal = "'PRIMARY KEY'";
    const comment = ' /* UNIQUE */ ';
    expect(statement?.skeleton).toBe(
      `SELECT '${' '.repeat(literal.length - 2)}'${' '.repeat(comment.length)}AS x`,
    );
    expect(statement?.skeleton.length).toBe(statement?.text.length);
  });

  it('respeta los escapes con barra invertida solo cuando se piden (MySQL)', () => {
    const sql = "SELECT 'it\\'s'; SELECT 2;";

    expect(scan(sql, true).statements).toHaveLength(2);
    expect(scan(sql, false).error?.kind).toBe('unterminated-string');
  });

  it('entiende el dollar quoting de PostgreSQL', () => {
    const sql = 'CREATE FUNCTION f() RETURNS int AS $body$ BEGIN RETURN 1; END; $body$ LANGUAGE plpgsql; SELECT 1;';

    expect(scan(sql).statements).toHaveLength(2);
  });

  it('salta los datos de COPY … FROM stdin y los metacomandos de psql', () => {
    const sql = "\\connect shop\nCOPY t (a) FROM stdin;\nx;'y\n\\.\nSELECT 1;";

    expect(scan(sql).statements.map((statement) => statement.text)).toEqual(['COPY t (a) FROM stdin', 'SELECT 1']);
  });

  it.each([
    ["SELECT 'abc", 'unterminated-string', 7],
    ['SELECT 1 /* abc', 'unterminated-comment', 9],
    ['SELECT (1', 'unbalanced-parentheses', 0],
    ['SELECT 1)', 'unbalanced-parentheses', 8],
  ])('detecta errores léxicos: %s', (sql, kind, start) => {
    expect(scan(sql).error).toMatchObject({ kind, start });
  });
});

describe('splitTopLevel y findClosingParen', () => {
  it('divide por comas de primer nivel sin cortar paréntesis ni identificadores entrecomillados', () => {
    const text = ' a INT, b DECIMAL(10, 2) , "c,d" TEXT ';

    expect(splitTopLevel(text).map((segment) => text.slice(segment.start, segment.end))).toEqual([
      'a INT',
      'b DECIMAL(10, 2)',
      '"c,d" TEXT',
    ]);
  });

  it('encuentra el paréntesis de cierre correspondiente', () => {
    const text = 'x (a (b) ")" c) d';

    expect(findClosingParen(text, 2)).toBe(14);
    expect(findClosingParen('(abc', 0)).toBe(-1);
  });
});
