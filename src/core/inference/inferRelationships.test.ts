import { describe, expect, it } from 'vitest';
import type { Column, ForeignKey, Relationship, SchemaModel, Table, TableKind } from '@/core/model';
import { INFERENCE_DIAGNOSTICS, inferRelationships } from './index';

// Constructores mínimos: la inferencia solo mira nombres de columna y restricciones.

function column(name: string): Column {
  return { name, type: { raw: 'INT', name: 'INT', logical: 'integer' }, nullable: false, autoIncrement: false };
}

interface TableSpec {
  readonly pk?: readonly string[];
  readonly fks?: readonly ForeignKey[];
  readonly uniques?: readonly (readonly string[])[];
}

function table(name: string, columns: readonly string[], spec: TableSpec = {}): Table {
  return {
    name,
    columns: columns.map(column),
    ...(spec.pk ? { primaryKey: { columns: spec.pk } } : {}),
    foreignKeys: spec.fks ?? [],
    uniqueConstraints: (spec.uniques ?? []).map((columnsOfUnique) => ({ columns: columnsOfUnique })),
  };
}

function fk(columns: readonly string[], referencedTable: string, referencedColumns: readonly string[] = ['id']): ForeignKey {
  return { columns, referencedTable, referencedColumns };
}

function schema(...tables: Table[]): SchemaModel {
  return { dialect: 'postgresql', tables };
}

const users = table('users', ['id', 'name'], { pk: ['id'] });
const roles = table('roles', ['id', 'name'], { pk: ['id'] });

function kindsOf(input: SchemaModel): Record<string, TableKind> {
  return Object.fromEntries(inferRelationships(input).schema.tables.map((t) => [t.name, t.kind]));
}

function relationshipsOf(input: SchemaModel): readonly Relationship[] {
  return inferRelationships(input).schema.relationships;
}

describe('inferRelationships · entidades y FK simples', () => {
  it('una tabla sin FK es una entidad sin relaciones', () => {
    const result = inferRelationships(schema(users));

    expect(result.diagnostics).toEqual([]);
    expect(result.schema).toEqual({
      dialect: 'postgresql',
      tables: [{ ...users, kind: 'entity' }],
      relationships: [],
    });
  });

  it('FK de A a B → many-to-one', () => {
    const posts = table('posts', ['id', 'user_id'], { pk: ['id'], fks: [fk(['user_id'], 'users')] });

    expect(relationshipsOf(schema(users, posts))).toEqual<Relationship[]>([
      {
        kind: 'many-to-one',
        rule: 'foreign-key',
        source: 'posts',
        target: 'users',
        foreignKey: fk(['user_id'], 'users'),
      },
    ]);
    expect(kindsOf(schema(users, posts))).toEqual({ users: 'entity', posts: 'entity' });
  });

  it('autorreferencia (árbol) → many-to-one de la tabla consigo misma', () => {
    const category = table('category', ['id', 'parent_id'], {
      pk: ['id'],
      fks: [fk(['parent_id'], 'category')],
    });

    expect(relationshipsOf(schema(category))).toEqual<Relationship[]>([
      {
        kind: 'many-to-one',
        rule: 'foreign-key',
        source: 'category',
        target: 'category',
        foreignKey: fk(['parent_id'], 'category'),
      },
    ]);
  });

  it('varias FK hacia la misma tabla → una relación por FK, en el orden del script', () => {
    const doc = table('document', ['id', 'created_by', 'updated_by'], {
      pk: ['id'],
      fks: [fk(['created_by'], 'users'), fk(['updated_by'], 'users')],
    });

    expect(relationshipsOf(schema(users, doc)).map((r) => [r.kind, r.kind !== 'many-to-many' && r.foreignKey.columns])).toEqual([
      ['many-to-one', ['created_by']],
      ['many-to-one', ['updated_by']],
    ]);
  });

  it('el nombre de la tabla destino se normaliza al del esquema', () => {
    const posts = table('posts', ['id', 'user_id'], { pk: ['id'], fks: [fk(['user_id'], 'USERS')] });

    expect(relationshipsOf(schema(users, posts))[0]).toMatchObject({ target: 'users' });
  });
});

describe('inferRelationships · uno a uno', () => {
  it('FK con UNIQUE sobre la misma columna → one-to-one (unique-foreign-key)', () => {
    const settings = table('settings', ['id', 'user_id'], {
      pk: ['id'],
      fks: [fk(['user_id'], 'users')],
      uniques: [['user_id']],
    });

    expect(relationshipsOf(schema(users, settings))).toEqual<Relationship[]>([
      {
        kind: 'one-to-one',
        rule: 'unique-foreign-key',
        source: 'settings',
        target: 'users',
        foreignKey: fk(['user_id'], 'users'),
      },
    ]);
  });

  it('FK que es a la vez la PK → one-to-one (primary-key-foreign-key)', () => {
    const profile = table('profile', ['user_id', 'bio'], { pk: ['user_id'], fks: [fk(['user_id'], 'users')] });

    expect(relationshipsOf(schema(users, profile))).toEqual<Relationship[]>([
      {
        kind: 'one-to-one',
        rule: 'primary-key-foreign-key',
        source: 'profile',
        target: 'users',
        foreignKey: fk(['user_id'], 'users'),
      },
    ]);
  });

  it('FK compuesta igual a la PK compuesta → one-to-one; la tabla sigue siendo una entidad', () => {
    const parent = table('parent', ['a', 'b'], { pk: ['a', 'b'] });
    const extension = table('extension', ['a', 'b', 'extra'], {
      pk: ['a', 'b'],
      fks: [fk(['a', 'b'], 'parent', ['a', 'b'])],
    });

    expect(kindsOf(schema(parent, extension))).toEqual({ parent: 'entity', extension: 'entity' });
    expect(relationshipsOf(schema(parent, extension))).toMatchObject([
      { kind: 'one-to-one', rule: 'primary-key-foreign-key' },
    ]);
  });

  it('UNIQUE compuesta igual a la FK compuesta, en otro orden → one-to-one', () => {
    const parent = table('parent', ['a', 'b'], { pk: ['a', 'b'] });
    const child = table('child', ['id', 'pa', 'pb'], {
      pk: ['id'],
      fks: [fk(['pa', 'pb'], 'parent', ['a', 'b'])],
      uniques: [['pb', 'pa']],
    });

    expect(relationshipsOf(schema(parent, child))).toMatchObject([{ kind: 'one-to-one', rule: 'unique-foreign-key' }]);
  });

  it.each([
    ['la UNIQUE solo cubre parte de la FK', [['pa']]],
    ['la UNIQUE incluye más columnas que la FK', [['pa', 'pb', 'other']]],
  ])('%s → many-to-one', (_label, uniques) => {
    const parent = table('parent', ['a', 'b'], { pk: ['a', 'b'] });
    const child = table('child', ['id', 'pa', 'pb', 'other'], {
      pk: ['id'],
      fks: [fk(['pa', 'pb'], 'parent', ['a', 'b'])],
      uniques,
    });

    expect(relationshipsOf(schema(parent, child))).toMatchObject([{ kind: 'many-to-one', rule: 'foreign-key' }]);
  });

  it('la comparación de columnas no distingue mayúsculas', () => {
    const profile = table('profile', ['USER_ID', 'bio'], { pk: ['USER_ID'], fks: [fk(['user_id'], 'users')] });

    expect(relationshipsOf(schema(users, profile))).toMatchObject([{ kind: 'one-to-one' }]);
  });
});

describe('inferRelationships · tablas intermedias', () => {
  it('PK formada por dos FK y sin más columnas → join-table y many-to-many, sin many-to-one', () => {
    const userRole = table('user_role', ['user_id', 'role_id'], {
      pk: ['user_id', 'role_id'],
      fks: [fk(['user_id'], 'users'), fk(['role_id'], 'roles')],
    });
    const result = inferRelationships(schema(users, roles, userRole));

    expect(kindsOf(schema(users, roles, userRole))).toEqual({
      users: 'entity',
      roles: 'entity',
      user_role: 'join-table',
    });
    expect(result.schema.relationships).toEqual<Relationship[]>([
      {
        kind: 'many-to-many',
        rule: 'join-table',
        source: 'users',
        target: 'roles',
        joinTable: 'user_role',
        sourceForeignKey: fk(['user_id'], 'users'),
        targetForeignKey: fk(['role_id'], 'roles'),
      },
    ]);
  });

  it('el lado propietario es el de la primera FK en el orden del script', () => {
    const roleUser = table('role_user', ['user_id', 'role_id'], {
      pk: ['user_id', 'role_id'],
      fks: [fk(['role_id'], 'roles'), fk(['user_id'], 'users')],
    });

    expect(relationshipsOf(schema(users, roles, roleUser))).toMatchObject([{ source: 'roles', target: 'users' }]);
  });

  it('tabla intermedia sin PK cuyas columnas son exactamente dos FK → join-table', () => {
    const userRole = table('user_role', ['user_id', 'role_id'], {
      fks: [fk(['user_id'], 'users'), fk(['role_id'], 'roles')],
    });

    expect(kindsOf(schema(users, roles, userRole)).user_role).toBe('join-table');
    expect(relationshipsOf(schema(users, roles, userRole))).toMatchObject([{ kind: 'many-to-many' }]);
  });

  it('muchos a muchos de una tabla consigo misma (seguidores)', () => {
    const follows = table('follows', ['follower_id', 'followed_id'], {
      pk: ['follower_id', 'followed_id'],
      fks: [fk(['follower_id'], 'users'), fk(['followed_id'], 'users')],
    });

    expect(relationshipsOf(schema(users, follows))).toMatchObject([
      { kind: 'many-to-many', source: 'users', target: 'users', joinTable: 'follows' },
    ]);
  });

  it('tabla intermedia con una FK compuesta', () => {
    const warehouse = table('warehouse', ['country', 'code'], { pk: ['country', 'code'] });
    const product = table('product', ['id'], { pk: ['id'] });
    const stock = table('warehouse_product', ['country', 'code', 'product_id'], {
      pk: ['country', 'code', 'product_id'],
      fks: [fk(['country', 'code'], 'warehouse', ['country', 'code']), fk(['product_id'], 'product')],
    });

    expect(kindsOf(schema(warehouse, product, stock)).warehouse_product).toBe('join-table');
  });

  it('PK formada por dos FK y columnas propias → association-entity con dos many-to-one', () => {
    const membership = table('membership', ['user_id', 'role_id', 'since'], {
      pk: ['user_id', 'role_id'],
      fks: [fk(['user_id'], 'users'), fk(['role_id'], 'roles')],
    });

    expect(kindsOf(schema(users, roles, membership)).membership).toBe('association-entity');
    expect(relationshipsOf(schema(users, roles, membership))).toEqual<Relationship[]>([
      {
        kind: 'many-to-one',
        rule: 'association-entity',
        source: 'membership',
        target: 'users',
        foreignKey: fk(['user_id'], 'users'),
      },
      {
        kind: 'many-to-one',
        rule: 'association-entity',
        source: 'membership',
        target: 'roles',
        foreignKey: fk(['role_id'], 'roles'),
      },
    ]);
  });

  it('entidad de asociación con una FK adicional fuera de la PK', () => {
    const membership = table('membership', ['user_id', 'role_id', 'granted_by'], {
      pk: ['user_id', 'role_id'],
      fks: [fk(['user_id'], 'users'), fk(['role_id'], 'roles'), fk(['granted_by'], 'users')],
    });

    expect(kindsOf(schema(users, roles, membership)).membership).toBe('association-entity');
    expect(relationshipsOf(schema(users, roles, membership)).map((r) => r.rule)).toEqual([
      'association-entity',
      'association-entity',
      'foreign-key',
    ]);
  });

  it.each<[string, Table]>([
    [
      'PK con dos FK y una columna que no es FK',
      table('order_line', ['order_id', 'product_id', 'line_no'], {
        pk: ['order_id', 'product_id', 'line_no'],
        fks: [fk(['order_id'], 'users'), fk(['product_id'], 'roles')],
      }),
    ],
    [
      'PK compuesta con una sola FK',
      table('order_line', ['order_id', 'line_no'], { pk: ['order_id', 'line_no'], fks: [fk(['order_id'], 'users')] }),
    ],
    [
      'PK con tres FK',
      table('triple', ['a', 'b', 'c'], {
        pk: ['a', 'b', 'c'],
        fks: [fk(['a'], 'users'), fk(['b'], 'roles'), fk(['c'], 'users')],
      }),
    ],
    [
      'dos FK que se solapan',
      table('overlap', ['a', 'b', 'c'], {
        pk: ['a', 'b', 'c'],
        fks: [fk(['a', 'b'], 'users', ['id', 'name']), fk(['b', 'c'], 'roles', ['id', 'name'])],
      }),
    ],
    [
      'dos columnas y dos FK, pero la PK es solo una de ellas',
      table('user_main_role', ['user_id', 'role_id'], {
        pk: ['user_id'],
        fks: [fk(['user_id'], 'users'), fk(['role_id'], 'roles')],
      }),
    ],
    [
      'sin PK, con dos FK y otra columna',
      table('log', ['user_id', 'role_id', 'at'], { fks: [fk(['user_id'], 'users'), fk(['role_id'], 'roles')] }),
    ],
  ])('%s → entidad', (_label, candidate) => {
    const result = inferRelationships(schema(users, roles, candidate));

    expect(result.schema.tables.find((t) => t.name === candidate.name)?.kind).toBe('entity');
    expect(result.schema.relationships.some((r) => r.kind === 'many-to-many')).toBe(false);
  });
});

describe('inferRelationships · FK que no generan relación', () => {
  it('FK hacia una tabla que no está en el esquema: aviso con fragmento y sin relación', () => {
    const posts = table('posts', ['id', 'user_id'], { pk: ['id'], fks: [fk(['user_id'], 'ghost')] });
    const result = inferRelationships(schema(posts));

    expect(result.schema.relationships).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        severity: 'warning',
        stage: 'inference',
        code: INFERENCE_DIAGNOSTICS.unknownReferencedTable,
        message:
          'La clave foránea de "posts" referencia la tabla "ghost", que no está en el esquema; no se genera la relación.',
        fragment: 'FOREIGN KEY (user_id) REFERENCES ghost (id)',
        location: { table: 'posts', column: 'user_id' },
      },
    ]);
  });

  it('una FK inválida no cuenta para clasificar la tabla', () => {
    const userRole = table('user_role', ['user_id', 'role_id'], {
      pk: ['user_id', 'role_id'],
      fks: [fk(['user_id'], 'users'), fk(['role_id'], 'ghost')],
    });
    const result = inferRelationships(schema(users, userRole));

    expect(result.schema.tables.find((t) => t.name === 'user_role')?.kind).toBe('entity');
    expect(result.schema.relationships).toMatchObject([{ kind: 'many-to-one', target: 'users' }]);
    expect(result.diagnostics.map((d) => d.code)).toEqual([INFERENCE_DIAGNOSTICS.unknownReferencedTable]);
  });

  it('FK que apunta a sus propias columnas: aviso y sin relación', () => {
    const weird = table('weird', ['id'], { pk: ['id'], fks: [fk(['id'], 'weird')] });
    const result = inferRelationships(schema(weird));

    expect(result.schema.relationships).toEqual([]);
    expect(result.diagnostics).toMatchObject([
      { code: INFERENCE_DIAGNOSTICS.selfReferencingKey, fragment: 'FOREIGN KEY (id) REFERENCES weird (id)' },
    ]);
  });
});

describe('inferRelationships · propiedades de la función', () => {
  const posts = table('posts', ['id', 'user_id'], { pk: ['id'], fks: [fk(['user_id'], 'users')] });
  const userRole = table('user_role', ['user_id', 'role_id'], {
    pk: ['user_id', 'role_id'],
    fks: [fk(['user_id'], 'users'), fk(['role_id'], 'roles')],
  });
  const input = schema(users, roles, posts, userRole);

  it('conserva el dialecto y los datos de cada tabla, añadiendo solo `kind`', () => {
    const result = inferRelationships(input);

    expect(result.schema.dialect).toBe('postgresql');
    expect(result.schema.tables).toEqual(input.tables.map((t) => ({ ...t, kind: expect.any(String) })));
  });

  it('no modifica la entrada', () => {
    const snapshot = JSON.parse(JSON.stringify(input));
    inferRelationships(input);

    expect(input).toEqual(snapshot);
  });

  it('es pura y su resultado es serializable (Web Worker)', () => {
    const result = inferRelationships(input);

    expect(inferRelationships(input)).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('las relaciones siguen el orden de las tablas y de sus FK', () => {
    expect(relationshipsOf(input).map((r) => r.kind)).toEqual(['many-to-one', 'many-to-many']);
  });
});
