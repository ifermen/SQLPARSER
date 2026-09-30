/**
 * Tests de integración: script SQL real → parser → inferencia. Reutilizan los
 * fixtures del parser, que cubren los criterios de US-01 en cada dialecto.
 */
import { describe, expect, it } from 'vitest';
import type { EnrichedSchemaModel, Relationship, SqlDialect, TableKind } from '@/core/model';
import { parseSql } from '@/core/parser';
import associationEntitySql from '@/core/parser/__fixtures__/association-entity.sql?raw';
import compositePrimaryKeySql from '@/core/parser/__fixtures__/composite-primary-key.sql?raw';
import joinTableSql from '@/core/parser/__fixtures__/join-table.sql?raw';
import manyToOneSql from '@/core/parser/__fixtures__/many-to-one.sql?raw';
import mysqlDumpSql from '@/core/parser/__fixtures__/mysql-dump.sql?raw';
import oneToOneSql from '@/core/parser/__fixtures__/one-to-one.sql?raw';
import oracleFeaturesSql from '@/core/parser/__fixtures__/oracle-features.sql?raw';
import oracleSqlDeveloperSql from '@/core/parser/__fixtures__/oracle-sqldeveloper.sql?raw';
import oracleUs01Sql from '@/core/parser/__fixtures__/oracle-us01.sql?raw';
import postgresDumpSql from '@/core/parser/__fixtures__/postgres-dump.sql?raw';
import singleTableSql from '@/core/parser/__fixtures__/single-table.sql?raw';
import { inferRelationships } from './index';

/** Parsea e infiere. El script no debe tener errores ni la inferencia avisos. */
function analyze(sql: string, dialect?: SqlDialect): EnrichedSchemaModel {
  const parsed = parseSql(sql, dialect ? { dialect } : {});
  if (!parsed.schema) throw new Error(`El script no se ha podido analizar: ${JSON.stringify(parsed.diagnostics)}`);

  const inferred = inferRelationships(parsed.schema);
  expect(inferred.diagnostics).toEqual([]);
  return inferred.schema;
}

/** Resumen legible de una relación: `origen(columnas) *─1 destino [regla]`. */
function describeRelationship(relationship: Relationship): string {
  if (relationship.kind === 'many-to-many') {
    return `${relationship.source} *─* ${relationship.target} vía ${relationship.joinTable} [${relationship.rule}]`;
  }
  const arrow = relationship.kind === 'one-to-one' ? '1─1' : '*─1';
  return `${relationship.source}(${relationship.foreignKey.columns.join(', ')}) ${arrow} ${relationship.target} [${relationship.rule}]`;
}

function relationshipsOf(schema: EnrichedSchemaModel, tableName?: string): string[] {
  return schema.relationships
    .filter(
      (relationship) =>
        !tableName ||
        relationship.source === tableName ||
        (relationship.kind === 'many-to-many' && relationship.joinTable === tableName),
    )
    .map(describeRelationship);
}

function kindOf(schema: EnrichedSchemaModel, tableName: string): TableKind | undefined {
  return schema.tables.find((table) => table.name === tableName)?.kind;
}

describe('parser + inferencia · criterios de aceptación de US-01', () => {
  it.each([
    ['PostgreSQL', singleTableSql],
    ['Oracle', oracleUs01Sql],
  ])('criterio 1 (%s): una tabla sin relaciones es una entidad sin relaciones', (_dialect, sql) => {
    const schema = analyze(sql);

    expect(kindOf(schema, 'product')).toBe('entity');
    expect(
      schema.relationships.filter(
        (relationship) => relationship.source === 'product' && relationship.kind !== 'many-to-many',
      ),
    ).toEqual([]);
  });

  it.each([
    ['MySQL', manyToOneSql],
    ['Oracle', oracleUs01Sql],
  ])('criterio 2 (%s): dos tablas relacionadas por FK → many-to-one', (_dialect, sql) => {
    const schema = analyze(sql);

    expect(relationshipsOf(schema, 'purchase_order')).toEqual([
      'purchase_order(customer_id) *─1 customer [foreign-key]',
    ]);
    expect(kindOf(schema, 'purchase_order')).toBe('entity');
    expect(kindOf(schema, 'customer')).toBe('entity');
  });

  it.each([
    ['PostgreSQL', oneToOneSql, 'user_settings', 'user_profile', 'users', 'user_id'],
    ['Oracle', oracleUs01Sql, 'customer_settings', 'customer_profile', 'customer', 'customer_id'],
  ])(
    'criterio 3 (%s): FK única y PK compartida → one-to-one',
    (_dialect, sql, settings, profile, target, column) => {
      const schema = analyze(sql);

      expect(relationshipsOf(schema, settings)).toEqual([
        `${settings}(${column}) 1─1 ${target} [unique-foreign-key]`,
      ]);
      expect(relationshipsOf(schema, profile)).toEqual([
        `${profile}(${column}) 1─1 ${target} [primary-key-foreign-key]`,
      ]);
    },
  );

  it.each([
    ['SQLite', joinTableSql, 'student_course', 'student *─* course vía student_course [join-table]'],
    ['Oracle', oracleUs01Sql, 'product_tag', 'product *─* tag vía product_tag [join-table]'],
  ])('criterio 4 (%s): tabla intermedia pura → many-to-many', (_dialect, sql, joinTable, expected) => {
    const schema = analyze(sql);

    expect(kindOf(schema, joinTable)).toBe('join-table');
    expect(relationshipsOf(schema, joinTable)).toEqual([expected]);
  });

  it('criterio 4: la relación many-to-many conserva las dos FK de la tabla intermedia', () => {
    const schema = analyze(joinTableSql);

    expect(schema.relationships).toEqual<Relationship[]>([
      {
        kind: 'many-to-many',
        rule: 'join-table',
        source: 'student',
        target: 'course',
        joinTable: 'student_course',
        sourceForeignKey: { columns: ['student_id'], referencedTable: 'student', referencedColumns: ['id'] },
        targetForeignKey: { columns: ['course_id'], referencedTable: 'course', referencedColumns: ['id'] },
      },
    ]);
  });

  it.each([
    [
      'MySQL',
      associationEntitySql,
      'book_author',
      [
        'book_author(book_id) *─1 book [association-entity]',
        'book_author(author_id) *─1 author [association-entity]',
      ],
    ],
    [
      'Oracle',
      oracleUs01Sql,
      'order_line',
      [
        'order_line(order_id) *─1 purchase_order [association-entity]',
        'order_line(product_id) *─1 product [association-entity]',
      ],
    ],
  ])(
    'criterio 5 (%s): tabla intermedia con atributos propios → entidad de asociación con dos many-to-one',
    (_dialect, sql, associationTable, expected) => {
      const schema = analyze(sql);

      expect(kindOf(schema, associationTable)).toBe('association-entity');
      expect(relationshipsOf(schema, associationTable)).toEqual(expected);
    },
  );

  it.each<[string, string, SqlDialect | undefined]>([
    ['SQL estándar', compositePrimaryKeySql, 'postgresql'],
    ['Oracle', oracleUs01Sql, undefined],
  ])(
    'criterio 6 (%s): PK compuesta referenciada por una FK compuesta',
    (_dialect, sql, dialect) => {
      const schema = analyze(sql, dialect);

      // La PK de stock_item tiene una sola FK (más otra columna): es una entidad con clave compuesta.
      expect(kindOf(schema, 'stock_item')).toBe('entity');
      expect(kindOf(schema, 'warehouse')).toBe('entity');
      expect(relationshipsOf(schema, 'stock_item')).toEqual([
        'stock_item(country_code, warehouse_code) *─1 warehouse [foreign-key]',
      ]);
    },
  );
});

describe('parser + inferencia · esquemas completos', () => {
  it('Oracle: los seis criterios en un mismo esquema', () => {
    const schema = analyze(oracleUs01Sql);

    expect(schema.tables.map((table) => [table.name, table.kind])).toEqual([
      ['product', 'entity'],
      ['customer', 'entity'],
      ['purchase_order', 'entity'],
      ['customer_settings', 'entity'],
      ['customer_profile', 'entity'],
      ['tag', 'entity'],
      ['product_tag', 'join-table'],
      ['order_line', 'association-entity'],
      ['warehouse', 'entity'],
      ['stock_item', 'entity'],
    ]);
    expect(relationshipsOf(schema)).toEqual([
      'purchase_order(customer_id) *─1 customer [foreign-key]',
      'customer_settings(customer_id) 1─1 customer [unique-foreign-key]',
      'customer_profile(customer_id) 1─1 customer [primary-key-foreign-key]',
      'product *─* tag vía product_tag [join-table]',
      'order_line(order_id) *─1 purchase_order [association-entity]',
      'order_line(product_id) *─1 product [association-entity]',
      'stock_item(country_code, warehouse_code) *─1 warehouse [foreign-key]',
    ]);
  });

  it.each<[string, string, string[]]>([
    [
      'mysqldump (autorreferencia)',
      mysqlDumpSql,
      ['category(parent_id) *─1 category [foreign-key]', 'product(category_id) *─1 category [foreign-key]'],
    ],
    ['pg_dump', postgresDumpSql, ['post(author_id) *─1 author [foreign-key]']],
    [
      'SQL Developer (referencias cruzadas y autorreferencia)',
      oracleSqlDeveloperSql,
      [
        'DEPARTMENTS(MANAGER_ID) *─1 EMPLOYEES [foreign-key]',
        'EMPLOYEES(DEPARTMENT_ID) *─1 DEPARTMENTS [foreign-key]',
        'EMPLOYEES(MANAGER_ID) *─1 EMPLOYEES [foreign-key]',
      ],
    ],
    [
      'Oracle con ALTER TABLE … ADD (…)',
      oracleFeaturesSql,
      ['legacy_customer(created_by) *─1 audit_log [foreign-key]'],
    ],
  ])('%s', (_label, sql, expected) => {
    const schema = analyze(sql);

    expect(relationshipsOf(schema)).toEqual(expected);
    expect(schema.tables.every((table) => table.kind === 'entity')).toBe(true);
  });

  it('el resultado del pipeline es serializable (Web Worker)', () => {
    const schema = analyze(oracleUs01Sql);

    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});
