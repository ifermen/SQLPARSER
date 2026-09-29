import { describe, expect, it } from 'vitest';
import { findClosingParen, scanSql, splitTopLevel } from './sqlScanner';

const scan = (sql: string, backslashEscapes = false) =>
  scanSql(sql, { backslashEscapes, hashComments: true, oracle: false });
const scanOracle = (sql: string) => scanSql(sql, { backslashEscapes: false, hashComments: false, oracle: true });

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

describe('scanSql · sintaxis de Oracle / SQL*Plus', () => {
  it('una / sola en su línea termina la sentencia', () => {
    const { statements } = scanOracle('CREATE TABLE a (id NUMBER)\n/\nCREATE TABLE b (id NUMBER)\n  /  \n');

    expect(statements.map((statement) => statement.text)).toEqual([
      'CREATE TABLE a (id NUMBER)',
      'CREATE TABLE b (id NUMBER)',
    ]);
  });

  it('los bloques PL/SQL no terminan en sus ; internos', () => {
    const sql = [
      'CREATE OR REPLACE TRIGGER t_bi BEFORE INSERT ON t FOR EACH ROW',
      'BEGIN',
      '  :NEW.id := t_seq.NEXTVAL;',
      'END;',
      '/',
      'DECLARE x NUMBER; BEGIN x := 1; END;',
      '/',
      'SELECT 1 FROM dual;',
    ].join('\n');

    expect(scanOracle(sql).statements.map((statement) => statement.text.split('\n')[0])).toEqual([
      'CREATE OR REPLACE TRIGGER t_bi BEFORE INSERT ON t FOR EACH ROW',
      'DECLARE x NUMBER; BEGIN x := 1; END;',
      'SELECT 1 FROM dual',
    ]);
  });

  it('omite los comandos de SQL*Plus que no llevan ;', () => {
    const sql = 'SET DEFINE OFF\nREM comentario\nPROMPT Creando tablas\n@otro_script.sql\nCREATE TABLE a (id NUMBER);\nEXIT';

    expect(scanOracle(sql).statements.map((statement) => statement.text)).toEqual(['CREATE TABLE a (id NUMBER)']);
  });

  it("los literales q'[…]' pueden contener comillas y ; sin cortar la sentencia", () => {
    const [statement, next] = scanOracle("COMMENT ON TABLE a IS q'[it's; ok]';\nSELECT 1 FROM dual;").statements;

    expect(statement?.text).toBe("COMMENT ON TABLE a IS q'[it's; ok]'");
    expect(statement?.skeleton).toBe(`COMMENT ON TABLE a IS q'[${' '.repeat("it's; ok".length)}]'`);
    expect(next?.text).toBe('SELECT 1 FROM dual');
  });

  it('# forma parte de los identificadores, no es un comentario', () => {
    const [statement] = scanOracle('CREATE TABLE a (order# NUMBER);').statements;

    expect(statement?.skeleton).toBe('CREATE TABLE a (order# NUMBER)');
    expect(scan('CREATE TABLE a (id INT) # comentario').statements[0]?.text).toBe('CREATE TABLE a (id INT)');
  });

  it('fuera de Oracle, la / no termina sentencias', () => {
    expect(scan('SELECT 1\n/\nSELECT 2;').statements).toHaveLength(1);
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
