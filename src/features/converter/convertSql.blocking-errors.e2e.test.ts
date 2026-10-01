/**
 * Errores bloqueantes en la generación (spec, rama A: "Error bloqueante en el
 * script"). Si el análisis encuentra un error que impide obtener un esquema:
 *
 * - no se genera ningún fichero (ni clases ni README);
 * - la inferencia y la generación no se ejecutan (solo hay diagnósticos del análisis);
 * - cada error indica el fragmento SQL problemático y su posición;
 * - el usuario corrige el script y, con la misma configuración, se genera.
 *
 * El generador nunca emite errores: con un esquema válido, siempre genera.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic, SqlDialect } from '@/core/model';
import { PARSER_DIAGNOSTICS } from '@/core/parser';
import { convertSql, DEFAULT_CONVERSION_SETTINGS, type ConversionResult } from './convertSql';

/** Dos tablas válidas relacionadas: lo que se generaría si no hubiera errores. */
const VALID_TABLES = [
  'CREATE TABLE customer (id INT PRIMARY KEY, name VARCHAR(50));',
  'CREATE TABLE purchase_order (id INT PRIMARY KEY, customer_id INT REFERENCES customer (id));',
].join('\n');

function convert(script: string, dialect?: SqlDialect): ConversionResult {
  return convertSql(script, dialect ? { ...DEFAULT_CONVERSION_SETTINGS, dialect } : DEFAULT_CONVERSION_SETTINGS);
}

function errorsOf(result: ConversionResult): Diagnostic[] {
  return result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
}

/** Comprobaciones comunes a cualquier error bloqueante. */
function expectBlocked(result: ConversionResult): void {
  expect(result.schema).toBeNull();
  expect(result.files).toEqual([]);
  expect(errorsOf(result).length).toBeGreaterThan(0);
  // La inferencia y la generación no llegan a ejecutarse.
  expect(result.diagnostics.every((diagnostic) => diagnostic.stage === 'parser')).toBe(true);
  // Todo error indica el fragmento problemático y dónde está.
  for (const error of errorsOf(result)) {
    expect(error.fragment.trim()).not.toBe('');
    expect(error.position).toBeDefined();
  }
}

interface BlockingCase {
  readonly script: string;
  readonly dialect?: SqlDialect;
  readonly error: Pick<Diagnostic, 'code' | 'fragment' | 'position'>;
}

describe('errores bloqueantes · cada tipo de error impide generar', () => {
  it.each<[string, BlockingCase]>([
    [
      'literal sin cerrar',
      {
        script: "CREATE TABLE a (\n  name VARCHAR(10) DEFAULT 'abc\n);",
        error: { code: PARSER_DIAGNOSTICS.unterminatedString, fragment: "'abc", position: { line: 2, column: 28 } },
      },
    ],
    [
      'identificador entre comillas sin cerrar',
      {
        script: 'CREATE TABLE "order (id INT PRIMARY KEY);',
        error: {
          code: PARSER_DIAGNOSTICS.unterminatedString,
          fragment: '"order (id INT PRIMARY KEY);',
          position: { line: 1, column: 14 },
        },
      },
    ],
    [
      'comentario de bloque sin cerrar al final de un script válido',
      {
        script: `${VALID_TABLES}\n/* sin cerrar`,
        error: { code: PARSER_DIAGNOSTICS.unterminatedComment, fragment: '/* sin cerrar', position: { line: 3, column: 1 } },
      },
    ],
    [
      'paréntesis sin cerrar',
      {
        script: `CREATE TABLE a (\n  id INT\n;\n${VALID_TABLES}`,
        error: { code: PARSER_DIAGNOSTICS.unbalancedParentheses, fragment: 'CREATE TABLE a (', position: { line: 1, column: 1 } },
      },
    ],
    [
      'paréntesis de cierre sobrante',
      {
        script: `${VALID_TABLES}\nCREATE TABLE a (id INT));`,
        error: { code: PARSER_DIAGNOSTICS.unbalancedParentheses, fragment: ');', position: { line: 3, column: 24 } },
      },
    ],
    [
      'CREATE TABLE sin nombre de tabla',
      {
        script: `${VALID_TABLES}\nCREATE TABLE (id INT);`,
        error: { code: PARSER_DIAGNOSTICS.invalidCreateTable, fragment: 'CREATE TABLE (id INT)', position: { line: 3, column: 1 } },
      },
    ],
    [
      'script sin ningún CREATE TABLE',
      {
        script: 'SELECT 1;\nINSERT INTO t VALUES (1);',
        error: { code: PARSER_DIAGNOSTICS.noTables, fragment: 'SELECT 1', position: { line: 1, column: 1 } },
      },
    ],
    [
      'solo sentencias no soportadas',
      {
        script: 'CREATE VIEW v AS SELECT 1;',
        error: { code: PARSER_DIAGNOSTICS.noTables, fragment: 'CREATE VIEW v AS SELECT 1', position: { line: 1, column: 1 } },
      },
    ],
    [
      'solo CREATE TABLE … AS SELECT',
      {
        script: 'CREATE TABLE copy_of_orders AS SELECT * FROM orders;',
        dialect: 'postgresql',
        error: {
          code: PARSER_DIAGNOSTICS.noTables,
          fragment: 'CREATE TABLE copy_of_orders AS SELECT * FROM orders',
          position: { line: 1, column: 1 },
        },
      },
    ],
    [
      'solo comentarios',
      {
        script: '-- esquema pendiente\n/* nada todavía */',
        error: {
          code: PARSER_DIAGNOSTICS.noTables,
          fragment: '-- esquema pendiente\n/* nada todavía */',
          position: { line: 1, column: 1 },
        },
      },
    ],
    [
      'texto que no es SQL',
      {
        script: 'esto no es un script SQL',
        error: { code: PARSER_DIAGNOSTICS.noTables, fragment: 'esto no es un script SQL', position: { line: 1, column: 1 } },
      },
    ],
  ])('%s', (_label, { script, dialect, error }) => {
    const result = convert(script, dialect);

    expectBlocked(result);
    expect(errorsOf(result)).toEqual([{ severity: 'error', stage: 'parser', message: expect.any(String), ...error }]);
  });
});

describe('errores bloqueantes · dependen del dialecto', () => {
  it("MySQL: \\' escapa la comilla, así que el literal queda sin cerrar; en PostgreSQL el mismo script es válido", () => {
    const script = "CREATE TABLE `note` (\n  `id` INT AUTO_INCREMENT PRIMARY KEY,\n  `body` TEXT COMMENT 'acaba en barra\\'\n);";

    const mysql = convert(script);
    expect(mysql.dialect).toEqual({ dialect: 'mysql', source: 'detected' });
    expectBlocked(mysql);
    expect(errorsOf(mysql)).toMatchObject([
      { code: PARSER_DIAGNOSTICS.unterminatedString, position: { line: 3, column: 23 } },
    ]);

    const postgresql = convert(script, 'postgresql');
    expect(errorsOf(postgresql)).toEqual([]);
    expect(postgresql.files.map((file) => file.path)).toEqual([
      'src/main/java/com/example/entity/Note.java',
      'README.md',
    ]);
  });

  it('PostgreSQL: dollar quoting sin cerrar', () => {
    const result = convert('CREATE TABLE a (id SERIAL PRIMARY KEY);\nCREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END;');

    expectBlocked(result);
    expect(errorsOf(result)).toMatchObject([
      { code: PARSER_DIAGNOSTICS.unterminatedString, fragment: '$$ BEGIN RETURN 1; END;', position: { line: 2, column: 36 } },
    ]);
  });

  it("Oracle: literal q'[…]' sin cerrar", () => {
    const result = convert("CREATE TABLE a (id NUMBER(10) PRIMARY KEY);\nCOMMENT ON TABLE a IS q'[sin cerrar';", 'oracle');

    expectBlocked(result);
    expect(errorsOf(result)).toMatchObject([
      { code: PARSER_DIAGNOSTICS.unterminatedString, fragment: "q'[sin cerrar';", position: { line: 2, column: 23 } },
    ]);
  });

  it('SQLite: paréntesis sin cerrar tras un PRAGMA', () => {
    const result = convert('PRAGMA foreign_keys = ON;\nCREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT;');

    expect(result.dialect.dialect).toBe('sqlite');
    expectBlocked(result);
    expect(errorsOf(result)).toMatchObject([
      {
        code: PARSER_DIAGNOSTICS.unbalancedParentheses,
        fragment: 'CREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT;',
        position: { line: 2, column: 1 },
      },
    ]);
  });
});

describe('errores bloqueantes · comportamiento del pipeline', () => {
  it('un solo error bloquea la generación aunque el resto del script sea válido', () => {
    const valid = convert(VALID_TABLES, 'postgresql');
    const withError = convert(`${VALID_TABLES}\nCREATE TABLE (id INT);`, 'postgresql');

    expect(valid.files.length).toBeGreaterThan(0);
    expectBlocked(withError);
  });

  it('los avisos se siguen informando junto al error: el análisis no se detiene en la primera sentencia', () => {
    const result = convert(
      [VALID_TABLES, 'CREATE VIEW v AS SELECT 1;', 'CREATE TABLE (id INT);', 'CREATE TRIGGER t BEFORE INSERT ON customer FOR EACH ROW BEGIN END;'].join('\n'),
      'postgresql',
    );

    expectBlocked(result);
    expect(result.diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.code, diagnostic.position?.line])).toEqual([
      ['warning', PARSER_DIAGNOSTICS.unsupportedStatement, 3],
      ['error', PARSER_DIAGNOSTICS.invalidCreateTable, 4],
      ['warning', PARSER_DIAGNOSTICS.unsupportedStatement, 5],
    ]);
  });

  it('un error léxico detiene el análisis y se informa solo de él', () => {
    const result = convert(`CREATE VIEW v AS SELECT 1;\n${VALID_TABLES}\nCREATE TABLE b (name VARCHAR(5) DEFAULT 'x);`);

    expectBlocked(result);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([PARSER_DIAGNOSTICS.unterminatedString]);
  });

  it('al corregir el script, la misma configuración genera los ficheros (spec: vuelve al paso 2)', () => {
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      options: { ...DEFAULT_CONVERSION_SETTINGS.options, basePackage: 'org.acme.shop' },
    };
    const broken = convertSql(`${VALID_TABLES}\nCREATE TABLE (id INT);`, settings);
    const fixed = convertSql(`${VALID_TABLES}\nCREATE TABLE note (id INT PRIMARY KEY);`, settings);

    expectBlocked(broken);
    expect(errorsOf(fixed)).toEqual([]);
    expect(fixed.files.map((file) => file.path)).toEqual([
      'src/main/java/org/acme/shop/Customer.java',
      'src/main/java/org/acme/shop/PurchaseOrder.java',
      'src/main/java/org/acme/shop/Note.java',
      'README.md',
    ]);
  });

  it('el resultado bloqueado es serializable y determinista (Web Worker)', () => {
    const result = convert(`${VALID_TABLES}\n/* sin cerrar`);

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(convert(`${VALID_TABLES}\n/* sin cerrar`)).toEqual(result);
  });
});

describe('la generación nunca se bloquea con un esquema válido', () => {
  const fixtures = import.meta.glob('../../core/parser/__fixtures__/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const manualDialects: Readonly<Record<string, SqlDialect>> = { 'composite-primary-key': 'postgresql' };

  it.each(Object.entries(fixtures).map(([path, sql]) => [path.replace(/^.*\/(.+)\.sql$/, '$1'), sql] as const))(
    '%s: sin errores en ninguna etapa y con ficheros generados',
    (name, sql) => {
      const result = convert(sql, manualDialects[name]);

      expect(errorsOf(result)).toEqual([]);
      expect(result.schema).not.toBeNull();
      expect(result.files.some((file) => file.path.endsWith('.java'))).toBe(true);
      expect(result.files[result.files.length - 1]?.path).toBe('README.md');
    },
  );
});
