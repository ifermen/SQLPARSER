import { describe, expect, it } from 'vitest';
import type {
  Column,
  ColumnType,
  EnrichedSchemaModel,
  EnrichedTable,
  ForeignKey,
  LogicalType,
  Relationship,
  TableKind,
} from '@/core/model';
import { JPA_DIAGNOSTICS } from './diagnosticCodes';
import { JPA_DEFAULT_OPTIONS, type JpaOptions } from './jpaOptions';
import { planEntities, type EntityPlan, type PlannedEntity, type PlannedField } from './planEntities';

// ---------------------------------------------------------------------------
// Constructores del esquema enriquecido (sin parser ni inferencia)
// ---------------------------------------------------------------------------

const TYPES: Partial<Record<LogicalType, ColumnType>> = {
  integer: { raw: 'INT', name: 'INT', logical: 'integer' },
  bigint: { raw: 'BIGINT', name: 'BIGINT', logical: 'bigint' },
  string: { raw: 'VARCHAR(100)', name: 'VARCHAR', logical: 'string', length: 100 },
  text: { raw: 'TEXT', name: 'TEXT', logical: 'text' },
  decimal: { raw: 'DECIMAL(10,2)', name: 'DECIMAL', logical: 'decimal', precision: 10, scale: 2 },
  datetime: { raw: 'TIMESTAMP', name: 'TIMESTAMP', logical: 'datetime' },
};

function col(name: string, logical: LogicalType = 'integer', extra: Partial<Column> = {}): Column {
  return {
    name,
    type: TYPES[logical] ?? { raw: logical.toUpperCase(), name: logical.toUpperCase(), logical },
    nullable: false,
    autoIncrement: false,
    ...extra,
  };
}

interface TableSpec {
  readonly pk?: readonly string[];
  readonly fks?: readonly ForeignKey[];
  readonly uniques?: readonly (readonly string[])[];
  readonly kind?: TableKind;
  readonly comment?: string;
}

function table(name: string, columns: readonly Column[], spec: TableSpec = {}): EnrichedTable {
  return {
    name,
    ...(spec.comment ? { comment: spec.comment } : {}),
    columns,
    ...(spec.pk ? { primaryKey: { columns: spec.pk } } : {}),
    foreignKeys: spec.fks ?? [],
    uniqueConstraints: (spec.uniques ?? []).map((columnsOfUnique) => ({ columns: columnsOfUnique })),
    kind: spec.kind ?? 'entity',
  };
}

function fk(columns: readonly string[], referencedTable: string, referencedColumns: readonly string[] = ['id']): ForeignKey {
  return { columns, referencedTable, referencedColumns };
}

function manyToOne(source: string, foreignKey: ForeignKey, rule: 'foreign-key' | 'association-entity' = 'foreign-key'): Relationship {
  return { kind: 'many-to-one', rule, source, target: foreignKey.referencedTable, foreignKey };
}

function oneToOne(
  source: string,
  foreignKey: ForeignKey,
  rule: 'unique-foreign-key' | 'primary-key-foreign-key' = 'unique-foreign-key',
): Relationship {
  return { kind: 'one-to-one', rule, source, target: foreignKey.referencedTable, foreignKey };
}

function manyToMany(joinTable: string, sourceForeignKey: ForeignKey, targetForeignKey: ForeignKey): Relationship {
  return {
    kind: 'many-to-many',
    rule: 'join-table',
    source: sourceForeignKey.referencedTable,
    target: targetForeignKey.referencedTable,
    joinTable,
    sourceForeignKey,
    targetForeignKey,
  };
}

function schema(tables: readonly EnrichedTable[], relationships: readonly Relationship[] = []): EnrichedSchemaModel {
  return { dialect: 'postgresql', tables, relationships };
}

function plan(input: EnrichedSchemaModel, options: JpaOptions = JPA_DEFAULT_OPTIONS): EntityPlan {
  return planEntities(input, options);
}

function entityOf(result: EntityPlan, className: string): PlannedEntity {
  const entity = result.entities.find((candidate) => candidate.className === className);
  if (!entity) throw new Error(`No se ha planificado la clase ${className}`);
  return entity;
}

function fieldOf(entity: PlannedEntity, name: string): PlannedField {
  const field = entity.fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`La clase ${entity.className} no tiene el campo ${name}: ${entity.fields.map((f) => f.name).join(', ')}`);
  return field;
}

const namesOf = (entity: PlannedEntity): string[] => entity.fields.map((field) => field.name);

const users = table('users', [col('id', 'bigint', { autoIncrement: true }), col('name', 'string')], { pk: ['id'] });

// ---------------------------------------------------------------------------

describe('planEntities · clases', () => {
  it('una clase por tabla, salvo las tablas intermedias puras', () => {
    const roles = table('roles', [col('id')], { pk: ['id'] });
    const userRoles = table('user_roles', [col('user_id', 'bigint'), col('role_id')], {
      pk: ['user_id', 'role_id'],
      kind: 'join-table',
    });
    const result = plan(
      schema([users, roles, userRoles], [manyToMany('user_roles', fk(['user_id'], 'users'), fk(['role_id'], 'roles'))]),
    );

    expect(result.entities.map((entity) => entity.className)).toEqual(['User', 'Role']);
    expect([...result.classNames]).toEqual([
      ['users', 'User'],
      ['roles', 'Role'],
    ]);
  });

  it('dos tablas que darían la misma clase: se numera la segunda y se avisa', () => {
    const result = plan(schema([table('user', [col('id')], { pk: ['id'] }), users]));

    expect(result.entities.map((entity) => entity.className)).toEqual(['User', 'User2']);
    expect(result.diagnostics).toMatchObject([
      { code: JPA_DIAGNOSTICS.classNameCollision, location: { table: 'users' }, fragment: 'CREATE TABLE users (id, name)' },
    ]);
  });

  it('la clase de clave compuesta no puede chocar con una entidad', () => {
    const orderLineId = table('order_line_id', [col('id')], { pk: ['id'] });
    const orderLine = table('order_line', [col('order_id'), col('line_no')], { pk: ['order_id', 'line_no'] });
    const result = plan(schema([orderLineId, orderLine]));

    expect(entityOf(result, 'OrderLine').idClass?.className).toBe('OrderLineId2');
  });

  it('javadoc con el comentario de la tabla; aviso y nota si no hay clave primaria', () => {
    const logs = table('audit_logs', [col('message', 'text')], { comment: 'Registro de auditoría' });
    const result = plan(schema([logs]));
    const entity = entityOf(result, 'AuditLog');

    expect(entity.javadoc).toEqual([
      'Registro de auditoría',
      'ATENCIÓN: la tabla no tiene clave primaria. JPA exige un @Id: añádelo antes de usar esta entidad.',
    ]);
    expect(entity.fields.flatMap((field) => field.annotations)).not.toContain('@Id');
    expect(result.diagnostics).toMatchObject([{ code: JPA_DIAGNOSTICS.missingPrimaryKey, location: { table: 'audit_logs' } }]);
  });

  it('@Table con las UNIQUE compuestas; las de una columna van en @Column', () => {
    const account = table('account', [col('id'), col('email', 'string'), col('tenant'), col('code', 'string')], {
      pk: ['id'],
      uniques: [['email'], ['tenant', 'code']],
    });
    const entity = entityOf(plan(schema([account])), 'Account');

    expect(entity.annotations).toEqual([
      '@Entity',
      '@Table(name = "account", uniqueConstraints = {\n        @UniqueConstraint(columnNames = {"tenant", "code"})\n})',
    ]);
    expect(fieldOf(entity, 'email').annotations).toEqual([
      '@Column(name = "email", nullable = false, unique = true, length = 100)',
    ]);
  });
});

describe('planEntities · campos simples y tipos', () => {
  it('camelCase, @Id con IDENTITY y atributos de @Column', () => {
    const product = table(
      'product',
      [
        col('id', 'bigint', { autoIncrement: true }),
        col('unit_price', 'decimal'),
        col('description', 'text', { nullable: true, comment: 'Texto libre' }),
        col('CREATED_AT', 'datetime'),
      ],
      { pk: ['id'] },
    );
    const entity = entityOf(plan(schema([product])), 'Product');

    expect(entity.fields).toEqual<PlannedField[]>([
      {
        name: 'id',
        javaType: 'Long',
        annotations: ['@Id', '@GeneratedValue(strategy = GenerationType.IDENTITY)', '@Column(name = "id", nullable = false)'],
      },
      {
        name: 'unitPrice',
        javaType: 'BigDecimal',
        annotations: ['@Column(name = "unit_price", nullable = false, precision = 10, scale = 2)'],
      },
      { name: 'description', javaType: 'String', annotations: ['@Column(name = "description")'], javadoc: 'Texto libre' },
      { name: 'createdAt', javaType: 'LocalDateTime', annotations: ['@Column(name = "CREATED_AT", nullable = false)'] },
    ]);
    expect([...entity.imports].sort()).toEqual([
      'jakarta.persistence.Column',
      'jakarta.persistence.Entity',
      'jakarta.persistence.GeneratedValue',
      'jakarta.persistence.GenerationType',
      'jakarta.persistence.Id',
      'jakarta.persistence.Table',
      'java.math.BigDecimal',
      'java.time.LocalDateTime',
    ]);
  });

  it('palabras reservadas y nombres físicos con caracteres especiales', () => {
    const weird = table('Order Line', [col('id'), col('class', 'string'), col('Line No')], { pk: ['id'] });
    const entity = entityOf(plan(schema([weird])), 'OrderLine');

    expect(entity.annotations[1]).toBe('@Table(name = "\\"Order Line\\"")');
    expect(namesOf(entity)).toEqual(['id', 'class_', 'lineNo']);
    expect(fieldOf(entity, 'lineNo').annotations).toEqual(['@Column(name = "\\"Line No\\"", nullable = false)']);
  });

  it('ENUM con valores válidos → enum anidado con @Enumerated(STRING)', () => {
    const status: ColumnType = { raw: "ENUM('NEW','PAID')", name: 'ENUM', logical: 'enum', enumValues: ['NEW', 'PAID'] };
    const entity = entityOf(plan(schema([table('orders', [col('id'), col('status', 'enum', { type: status })], { pk: ['id'] })])), 'Order');

    expect(entity.enums).toEqual([{ name: 'Status', constants: ['NEW', 'PAID'] }]);
    expect(fieldOf(entity, 'status')).toEqual<PlannedField>({
      name: 'status',
      javaType: 'Status',
      annotations: ['@Enumerated(EnumType.STRING)', '@Column(name = "status", nullable = false)'],
    });
  });

  it('ENUM con valores que no son identificadores Java → String con aviso', () => {
    const type: ColumnType = { raw: "ENUM('in progress','done')", name: 'ENUM', logical: 'enum', enumValues: ['in progress', 'done'] };
    const result = plan(schema([table('task', [col('id'), col('state', 'enum', { type })], { pk: ['id'] })]));

    expect(fieldOf(entityOf(result, 'Task'), 'state').javaType).toBe('String');
    expect(result.diagnostics).toMatchObject([
      { code: JPA_DIAGNOSTICS.enumAsString, fragment: "state ENUM('in progress','done')", location: { table: 'task', column: 'state' } },
    ]);
  });

  it('el enum no puede llamarse como su clase', () => {
    const type: ColumnType = { raw: 'ENUM', name: 'ENUM', logical: 'enum', enumValues: ['A'] };
    const entity = entityOf(plan(schema([table('status', [col('id'), col('status', 'enum', { type })], { pk: ['id'] })])), 'Statu');

    expect(entity.enums[0]?.name).toBe('Status');
    const clash = entityOf(plan(schema([table('statuss', [col('id'), col('status', 'enum', { type })], { pk: ['id'] })])), 'Status');
    expect(clash.enums[0]?.name).toBe('StatusType');
  });

  it('tipo desconocido → String con aviso; @Lob solo para los LOB', () => {
    const geometry: ColumnType = { raw: 'GEOMETRY', name: 'GEOMETRY', logical: 'unknown' };
    const clob: ColumnType = { raw: 'CLOB', name: 'CLOB', logical: 'text' };
    const result = plan(
      schema([table('place', [col('id'), col('area', 'unknown', { type: geometry }), col('notes', 'text', { type: clob }), col('summary', 'text')], { pk: ['id'] })]),
    );
    const entity = entityOf(result, 'Place');

    expect(fieldOf(entity, 'area').javaType).toBe('String');
    expect(fieldOf(entity, 'notes').annotations).toEqual(['@Lob', '@Column(name = "notes", nullable = false)']);
    expect(fieldOf(entity, 'summary').annotations).toEqual(['@Column(name = "summary", nullable = false)']);
    expect(result.diagnostics).toMatchObject([{ code: JPA_DIAGNOSTICS.unmappedType, fragment: 'area GEOMETRY' }]);
  });

  it('dos columnas con el mismo nombre en camelCase → número', () => {
    const entity = entityOf(plan(schema([table('t', [col('id'), col('order_id'), col('orderId')], { pk: ['id'] })])), 'T');

    expect(namesOf(entity)).toEqual(['id', 'orderId', 'orderId2']);
  });
});

describe('planEntities · nombres de relaciones (regla del proyecto)', () => {
  const customer = table('customer', [col('id')], { pk: ['id'] });
  const purchaseOrder = table('purchase_order', [col('id'), col('customer_id')], {
    pk: ['id'],
    fks: [fk(['customer_id'], 'customer')],
  });

  it('una relación: la tabla referenciada en singular y, en el lado inverso, en plural', () => {
    const result = plan(schema([customer, purchaseOrder], [manyToOne('purchase_order', fk(['customer_id'], 'customer'))]));

    expect(namesOf(entityOf(result, 'PurchaseOrder'))).toEqual(['id', 'customer']);
    expect(namesOf(entityOf(result, 'Customer'))).toEqual(['id', 'purchaseOrders']);
    expect(result.relationships).toMatchObject([
      { owner: { className: 'PurchaseOrder', field: 'customer' }, inverse: { className: 'Customer', field: 'purchaseOrders' }, readOnly: false },
    ]);
  });

  it('dos relaciones con la misma tabla: se concatena la columna foránea sin _id', () => {
    const doc = table('document', [col('id'), col('created_by', 'bigint'), col('reviewer_id', 'bigint')], {
      pk: ['id'],
      fks: [fk(['created_by'], 'users'), fk(['reviewer_id'], 'users')],
    });
    const result = plan(
      schema([users, doc], [manyToOne('document', fk(['created_by'], 'users')), manyToOne('document', fk(['reviewer_id'], 'users'))]),
    );

    expect(namesOf(entityOf(result, 'Document'))).toEqual(['id', 'userCreatedBy', 'userReviewer']);
    expect(namesOf(entityOf(result, 'User'))).toEqual(['id', 'name', 'documentsCreatedBy', 'documentsReviewer']);
    expect(fieldOf(entityOf(result, 'User'), 'documentsReviewer').annotations).toEqual(['@OneToMany(mappedBy = "userReviewer")']);
  });

  it('dos relaciones con la misma tabla en sentidos distintos: los nombres no coinciden y no se discriminan', () => {
    // EMPLOYEES.DEPARTMENT_ID → DEPARTMENTS y DEPARTMENTS.MANAGER_ID → EMPLOYEES (esquema HR de Oracle).
    const departments = table('DEPARTMENTS', [col('DEPARTMENT_ID'), col('MANAGER_ID')], { pk: ['DEPARTMENT_ID'] });
    const employees = table('EMPLOYEES', [col('EMPLOYEE_ID'), col('DEPARTMENT_ID')], { pk: ['EMPLOYEE_ID'] });
    const result = plan(
      schema(
        [departments, employees],
        [
          manyToOne('DEPARTMENTS', fk(['MANAGER_ID'], 'EMPLOYEES', ['EMPLOYEE_ID'])),
          manyToOne('EMPLOYEES', fk(['DEPARTMENT_ID'], 'DEPARTMENTS', ['DEPARTMENT_ID'])),
        ],
      ),
    );

    expect(namesOf(entityOf(result, 'Employee'))).toEqual(['employeeId', 'department', 'departments']);
    expect(namesOf(entityOf(result, 'Department'))).toEqual(['departmentId', 'employee', 'employees']);
    expect(fieldOf(entityOf(result, 'Employee'), 'departments').annotations).toEqual(['@OneToMany(mappedBy = "employee")']);
  });

  it('FK compuesta repetida: se concatenan todas sus columnas', () => {
    const warehouse = table('warehouse', [col('country'), col('code')], { pk: ['country', 'code'] });
    const transfer = table('transfer', [col('id'), col('from_country'), col('from_code'), col('to_country'), col('to_code')], {
      pk: ['id'],
    });
    const from = fk(['from_country', 'from_code'], 'warehouse', ['country', 'code']);
    const to = fk(['to_country', 'to_code'], 'warehouse', ['country', 'code']);
    const result = plan(schema([warehouse, transfer], [manyToOne('transfer', from), manyToOne('transfer', to)]));

    expect(namesOf(entityOf(result, 'Transfer'))).toEqual(['id', 'warehouseFromCountryFromCode', 'warehouseToCountryToCode']);
  });

  it('la relación choca con un campo simple: la relación añade la columna foránea', () => {
    const order = table('purchase_order', [col('id'), col('customer', 'string'), col('customer_id')], {
      pk: ['id'],
      fks: [fk(['customer_id'], 'customer')],
    });
    const result = plan(schema([customer, order], [manyToOne('purchase_order', fk(['customer_id'], 'customer'))]));

    expect(namesOf(entityOf(result, 'PurchaseOrder'))).toEqual(['id', 'customer', 'customerCustomer']);
  });

  it('autorreferencia: una sola relación, `category` y `categorys` en la misma clase', () => {
    const category = table('category', [col('id'), col('parent_id', 'integer', { nullable: true })], {
      pk: ['id'],
      fks: [fk(['parent_id'], 'category')],
    });
    const entity = entityOf(plan(schema([category], [manyToOne('category', fk(['parent_id'], 'category'))])), 'Category');

    expect(namesOf(entity)).toEqual(['id', 'category', 'categorys']);
    // FK que admite nulos: sin optional = false.
    expect(fieldOf(entity, 'category').annotations).toEqual([
      '@ManyToOne(fetch = FetchType.LAZY)',
      '@JoinColumn(name = "parent_id")',
    ]);
  });

  it('muchos a muchos: plural de la tabla relacionada en cada lado, con @JoinTable en el propietario', () => {
    const student = table('student', [col('id')], { pk: ['id'] });
    const course = table('course', [col('id')], { pk: ['id'] });
    const join = table('student_course', [col('student_id'), col('course_id')], { pk: ['student_id', 'course_id'], kind: 'join-table' });
    const result = plan(
      schema([student, course, join], [manyToMany('student_course', fk(['student_id'], 'student'), fk(['course_id'], 'course'))]),
    );

    expect(fieldOf(entityOf(result, 'Student'), 'courses')).toEqual<PlannedField>({
      name: 'courses',
      javaType: 'Set<Course>',
      initializer: 'new HashSet<>()',
      annotations: [
        '@ManyToMany',
        '@JoinTable(\n        name = "student_course",\n        joinColumns = @JoinColumn(name = "student_id", nullable = false),\n        inverseJoinColumns = @JoinColumn(name = "course_id", nullable = false))',
      ],
    });
    expect(fieldOf(entityOf(result, 'Course'), 'students')).toEqual<PlannedField>({
      name: 'students',
      javaType: 'Set<Student>',
      initializer: 'new HashSet<>()',
      annotations: ['@ManyToMany(mappedBy = "courses")'],
    });
  });

  it('muchos a muchos de una tabla consigo misma: cada lado añade su columna', () => {
    const follows = table('follows', [col('follower_id', 'bigint'), col('followed_id', 'bigint')], {
      pk: ['follower_id', 'followed_id'],
      kind: 'join-table',
    });
    const result = plan(schema([users, follows], [manyToMany('follows', fk(['follower_id'], 'users'), fk(['followed_id'], 'users'))]));
    const user = entityOf(result, 'User');

    expect(namesOf(user)).toEqual(['id', 'name', 'usersFollowed', 'usersFollower']);
    expect(fieldOf(user, 'usersFollower').annotations).toEqual(['@ManyToMany(mappedBy = "usersFollowed")']);
  });

  it('dos tablas intermedias entre las mismas entidades: se distinguen por su columna', () => {
    const post = table('post', [col('id')], { pk: ['id'] });
    const likes = table('likes', [col('user_id', 'bigint'), col('post_id')], { pk: ['user_id', 'post_id'], kind: 'join-table' });
    const saves = table('saves', [col('saver_id', 'bigint'), col('saved_post_id')], {
      pk: ['saver_id', 'saved_post_id'],
      kind: 'join-table',
    });
    const result = plan(
      schema(
        [users, post, likes, saves],
        [
          manyToMany('likes', fk(['user_id'], 'users'), fk(['post_id'], 'post')),
          manyToMany('saves', fk(['saver_id'], 'users'), fk(['saved_post_id'], 'post')),
        ],
      ),
    );

    expect(namesOf(entityOf(result, 'User'))).toEqual(['id', 'name', 'postsPost', 'postsSavedPost']);
    expect(namesOf(entityOf(result, 'Post'))).toEqual(['id', 'usersUser', 'usersSaver']);
  });
});

describe('planEntities · claves compuestas y columnas compartidas', () => {
  const book = table('book', [col('id')], { pk: ['id'] });
  const author = table('author', [col('id')], { pk: ['id'] });
  const bookAuthor = table('book_author', [col('book_id'), col('author_id'), col('position', 'integer')], {
    pk: ['book_id', 'author_id'],
    kind: 'association-entity',
    fks: [fk(['book_id'], 'book'), fk(['author_id'], 'author')],
  });
  const relationships = [
    manyToOne('book_author', fk(['book_id'], 'book'), 'association-entity'),
    manyToOne('book_author', fk(['author_id'], 'author'), 'association-entity'),
  ];

  it('@IdClass con los campos @Id; las relaciones sobre la PK son de solo lectura', () => {
    const result = plan(schema([book, author, bookAuthor], relationships));
    const entity = entityOf(result, 'BookAuthor');

    expect(entity.annotations).toContain('@IdClass(BookAuthorId.class)');
    expect(entity.idClass).toEqual({
      className: 'BookAuthorId',
      entityClassName: 'BookAuthor',
      fields: [
        { name: 'bookId', javaType: 'Integer' },
        { name: 'authorId', javaType: 'Integer' },
      ],
      imports: [],
    });
    expect(namesOf(entity)).toEqual(['bookId', 'authorId', 'position', 'book', 'author']);
    expect(fieldOf(entity, 'book').annotations).toEqual([
      '@ManyToOne(fetch = FetchType.LAZY, optional = false)',
      '@JoinColumn(name = "book_id", nullable = false, insertable = false, updatable = false)',
    ]);
    expect(result.relationships.map((mapping) => mapping.readOnly)).toEqual([true, true]);
  });

  it('autoincremento en una clave compuesta: sin @GeneratedValue y con aviso', () => {
    const line = table('line', [col('order_id'), col('line_no', 'integer', { autoIncrement: true })], { pk: ['order_id', 'line_no'] });
    const result = plan(schema([line]));

    expect(fieldOf(entityOf(result, 'Line'), 'lineNo').annotations).toEqual(['@Id', '@Column(name = "line_no", nullable = false)']);
    expect(result.diagnostics).toMatchObject([{ code: JPA_DIAGNOSTICS.generatedCompositeKey, location: { column: 'line_no' } }]);
  });

  it('FK compuesta dentro de la PK: @JoinColumns de solo lectura con referencedColumnName', () => {
    const warehouse = table('warehouse', [col('country', 'string'), col('code', 'string')], { pk: ['country', 'code'] });
    const stock = table('stock_item', [col('country', 'string'), col('warehouse_code', 'string'), col('sku', 'string')], {
      pk: ['country', 'warehouse_code', 'sku'],
    });
    const result = plan(
      schema([warehouse, stock], [manyToOne('stock_item', fk(['country', 'warehouse_code'], 'warehouse', ['country', 'code']))]),
    );

    expect(fieldOf(entityOf(result, 'StockItem'), 'warehouse').annotations[1]).toBe(
      [
        '@JoinColumns({',
        '        @JoinColumn(name = "country", referencedColumnName = "country", nullable = false, insertable = false, updatable = false),',
        '        @JoinColumn(name = "warehouse_code", referencedColumnName = "code", nullable = false, insertable = false, updatable = false)',
        '})',
      ].join('\n'),
    );
  });

  it('PK compartida (one-to-one): @Id simple y @OneToOne de solo lectura', () => {
    const profile = table('profile', [col('user_id', 'bigint'), col('bio', 'text')], { pk: ['user_id'] });
    const result = plan(schema([users, profile], [oneToOne('profile', fk(['user_id'], 'users'), 'primary-key-foreign-key')]));
    const entity = entityOf(result, 'Profile');

    expect(namesOf(entity)).toEqual(['userId', 'bio', 'user']);
    expect(fieldOf(entity, 'user').annotations).toEqual([
      '@OneToOne(fetch = FetchType.LAZY, optional = false)',
      '@JoinColumn(name = "user_id", nullable = false, insertable = false, updatable = false)',
    ]);
    expect(fieldOf(entityOf(result, 'User'), 'profile').annotations).toEqual(['@OneToOne(mappedBy = "user")']);
  });

  it('dos FK que comparten una columna: la segunda es de solo lectura y sus otras columnas son campos', () => {
    const region = table('region', [col('country'), col('code')], { pk: ['country', 'code'] });
    const country = table('country', [col('id')], { pk: ['id'] });
    const shop = table('shop', [col('id'), col('country'), col('region_code')], { pk: ['id'] });
    const result = plan(
      schema(
        [region, country, shop],
        [manyToOne('shop', fk(['country'], 'country')), manyToOne('shop', fk(['country', 'region_code'], 'region', ['country', 'code']))],
      ),
    );
    const entity = entityOf(result, 'Shop');

    expect(namesOf(entity)).toEqual(['id', 'regionCode', 'country', 'region']);
    expect(result.relationships.map((mapping) => mapping.readOnly)).toEqual([false, true]);
  });

  it('FK hacia una columna que no es la PK: referencedColumnName', () => {
    const account = table('account', [col('id'), col('code', 'string')], { pk: ['id'], uniques: [['code']] });
    const invoice = table('invoice', [col('id'), col('account_code', 'string')], { pk: ['id'] });
    const result = plan(schema([account, invoice], [manyToOne('invoice', fk(['account_code'], 'account', ['code']))]));

    expect(fieldOf(entityOf(result, 'Invoice'), 'account').annotations[1]).toBe(
      '@JoinColumn(name = "account_code", referencedColumnName = "code", nullable = false)',
    );
  });

  it('FK hacia una tabla intermedia pura: aviso y columnas como campos simples', () => {
    const join = table('user_roles', [col('user_id'), col('role_id')], { pk: ['user_id', 'role_id'], kind: 'join-table' });
    const grant = table('grant_log', [col('id'), col('user_id'), col('role_id')], { pk: ['id'] });
    const result = plan(
      schema([join, grant], [manyToOne('grant_log', fk(['user_id', 'role_id'], 'user_roles', ['user_id', 'role_id']))]),
    );

    expect(namesOf(entityOf(result, 'GrantLog'))).toEqual(['id', 'userId', 'roleId']);
    expect(result.relationships).toEqual([]);
    expect(result.diagnostics).toMatchObject([{ code: JPA_DIAGNOSTICS.relationshipToJoinTable }]);
  });
});
