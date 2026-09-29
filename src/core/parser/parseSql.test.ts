import { describe, expect, it } from 'vitest';
import type { Column, Diagnostic, SchemaModel, Table } from '@/core/model';
import associationEntitySql from './__fixtures__/association-entity.sql?raw';
import compositePrimaryKeySql from './__fixtures__/composite-primary-key.sql?raw';
import joinTableSql from './__fixtures__/join-table.sql?raw';
import manyToOneSql from './__fixtures__/many-to-one.sql?raw';
import mysqlDumpSql from './__fixtures__/mysql-dump.sql?raw';
import oneToOneSql from './__fixtures__/one-to-one.sql?raw';
import postgresDumpSql from './__fixtures__/postgres-dump.sql?raw';
import singleTableSql from './__fixtures__/single-table.sql?raw';
import { PARSER_DIAGNOSTICS, parseSql, type ParseResult } from './index';

function tableOf(result: ParseResult, name: string): Table {
  const table = result.schema?.tables.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`La tabla "${name}" no está en el esquema`);
  return table;
}

function columnOf(table: Table, name: string): Column {
  const column = table.columns.find((candidate) => candidate.name === name);
  if (!column) throw new Error(`La columna "${name}" no está en la tabla "${table.name}"`);
  return column;
}

function codesOf(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

describe('parseSql · criterios de aceptación de US-01', () => {
  it('criterio 1: tabla sin relaciones con tipos, nulabilidad, valores por defecto y comentarios', () => {
    const result = parseSql(singleTableSql);

    expect(result.dialect).toEqual({ dialect: 'postgresql', source: 'detected' });
    expect(result.diagnostics).toEqual([]);
    expect(result.schema).toEqual<SchemaModel>({
      dialect: 'postgresql',
      tables: [
        {
          name: 'product',
          comment: 'Productos del catálogo',
          columns: [
            {
              name: 'id',
              type: { raw: 'BIGSERIAL', name: 'BIGSERIAL', logical: 'bigint' },
              nullable: false,
              autoIncrement: true,
            },
            {
              name: 'sku',
              type: { raw: 'VARCHAR(32)', name: 'VARCHAR', logical: 'string', length: 32 },
              nullable: false,
              autoIncrement: false,
              comment: 'Código interno de producto',
            },
            {
              name: 'name',
              type: { raw: 'VARCHAR(255)', name: 'VARCHAR', logical: 'string', length: 255 },
              nullable: false,
              autoIncrement: false,
              comment: 'Nombre comercial',
            },
            {
              name: 'description',
              type: { raw: 'TEXT', name: 'TEXT', logical: 'text' },
              nullable: true,
              autoIncrement: false,
            },
            {
              name: 'price',
              type: { raw: 'NUMERIC(10, 2)', name: 'NUMERIC', logical: 'decimal', precision: 10, scale: 2 },
              nullable: false,
              autoIncrement: false,
              defaultValue: '0.00',
            },
            {
              name: 'active',
              type: { raw: 'BOOLEAN', name: 'BOOLEAN', logical: 'boolean' },
              nullable: false,
              autoIncrement: false,
              defaultValue: 'TRUE',
            },
            {
              name: 'created_at',
              type: {
                raw: 'TIMESTAMP WITH TIME ZONE',
                name: 'TIMESTAMP WITH TIME ZONE',
                logical: 'datetime-tz',
              },
              nullable: false,
              autoIncrement: false,
              defaultValue: 'now()',
            },
          ],
          primaryKey: { columns: ['id'] },
          foreignKeys: [],
          uniqueConstraints: [{ columns: ['sku'] }],
        },
      ],
    });
  });

  it('criterio 2: dos tablas relacionadas por una FK', () => {
    const result = parseSql(manyToOneSql);

    expect(result.dialect).toEqual({ dialect: 'mysql', source: 'detected' });
    expect(result.diagnostics).toEqual([]);
    expect(result.schema).toEqual<SchemaModel>({
      dialect: 'mysql',
      tables: [
        {
          name: 'customer',
          comment: 'Clientes de la tienda',
          columns: [
            {
              name: 'id',
              type: { raw: 'INT', name: 'INT', logical: 'integer' },
              nullable: false,
              autoIncrement: true,
            },
            {
              name: 'email',
              type: { raw: 'VARCHAR(255)', name: 'VARCHAR', logical: 'string', length: 255 },
              nullable: false,
              autoIncrement: false,
            },
          ],
          primaryKey: { columns: ['id'] },
          foreignKeys: [],
          uniqueConstraints: [{ name: 'uk_customer_email', columns: ['email'] }],
        },
        {
          name: 'purchase_order',
          columns: [
            {
              name: 'id',
              type: { raw: 'INT', name: 'INT', logical: 'integer' },
              nullable: false,
              autoIncrement: true,
            },
            {
              name: 'customer_id',
              type: { raw: 'INT', name: 'INT', logical: 'integer' },
              nullable: false,
              autoIncrement: false,
              comment: 'Cliente que realiza el pedido',
            },
            {
              name: 'status',
              type: {
                raw: "ENUM('NEW','PAID','SHIPPED')",
                name: 'ENUM',
                logical: 'enum',
                enumValues: ['NEW', 'PAID', 'SHIPPED'],
              },
              nullable: false,
              autoIncrement: false,
              defaultValue: "'NEW'",
            },
            {
              name: 'total',
              type: {
                raw: 'DECIMAL(12,2) UNSIGNED',
                name: 'DECIMAL',
                logical: 'decimal',
                precision: 12,
                scale: 2,
              },
              nullable: true,
              autoIncrement: false,
            },
          ],
          primaryKey: { columns: ['id'] },
          foreignKeys: [
            {
              name: 'fk_order_customer',
              columns: ['customer_id'],
              referencedTable: 'customer',
              referencedColumns: ['id'],
            },
          ],
          // El índice no único `KEY idx_order_customer` no forma parte del modelo.
          uniqueConstraints: [],
        },
      ],
    });
  });

  it('criterio 3: uno a uno por FK con UNIQUE y por PK compartida', () => {
    const result = parseSql(oneToOneSql);

    expect(result.diagnostics).toEqual([]);

    const settings = tableOf(result, 'user_settings');
    expect(settings.foreignKeys).toEqual([
      { columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'] },
    ]);
    expect(settings.uniqueConstraints).toEqual([{ columns: ['user_id'] }]);

    const profile = tableOf(result, 'user_profile');
    expect(profile.primaryKey).toEqual({ columns: ['user_id'] });
    // `REFERENCES users` sin columnas se resuelve a la PK de `users`.
    expect(profile.foreignKeys).toEqual([
      { columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'] },
    ]);

    // GENERATED … AS IDENTITY se reconoce como autoincremento.
    expect(columnOf(tableOf(result, 'users'), 'id').autoIncrement).toBe(true);
  });

  it('criterio 4: tabla intermedia pura con PK compuesta por dos FK', () => {
    const result = parseSql(joinTableSql);

    expect(result.dialect).toEqual({ dialect: 'sqlite', source: 'detected' });
    expect(result.diagnostics).toEqual([]);
    expect(tableOf(result, 'student_course')).toEqual<Table>({
      name: 'student_course',
      columns: [
        {
          name: 'student_id',
          type: { raw: 'INTEGER', name: 'INTEGER', logical: 'integer' },
          nullable: false,
          autoIncrement: false,
        },
        {
          name: 'course_id',
          type: { raw: 'INTEGER', name: 'INTEGER', logical: 'integer' },
          nullable: false,
          autoIncrement: false,
        },
      ],
      primaryKey: { columns: ['student_id', 'course_id'] },
      foreignKeys: [
        { columns: ['student_id'], referencedTable: 'student', referencedColumns: ['id'] },
        { columns: ['course_id'], referencedTable: 'course', referencedColumns: ['id'] },
      ],
      uniqueConstraints: [],
    });

    // En SQLite, INTEGER PRIMARY KEY es alias de rowid; AUTOINCREMENT, explícito.
    expect(columnOf(tableOf(result, 'student'), 'id').autoIncrement).toBe(true);
    expect(columnOf(tableOf(result, 'course'), 'id').autoIncrement).toBe(true);
  });

  it('criterio 5: tabla intermedia con atributos propios definida con ALTER TABLE', () => {
    const result = parseSql(associationEntitySql);

    expect(result.dialect).toEqual({ dialect: 'mysql', source: 'detected' });
    expect(result.diagnostics).toEqual([]);

    const bookAuthor = tableOf(result, 'book_author');
    expect(bookAuthor.primaryKey).toEqual({ columns: ['book_id', 'author_id'] });
    expect(bookAuthor.foreignKeys).toEqual([
      { name: 'fk_ba_book', columns: ['book_id'], referencedTable: 'book', referencedColumns: ['id'] },
      { name: 'fk_ba_author', columns: ['author_id'], referencedTable: 'author', referencedColumns: ['id'] },
    ]);
    expect(bookAuthor.columns.map((column) => column.name)).toEqual([
      'book_id',
      'author_id',
      'author_order',
      'royalty_pct',
    ]);
    expect(columnOf(bookAuthor, 'author_order')).toEqual<Column>({
      name: 'author_order',
      type: { raw: 'tinyint(4)', name: 'TINYINT', logical: 'smallint' },
      nullable: false,
      autoIncrement: false,
      defaultValue: '1',
    });
    // `DEFAULT NULL` no es un valor por defecto real.
    expect(columnOf(bookAuthor, 'royalty_pct')).not.toHaveProperty('defaultValue');

    // `MODIFY … AUTO_INCREMENT` actualiza la columna ya definida.
    expect(tableOf(result, 'author').primaryKey).toEqual({ columns: ['id'] });
    expect(columnOf(tableOf(result, 'author'), 'id').autoIncrement).toBe(true);
    expect(columnOf(tableOf(result, 'book'), 'id').autoIncrement).toBe(true);
  });

  it('criterio 6: claves primarias compuestas con FK y UNIQUE compuestas', () => {
    const result = parseSql(compositePrimaryKeySql, { dialect: 'postgresql' });

    expect(result.dialect).toEqual({ dialect: 'postgresql', source: 'manual' });
    expect(result.diagnostics).toEqual([]);

    expect(tableOf(result, 'warehouse').primaryKey).toEqual({
      name: 'pk_warehouse',
      columns: ['country_code', 'code'],
    });

    const stockItem = tableOf(result, 'stock_item');
    expect(stockItem.primaryKey).toEqual({
      name: 'pk_stock_item',
      columns: ['country_code', 'warehouse_code', 'sku'],
    });
    // La FK compuesta se conserva como una sola FK de dos columnas.
    expect(stockItem.foreignKeys).toEqual([
      {
        name: 'fk_stock_warehouse',
        columns: ['country_code', 'warehouse_code'],
        referencedTable: 'warehouse',
        referencedColumns: ['country_code', 'code'],
      },
    ]);
    // La UNIQUE compuesta no se convierte en dos UNIQUE de una columna.
    expect(stockItem.uniqueConstraints).toEqual([{ name: 'uq_stock_batch', columns: ['sku', 'batch'] }]);
  });
});

describe('parseSql · volcados reales', () => {
  it('mysqldump: comentarios condicionales, datos, escapes con barra invertida y triggers', () => {
    const result = parseSql(mysqlDumpSql);

    expect(result.dialect).toEqual({ dialect: 'mysql', source: 'detected' });
    expect(result.schema?.tables.map((table) => table.name)).toEqual(['category', 'product']);
    // DROP, LOCK, INSERT, SET… se omiten sin aviso; el trigger no está soportado.
    expect(result.diagnostics).toEqual<Diagnostic[]>([
      {
        severity: 'warning',
        stage: 'parser',
        code: PARSER_DIAGNOSTICS.unsupportedStatement,
        message: 'Sentencia no soportada; se ignora.',
        fragment:
          'CREATE TRIGGER `product_bi` BEFORE INSERT ON `product` FOR EACH ROW BEGIN SET NEW.sku = UPPER(NEW.sku)',
        position: { line: 49, column: 1 },
      },
    ]);

    const category = tableOf(result, 'category');
    expect(category.comment).toBe('Árbol de categorías');
    expect(columnOf(category, 'name').comment).toBe("Nombre visible; admite 'comillas'");
    expect(columnOf(category, 'is_visible').type.logical).toBe('boolean');
    // Un INT sin signo no cabe en un entero con signo de 32 bits.
    expect(columnOf(category, 'id').type).toEqual({ raw: 'int unsigned', name: 'INT', logical: 'bigint' });
    expect(category.foreignKeys).toEqual([
      {
        name: 'fk_category_parent',
        columns: ['parent_id'],
        referencedTable: 'category',
        referencedColumns: ['id'],
      },
    ]);

    const product = tableOf(result, 'product');
    expect(product.columns.map((column) => [column.name, column.type.logical, column.nullable])).toEqual([
      ['id', 'bigint', false],
      ['category_id', 'bigint', false],
      ['sku', 'string', false],
      ['price', 'decimal', false],
      ['weight', 'float', true],
      ['created_at', 'datetime', false],
      ['updated_at', 'datetime', true],
      ['payload', 'json', true],
    ]);
    expect(columnOf(product, 'created_at').defaultValue).toBe('CURRENT_TIMESTAMP');
    expect(product.uniqueConstraints).toEqual([{ name: 'uk_product_sku', columns: ['sku'] }]);
  });

  it('pg_dump: esquemas, secuencias, COPY, índices únicos, comentarios y sentencias no soportadas', () => {
    const result = parseSql(postgresDumpSql);

    expect(result.dialect).toEqual({ dialect: 'postgresql', source: 'detected' });
    expect(result.schema?.tables.map((table) => table.name)).toEqual(['author', 'post']);
    expect(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.position?.line, diagnostic.location]),
    ).toEqual([
      [PARSER_DIAGNOSTICS.unsupportedStatement, 11, undefined], // CREATE TYPE
      [PARSER_DIAGNOSTICS.unsupportedStatement, 16, undefined], // CREATE FUNCTION
      [PARSER_DIAGNOSTICS.unknownColumnType, 48, { table: 'post', column: 'status' }],
      [PARSER_DIAGNOSTICS.unknownColumnType, 49, { table: 'post', column: 'tags' }],
      [PARSER_DIAGNOSTICS.unsupportedStatement, 55, undefined], // CREATE VIEW
      [PARSER_DIAGNOSTICS.unsupportedIndex, 83, undefined], // índice sobre expresión
      [PARSER_DIAGNOSTICS.unsupportedStatement, 88, undefined], // CREATE TRIGGER
    ]);
    expect(result.diagnostics.every((diagnostic) => diagnostic.severity === 'warning')).toBe(true);

    const author = tableOf(result, 'author');
    expect(author.primaryKey).toEqual({ name: 'author_pkey', columns: ['id'] });
    // `ALTER COLUMN … SET DEFAULT nextval(…)` equivale a un SERIAL.
    expect(columnOf(author, 'id')).toEqual<Column>({
      name: 'id',
      type: { raw: 'integer', name: 'INTEGER', logical: 'integer' },
      nullable: false,
      autoIncrement: true,
      defaultValue: "nextval('public.author_id_seq'::regclass)",
    });
    expect(columnOf(author, 'email').type).toEqual({
      raw: 'character varying(255)',
      name: 'CHARACTER VARYING',
      logical: 'string',
      length: 255,
    });
    expect(columnOf(author, 'external_id').type.logical).toBe('uuid');
    // CREATE UNIQUE INDEX se modela como restricción UNIQUE.
    expect(author.uniqueConstraints).toEqual([{ name: 'author_email_key', columns: ['email'] }]);

    const post = tableOf(result, 'post');
    expect(post.comment).toBe('Entradas del blog');
    expect(columnOf(post, 'title').comment).toBe('Título visible');
    expect(columnOf(post, 'id').autoIncrement).toBe(true);
    expect(columnOf(post, 'published_at').type).toEqual({
      raw: 'timestamp(6) with time zone',
      name: 'TIMESTAMP WITH TIME ZONE',
      logical: 'datetime-tz',
    });
    expect(columnOf(post, 'updated_at').type.logical).toBe('datetime');
    expect(columnOf(post, 'metadata').type.logical).toBe('json');
    expect(columnOf(post, 'status').type).toEqual({
      raw: 'public.post_status',
      name: 'PUBLIC.POST_STATUS',
      logical: 'unknown',
    });
    expect(post.foreignKeys).toEqual([
      { name: 'post_author_fk', columns: ['author_id'], referencedTable: 'author', referencedColumns: ['id'] },
    ]);
  });
});

describe('parseSql · errores (el análisis no produce esquema)', () => {
  it('literal sin cerrar', () => {
    const result = parseSql("CREATE TABLE t (\n  name VARCHAR(10) DEFAULT 'abc\n);");

    expect(result.schema).toBeNull();
    expect(result.diagnostics).toEqual<Diagnostic[]>([
      {
        severity: 'error',
        stage: 'parser',
        code: PARSER_DIAGNOSTICS.unterminatedString,
        message: 'Literal o identificador entrecomillado sin cerrar.',
        fragment: "'abc",
        position: { line: 2, column: 28 },
      },
    ]);
  });

  it('comentario de bloque sin cerrar', () => {
    const result = parseSql('CREATE TABLE t (id INT);\n/* sin cerrar');

    expect(result.schema).toBeNull();
    expect(codesOf(result.diagnostics)).toEqual([PARSER_DIAGNOSTICS.unterminatedComment]);
    expect(result.diagnostics[0]?.position).toEqual({ line: 2, column: 1 });
  });

  it('paréntesis sin cerrar', () => {
    const result = parseSql('CREATE TABLE t (\n  id INT\n;\nCREATE TABLE u (id INT);');

    expect(result.schema).toBeNull();
    expect(result.diagnostics).toMatchObject([
      {
        severity: 'error',
        code: PARSER_DIAGNOSTICS.unbalancedParentheses,
        fragment: 'CREATE TABLE t (',
        position: { line: 1, column: 1 },
      },
    ]);
  });

  it('paréntesis de cierre sobrante', () => {
    const result = parseSql('CREATE TABLE t (id INT));');

    expect(result.schema).toBeNull();
    expect(result.diagnostics).toMatchObject([
      { severity: 'error', code: PARSER_DIAGNOSTICS.unbalancedParentheses, position: { line: 1, column: 24 } },
    ]);
  });

  it('script sin ningún CREATE TABLE', () => {
    const result = parseSql('SELECT 1;');

    expect(result.schema).toBeNull();
    expect(result.diagnostics).toMatchObject([
      { severity: 'warning', code: PARSER_DIAGNOSTICS.dialectNotDetected },
      { severity: 'error', code: PARSER_DIAGNOSTICS.noTables, fragment: 'SELECT 1' },
    ]);
  });

  it('texto que no es SQL', () => {
    const result = parseSql('esto no es un script SQL');

    expect(result.schema).toBeNull();
    expect(codesOf(result.diagnostics)).toEqual([
      PARSER_DIAGNOSTICS.dialectNotDetected,
      PARSER_DIAGNOSTICS.unsupportedStatement,
      PARSER_DIAGNOSTICS.noTables,
    ]);
  });

  it('script solo con comentarios', () => {
    const result = parseSql('-- nada que analizar\n/* tampoco aquí */');

    expect(result.schema).toBeNull();
    expect(result.diagnostics).toMatchObject([{ severity: 'error', code: PARSER_DIAGNOSTICS.noTables }]);
  });

  it('script vacío: sin esquema y sin diagnósticos', () => {
    expect(parseSql('   \n\t')).toEqual<ParseResult>({
      schema: null,
      dialect: { dialect: null, source: 'detected' },
      diagnostics: [],
    });
  });
});

describe('parseSql · avisos (el análisis continúa)', () => {
  const twoTablesWithView = [
    'CREATE TABLE a (id INT PRIMARY KEY);',
    'CREATE VIEW v AS SELECT id FROM a;',
    'CREATE TABLE b (id INT PRIMARY KEY, a_id INT REFERENCES a (id));',
  ].join('\n');

  it('una sentencia no soportada no interrumpe el análisis del resto', () => {
    const result = parseSql(twoTablesWithView);

    expect(result.schema?.tables.map((table) => table.name)).toEqual(['a', 'b']);
    expect(tableOf(result, 'b').foreignKeys).toEqual([
      { columns: ['a_id'], referencedTable: 'a', referencedColumns: ['id'] },
    ]);
    expect(result.diagnostics).toEqual<Diagnostic[]>([
      {
        severity: 'warning',
        stage: 'parser',
        code: PARSER_DIAGNOSTICS.dialectNotDetected,
        message:
          'No se ha podido detectar el dialecto SQL; se analiza con reglas genéricas. Puedes indicarlo manualmente.',
        fragment: 'CREATE TABLE a (id INT PRIMARY KEY)',
        position: { line: 1, column: 1 },
      },
      {
        severity: 'warning',
        stage: 'parser',
        code: PARSER_DIAGNOSTICS.unsupportedStatement,
        message: 'Sentencia no soportada; se ignora.',
        fragment: 'CREATE VIEW v AS SELECT id FROM a',
        position: { line: 2, column: 1 },
      },
    ]);
  });

  it('el dialecto indicado manualmente evita el aviso de detección', () => {
    const result = parseSql(twoTablesWithView, { dialect: 'mysql' });

    expect(result.dialect).toEqual({ dialect: 'mysql', source: 'manual' });
    expect(result.schema?.dialect).toBe('mysql');
    expect(codesOf(result.diagnostics)).toEqual([PARSER_DIAGNOSTICS.unsupportedStatement]);
  });

  it('CREATE TABLE … AS SELECT no está soportado', () => {
    const result = parseSql('CREATE TABLE a (id INT);\nCREATE TABLE b AS SELECT * FROM a;', {
      dialect: 'postgresql',
    });

    expect(result.schema?.tables.map((table) => table.name)).toEqual(['a']);
    expect(result.diagnostics).toMatchObject([
      {
        code: PARSER_DIAGNOSTICS.unsupportedStatement,
        location: { table: 'b' },
        position: { line: 2, column: 1 },
      },
    ]);
  });

  it('columnas que no se pueden interpretar y tipos desconocidos', () => {
    const result = parseSql(
      'CREATE TABLE place (\n  id INTEGER PRIMARY KEY,\n  anything,\n  area GEOMETRY\n);',
      { dialect: 'sqlite' },
    );

    expect(tableOf(result, 'place').columns.map((column) => [column.name, column.type.logical])).toEqual([
      ['id', 'integer'],
      ['area', 'unknown'],
    ]);
    expect(result.diagnostics).toMatchObject([
      {
        severity: 'warning',
        code: PARSER_DIAGNOSTICS.unreadableColumn,
        fragment: 'anything',
        position: { line: 3, column: 3 },
        location: { table: 'place' },
      },
      {
        severity: 'warning',
        code: PARSER_DIAGNOSTICS.unknownColumnType,
        fragment: 'area GEOMETRY',
        position: { line: 4, column: 3 },
        location: { table: 'place', column: 'area' },
      },
    ]);
  });

  it('referencias a tablas o columnas inexistentes se descartan con aviso', () => {
    const result = parseSql(
      [
        'CREATE TABLE a (',
        '  id INT,',
        '  b_id INT REFERENCES missing (id),',
        '  PRIMARY KEY (ghost)',
        ');',
        'ALTER TABLE nowhere ADD PRIMARY KEY (id);',
      ].join('\n'),
      { dialect: 'postgresql' },
    );

    const table = tableOf(result, 'a');
    expect(table.foreignKeys).toEqual([]);
    expect(table).not.toHaveProperty('primaryKey');
    expect(table.columns.map((column) => column.name)).toEqual(['id', 'b_id']);
    expect(result.diagnostics).toMatchObject([
      {
        code: PARSER_DIAGNOSTICS.unknownReferencedTable,
        fragment: 'b_id INT REFERENCES missing (id)',
        position: { line: 3, column: 3 },
      },
      {
        code: PARSER_DIAGNOSTICS.unknownColumn,
        fragment: 'PRIMARY KEY (ghost)',
        location: { table: 'a', column: 'ghost' },
      },
      { code: PARSER_DIAGNOSTICS.unknownTable, position: { line: 6, column: 1 } },
    ]);
  });

  it('tablas duplicadas: se conserva la primera definición', () => {
    const result = parseSql('CREATE TABLE a (id INT);\nCREATE TABLE a (other INT);', { dialect: 'postgresql' });

    expect(tableOf(result, 'a').columns.map((column) => column.name)).toEqual(['id']);
    expect(result.diagnostics).toMatchObject([
      { code: PARSER_DIAGNOSTICS.duplicateTable, position: { line: 2, column: 1 } },
    ]);
  });
});

describe('parseSql · identificadores y serialización', () => {
  it('identificadores entrecomillados, con espacios y con esquema', () => {
    const result = parseSql(
      'CREATE TABLE "sales"."Order Line" (\n  "Line No" INTEGER NOT NULL,\n  "Order" INTEGER,\n  PRIMARY KEY ("Line No")\n);',
      { dialect: 'postgresql' },
    );

    expect(result.diagnostics).toEqual([]);
    const table = tableOf(result, 'Order Line');
    expect(table.columns.map((column) => column.name)).toEqual(['Line No', 'Order']);
    expect(table.primaryKey).toEqual({ columns: ['Line No'] });
  });

  it('las referencias entre tablas no distinguen mayúsculas y se normalizan', () => {
    const result = parseSql(
      'CREATE TABLE Users (Id INT PRIMARY KEY);\nCREATE TABLE posts (id INT PRIMARY KEY, user_id INT REFERENCES USERS (ID));',
      { dialect: 'postgresql' },
    );

    expect(tableOf(result, 'posts').foreignKeys).toEqual([
      { columns: ['user_id'], referencedTable: 'Users', referencedColumns: ['Id'] },
    ]);
  });

  it('el resultado es serializable (se puede enviar a un Web Worker)', () => {
    const result = parseSql(postgresDumpSql);

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('es una función pura: misma entrada, misma salida', () => {
    expect(parseSql(mysqlDumpSql)).toEqual(parseSql(mysqlDumpSql));
  });
});
