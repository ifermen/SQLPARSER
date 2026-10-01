/**
 * Tests de integración: script SQL real → parser → inferencia → generador JPA.
 *
 * Cada fichero generado se compara con su golden file en
 * `__golden__/<fixture>/<fichero>`. Si un cambio altera la salida, el test
 * falla y la diferencia se revisa en el PR. Para regenerarlos a propósito:
 * `npx vitest run -u src/core/generators/jpa`.
 */
import { describe, expect, it } from 'vitest';
import type { SqlDialect } from '@/core/model';
import { inferRelationships } from '@/core/inference';
import { parseSql } from '@/core/parser';
import type { GenerationResult } from '../generator';
import { JPA_DIAGNOSTICS } from './diagnosticCodes';
import { jpaGenerator } from './jpaGenerator';

const FIXTURES = import.meta.glob('../../parser/__fixtures__/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Fixtures sin rasgos de dialecto: se indica el dialecto manualmente, como haría el usuario. */
const MANUAL_DIALECTS: Readonly<Record<string, SqlDialect>> = { 'composite-primary-key': 'postgresql' };

const fixtures = Object.entries(FIXTURES)
  .map(([path, sql]) => [path.replace(/^.*\/(.+)\.sql$/, '$1'), sql] as const)
  .sort(([a], [b]) => a.localeCompare(b));

function generate(name: string, sql: string): GenerationResult {
  const dialect = MANUAL_DIALECTS[name];
  const parsed = parseSql(sql, dialect ? { dialect } : {});
  if (!parsed.schema) throw new Error(`${name}: el script tiene errores`);
  const inferred = inferRelationships(parsed.schema);
  return jpaGenerator.generate(inferred.schema, jpaGenerator.defaultOptions, {
    diagnostics: [...parsed.diagnostics, ...inferred.diagnostics],
    dialect: parsed.dialect,
  });
}

function fileNames(result: GenerationResult): string[] {
  return result.files.map((file) => file.path.replace(/^.*\//, ''));
}

describe('generador JPA · golden files de todos los fixtures', () => {
  it('hay fixtures de los cuatro dialectos', () => {
    expect(fixtures.map(([name]) => name)).toEqual(
      expect.arrayContaining(['single-table', 'mysql-dump', 'postgres-dump', 'join-table', 'oracle-us01']),
    );
  });

  it.each(fixtures)('%s', async (name, sql) => {
    const result = generate(name, sql);

    for (const file of result.files) {
      await expect(file.content).toMatchFileSnapshot(`./__golden__/${name}/${file.path.replace(/^.*\//, '')}`);
    }
  });
});

describe('generador JPA · criterios de aceptación de US-01', () => {
  const byName = new Map(fixtures);
  const run = (name: string) => generate(name, byName.get(name) ?? '');
  const content = (result: GenerationResult, fileName: string) =>
    result.files.find((file) => file.path.endsWith(`/${fileName}`))?.content ?? '';

  it('criterio 1: tabla sin relaciones → @Entity, @Id y @Column', () => {
    const product = content(run('single-table'), 'Product.java');

    expect(product).toContain('@Entity\n@Table(name = "product")\npublic class Product {');
    expect(product).toContain('    @Id\n    @GeneratedValue(strategy = GenerationType.IDENTITY)\n    @Column(name = "id", nullable = false)\n    private Long id;');
    expect(product).toContain('@Column(name = "price", nullable = false, precision = 10, scale = 2)');
  });

  it.each(['many-to-one', 'oracle-us01'])('criterio 2 (%s): FK → @ManyToOne y @OneToMany', (name) => {
    const result = run(name);

    expect(content(result, 'PurchaseOrder.java')).toContain(
      '    @ManyToOne(fetch = FetchType.LAZY, optional = false)\n    @JoinColumn(name = "customer_id", nullable = false)\n    private Customer customer;',
    );
    expect(content(result, 'Customer.java')).toContain(
      '    @OneToMany(mappedBy = "customer")\n    private List<PurchaseOrder> purchaseOrders = new ArrayList<>();',
    );
  });

  it('criterio 3: uno a uno por FK única y por PK compartida → @OneToOne', () => {
    const result = run('one-to-one');

    expect(content(result, 'UserSetting.java')).toContain(
      '    @OneToOne(fetch = FetchType.LAZY, optional = false)\n    @JoinColumn(name = "user_id", nullable = false, unique = true)\n    private User user;',
    );
    expect(content(result, 'UserProfile.java')).toContain(
      '    @OneToOne(fetch = FetchType.LAZY, optional = false)\n    @JoinColumn(name = "user_id", nullable = false, insertable = false, updatable = false)\n    private User user;',
    );
    expect(content(result, 'User.java')).toContain('    @OneToOne(mappedBy = "user")\n    private UserSetting userSetting;');
  });

  it.each([
    ['join-table', 'Student.java', 'courses', 'Course'],
    ['oracle-us01', 'Product.java', 'tags', 'Tag'],
  ])('criterio 4 (%s): tabla intermedia pura → @ManyToMany sin clase propia', (name, owner, field, target) => {
    const result = run(name);

    expect(fileNames(result)).not.toContain('StudentCourse.java');
    expect(fileNames(result)).not.toContain('ProductTag.java');
    expect(content(result, owner)).toContain(`    private Set<${target}> ${field} = new HashSet<>();`);
    expect(content(result, owner)).toContain('    @ManyToMany\n    @JoinTable(');
  });

  it.each([
    ['association-entity', 'BookAuthor', ['bookId', 'authorId']],
    ['oracle-us01', 'OrderLine', ['orderId', 'productId']],
  ])('criterio 5 (%s): entidad de asociación con @IdClass y dos @ManyToOne', (name, className, idFields) => {
    const result = run(name);
    const entity = content(result, `${className}.java`);

    expect(fileNames(result)).toContain(`${className}Id.java`);
    expect(entity).toContain(`@IdClass(${className}Id.class)`);
    expect(entity.match(/@ManyToOne/g)).toHaveLength(2);
    for (const idField of idFields) expect(content(result, `${className}Id.java`)).toContain(` ${idField};`);
  });

  it.each(['composite-primary-key', 'oracle-us01'])('criterio 6 (%s): claves compuestas → @IdClass', (name) => {
    const result = run(name);

    expect(fileNames(result)).toEqual(expect.arrayContaining(['WarehouseId.java', 'StockItemId.java']));
    expect(content(result, 'StockItem.java')).toContain('@IdClass(StockItemId.class)');
    expect(content(result, 'StockItem.java')).toContain('    @JoinColumns({');
  });
});

describe('generador JPA · avisos sobre scripts reales', () => {
  it.each([
    ['postgres-dump', [JPA_DIAGNOSTICS.unmappedType, JPA_DIAGNOSTICS.unmappedType]],
    ['oracle-features', [JPA_DIAGNOSTICS.unmappedType]],
    ['oracle-sqldeveloper', []],
    ['mysql-dump', []],
    ['oracle-us01', []],
  ])('%s', (name, expected) => {
    const sql = fixtures.find(([candidate]) => candidate === name)?.[1] ?? '';

    expect(generate(name, sql).diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expected);
  });
});
