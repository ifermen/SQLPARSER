import type { Column, Diagnostic, EnrichedSchemaModel, EnrichedTable, ForeignKey, Relationship } from '@/core/model';
import { JPA_DIAGNOSTICS } from './diagnosticCodes';
import {
  foreignKeyDiscriminator,
  isValidEnumConstant,
  javadocText,
  javaString,
  physicalName,
  pluralFieldName,
  singularFieldName,
  toClassName,
  toFieldName,
  toNestedTypeName,
} from './javaNames';
import { ANNOTATION_PACKAGES, type JpaOptions } from './jpaOptions';
import { importOf, isLob, javaTypeFor, STRING_TYPE } from './typeMapping';

/**
 * Fase 1 del generador: convierte el esquema enriquecido en una descripción
 * de las clases Java (nombres, campos, anotaciones, imports). La fase 2
 * (`renderJava.ts`) solo la convierte en texto.
 */

export interface PlannedField {
  readonly name: string;
  readonly javaType: string;
  /** Anotaciones ya formateadas; una anotación puede ocupar varias líneas. */
  readonly annotations: readonly string[];
  readonly initializer?: string;
  readonly javadoc?: string;
}

export interface PlannedEnum {
  readonly name: string;
  readonly constants: readonly string[];
}

export interface PlannedIdClass {
  readonly className: string;
  /** Clase de entidad a la que pertenece. */
  readonly entityClassName: string;
  readonly fields: readonly { readonly name: string; readonly javaType: string }[];
  readonly imports: readonly string[];
}

export interface PlannedEntity {
  readonly className: string;
  readonly tableName: string;
  readonly javadoc: readonly string[];
  readonly annotations: readonly string[];
  readonly fields: readonly PlannedField[];
  readonly enums: readonly PlannedEnum[];
  readonly idClass?: PlannedIdClass;
  /** Imports de la clase de entidad (nombres completos, sin ordenar). */
  readonly imports: readonly string[];
}

export interface FieldReference {
  readonly className: string;
  readonly field: string;
}

/** Cómo se ha mapeado cada relación inferida (para el README). */
export interface RelationshipMapping {
  readonly relationship: Relationship;
  readonly owner: FieldReference;
  readonly inverse: FieldReference;
  /** La relación reutiliza columnas ya mapeadas y es de solo lectura. */
  readonly readOnly: boolean;
}

export interface EntityPlan {
  readonly entities: readonly PlannedEntity[];
  /** Clase generada para cada tabla (clave: nombre de la tabla en minúsculas). */
  readonly classNames: ReadonlyMap<string, string>;
  readonly relationships: readonly RelationshipMapping[];
  readonly diagnostics: readonly Diagnostic[];
}

type FieldRole = 'basic' | 'owning' | 'many-to-many-owner' | 'inverse' | 'many-to-many-inverse';

interface FieldSpec {
  readonly role: FieldRole;
  readonly base: string;
  readonly discriminator: string;
  readonly column?: Column;
  readonly relatedTable?: string;
  readonly relationshipIndex?: number;
  discriminated: boolean;
  name: string;
}

const key = (name: string): string => name.toLowerCase();
const lowerSet = (columns: readonly string[]): Set<string> => new Set(columns.map(key));

export function planEntities(schema: EnrichedSchemaModel, options: JpaOptions): EntityPlan {
  const diagnostics: Diagnostic[] = [];
  const tables = new Map(schema.tables.map((table) => [key(table.name), table]));
  const entityTables = schema.tables.filter((table) => table.kind !== 'join-table');
  const { classNames, idClassNames } = assignClassNames(entityTables, options, diagnostics);
  const mappable = findMappableRelationships(schema, classNames, diagnostics);

  // Columnas de cada tabla y relaciones de solo lectura.
  const readOnly = new Set<number>();
  const specsByTable = new Map<string, FieldSpec[]>();
  for (const table of entityTables) {
    const owning = mappable.filter(
      (index) => isForeignKeyRelationship(relationshipAt(schema, index)) && sameTable(relationshipAt(schema, index).source, table.name),
    );
    const writableColumns = claimColumns(schema, table, owning, readOnly);
    specsByTable.set(key(table.name), buildFieldSpecs(schema, table, mappable, writableColumns));
  }
  for (const specs of specsByTable.values()) resolveFieldNames(specs);

  const fieldName = (table: string, index: number, roles: readonly FieldRole[]): string =>
    specsByTable.get(key(table))?.find((spec) => spec.relationshipIndex === index && roles.includes(spec.role))?.name ?? '';

  const entities = entityTables.map((table) =>
    buildEntity({
      schema,
      table,
      tables,
      options,
      classNames,
      idClassName: idClassNames.get(key(table.name)),
      specs: specsByTable.get(key(table.name)) ?? [],
      readOnly,
      ownerFieldName: (index) => {
        const relationship = relationshipAt(schema, index);
        return fieldName(relationship.source, index, ['owning', 'many-to-many-owner']);
      },
      diagnostics,
    }),
  );

  const relationships = mappable.map((index): RelationshipMapping => {
    const relationship = relationshipAt(schema, index);
    return {
      relationship,
      owner: {
        className: classNames.get(key(relationship.source)) ?? relationship.source,
        field: fieldName(relationship.source, index, ['owning', 'many-to-many-owner']),
      },
      inverse: {
        className: classNames.get(key(relationship.target)) ?? relationship.target,
        field: fieldName(relationship.target, index, ['inverse', 'many-to-many-inverse']),
      },
      readOnly: readOnly.has(index),
    };
  });

  return { entities, classNames, relationships, diagnostics };
}

// ---------------------------------------------------------------------------
// Nombres de clase
// ---------------------------------------------------------------------------

function assignClassNames(
  entityTables: readonly EnrichedTable[],
  options: JpaOptions,
  diagnostics: Diagnostic[],
): { classNames: Map<string, string>; idClassNames: Map<string, string> } {
  // Los nombres de fichero no distinguen mayúsculas en Windows y macOS.
  const used = new Set<string>();
  const unique = (candidate: string): string => {
    let name = candidate;
    for (let suffix = 2; used.has(key(name)); suffix++) name = `${candidate}${suffix}`;
    used.add(key(name));
    return name;
  };

  const classNames = new Map<string, string>();
  for (const table of entityTables) {
    const candidate = toClassName(table.name, options.classNaming);
    const name = unique(candidate);
    if (name !== candidate) {
      diagnostics.push({
        severity: 'warning',
        stage: 'generator',
        code: JPA_DIAGNOSTICS.classNameCollision,
        message: `La tabla "${table.name}" daría la clase ${candidate}, que ya existe; se genera como ${name}.`,
        fragment: tableFragment(table),
        location: { table: table.name },
      });
    }
    classNames.set(key(table.name), name);
  }

  const idClassNames = new Map<string, string>();
  for (const table of entityTables) {
    if ((table.primaryKey?.columns.length ?? 0) > 1) {
      idClassNames.set(key(table.name), unique(`${classNames.get(key(table.name)) ?? 'Entity'}Id`));
    }
  }
  return { classNames, idClassNames };
}

// ---------------------------------------------------------------------------
// Relaciones mapeables y columnas
// ---------------------------------------------------------------------------

function relationshipAt(schema: EnrichedSchemaModel, index: number): Relationship {
  const relationship = schema.relationships[index];
  if (!relationship) throw new Error(`Relación ${index} inexistente`);
  return relationship;
}

function isForeignKeyRelationship(
  relationship: Relationship,
): relationship is Exclude<Relationship, { kind: 'many-to-many' }> {
  return relationship.kind !== 'many-to-many';
}

function sameTable(a: string, b: string): boolean {
  return key(a) === key(b);
}

/** Índices de las relaciones cuyos extremos tienen clase. Una FK hacia una tabla intermedia pura no la tiene. */
function findMappableRelationships(
  schema: EnrichedSchemaModel,
  classNames: ReadonlyMap<string, string>,
  diagnostics: Diagnostic[],
): number[] {
  const mappable: number[] = [];
  schema.relationships.forEach((relationship, index) => {
    if (classNames.has(key(relationship.source)) && classNames.has(key(relationship.target))) {
      mappable.push(index);
      return;
    }
    if (isForeignKeyRelationship(relationship)) {
      diagnostics.push({
        severity: 'warning',
        stage: 'generator',
        code: JPA_DIAGNOSTICS.relationshipToJoinTable,
        message: `La clave foránea de "${relationship.source}" apunta a la tabla intermedia "${relationship.target}", que no genera clase; sus columnas se mapean como campos simples.`,
        fragment: foreignKeyFragment(relationship.foreignKey),
        location: { table: relationship.source, column: relationship.foreignKey.columns.join(', ') },
      });
    }
  });
  return mappable;
}

/**
 * Decide qué columnas escribe cada relación. Una columna solo puede escribirla
 * una asignación: las de la PK son campos `@Id`, y una relación que reutiliza
 * una columna ya asignada (de la PK o de otra FK) es de solo lectura. Devuelve
 * las columnas que escriben las relaciones (y que por tanto no son campos simples).
 */
function claimColumns(
  schema: EnrichedSchemaModel,
  table: EnrichedTable,
  owning: readonly number[],
  readOnly: Set<number>,
): Set<string> {
  const claimed = lowerSet(table.primaryKey?.columns ?? []);
  const writable = new Set<string>();
  for (const index of owning) {
    const relationship = relationshipAt(schema, index);
    if (!isForeignKeyRelationship(relationship)) continue;
    const columns = relationship.foreignKey.columns.map(key);
    if (columns.some((column) => claimed.has(column))) {
      readOnly.add(index);
    } else {
      for (const column of columns) {
        claimed.add(column);
        writable.add(column);
      }
    }
  }
  return writable;
}

// ---------------------------------------------------------------------------
// Nombres de campo
// ---------------------------------------------------------------------------

function buildFieldSpecs(
  schema: EnrichedSchemaModel,
  table: EnrichedTable,
  mappable: readonly number[],
  writableColumns: ReadonlySet<string>,
): FieldSpec[] {
  const spec = (fields: Omit<FieldSpec, 'discriminated' | 'name'>): FieldSpec => ({
    ...fields,
    discriminated: false,
    name: fields.base,
  });

  const specs: FieldSpec[] = table.columns
    .filter((column) => !writableColumns.has(key(column.name)))
    .map((column) => spec({ role: 'basic', base: toFieldName(column.name), discriminator: '', column }));

  const roles: [FieldRole, (relationship: Relationship) => FieldSpec | null][] = [
    [
      'owning',
      (r) =>
        isForeignKeyRelationship(r) && sameTable(r.source, table.name)
          ? spec({
              role: 'owning',
              base: singularFieldName(r.target),
              discriminator: foreignKeyDiscriminator(r.foreignKey.columns),
              relatedTable: key(r.target),
            })
          : null,
    ],
    [
      'many-to-many-owner',
      (r) =>
        r.kind === 'many-to-many' && sameTable(r.source, table.name)
          ? spec({
              role: 'many-to-many-owner',
              base: pluralFieldName(r.target),
              discriminator: foreignKeyDiscriminator(r.targetForeignKey.columns),
              relatedTable: key(r.target),
            })
          : null,
    ],
    [
      'inverse',
      (r) =>
        isForeignKeyRelationship(r) && sameTable(r.target, table.name)
          ? spec({
              role: 'inverse',
              base: r.kind === 'many-to-one' ? pluralFieldName(r.source) : singularFieldName(r.source),
              discriminator: foreignKeyDiscriminator(r.foreignKey.columns),
              relatedTable: key(r.source),
            })
          : null,
    ],
    [
      'many-to-many-inverse',
      (r) =>
        r.kind === 'many-to-many' && sameTable(r.target, table.name)
          ? spec({
              role: 'many-to-many-inverse',
              base: pluralFieldName(r.source),
              discriminator: foreignKeyDiscriminator(r.sourceForeignKey.columns),
              relatedTable: key(r.source),
            })
          : null,
    ],
  ];

  for (const [, build] of roles) {
    for (const index of mappable) {
      const built = build(relationshipAt(schema, index));
      if (built) specs.push({ ...built, relationshipIndex: index });
    }
  }
  return specs;
}

/**
 * Resuelve los nombres de campo de una clase. Un atributo de relación se llama
 * como la tabla relacionada (singular o plural) y solo se añade el
 * discriminador (columnas de la FK sin `_id`) cuando haría falta para que no se
 * repita:
 * 1. Si varios campos coincidirían, los de relación implicados añaden su
 *    discriminador (`userCreatedBy`, `userUpdatedBy`); los campos simples
 *    conservan el nombre. Dos relaciones con la misma tabla en sentidos
 *    distintos (`department` y `departments`) no coinciden y no lo necesitan.
 * 2. Como último recurso, un número: `customer2`.
 */
function resolveFieldNames(specs: FieldSpec[]): void {
  const relationSpecs = specs.filter((spec) => spec.role !== 'basic');
  const nameOf = (spec: FieldSpec): string =>
    spec.discriminated && spec.discriminator ? `${spec.base}${spec.discriminator}` : spec.base;

  for (;;) {
    const counts = new Map<string, number>();
    for (const spec of specs) counts.set(nameOf(spec), (counts.get(nameOf(spec)) ?? 0) + 1);
    const pending = relationSpecs.filter(
      (spec) => !spec.discriminated && spec.discriminator && (counts.get(nameOf(spec)) ?? 0) > 1,
    );
    if (pending.length === 0) break;
    for (const spec of pending) spec.discriminated = true;
  }

  const used = new Set<string>();
  for (const spec of specs) {
    let name = nameOf(spec);
    for (let suffix = 2; used.has(name); suffix++) name = `${nameOf(spec)}${suffix}`;
    used.add(name);
    spec.name = name;
  }
}

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

interface EntityContext {
  readonly schema: EnrichedSchemaModel;
  readonly table: EnrichedTable;
  readonly tables: ReadonlyMap<string, EnrichedTable>;
  readonly options: JpaOptions;
  readonly classNames: ReadonlyMap<string, string>;
  readonly idClassName: string | undefined;
  readonly specs: readonly FieldSpec[];
  readonly readOnly: ReadonlySet<number>;
  readonly ownerFieldName: (relationshipIndex: number) => string;
  readonly diagnostics: Diagnostic[];
}

function buildEntity(context: EntityContext): PlannedEntity {
  const { table, classNames, idClassName, specs, diagnostics } = context;
  const className = classNames.get(key(table.name)) ?? table.name;
  const imports = new Set<string>();
  const annotationPackage = ANNOTATION_PACKAGES[context.options.annotationLibrary];
  const jpa = (name: string): string => {
    imports.add(`${annotationPackage}.${name}`);
    return name;
  };
  const enums: PlannedEnum[] = [];
  const primaryKey = lowerSet(table.primaryKey?.columns ?? []);
  const singleUniques = lowerSet(
    table.uniqueConstraints.filter((unique) => unique.columns.length === 1).flatMap((unique) => unique.columns),
  );

  const fields = specs.map((spec): PlannedField => {
    if (spec.role === 'basic' && spec.column) {
      return buildBasicField(spec.name, spec.column, {
        ...context,
        className,
        isPrimaryKey: primaryKey.has(key(spec.column.name)),
        singlePrimaryKey: primaryKey.size === 1,
        unique: singleUniques.has(key(spec.column.name)),
        jpa,
        imports,
        enums,
      });
    }
    return buildRelationshipField(spec, { ...context, jpa, imports, singleUniques });
  });

  const javadoc = table.comment ? [javadocText(table.comment)] : [];
  if (!table.primaryKey) {
    diagnostics.push({
      severity: 'warning',
      stage: 'generator',
      code: JPA_DIAGNOSTICS.missingPrimaryKey,
      message: `La tabla "${table.name}" no tiene clave primaria: la clase ${className} se genera sin @Id y JPA lo exige.`,
      fragment: tableFragment(table),
      location: { table: table.name },
    });
    javadoc.push('ATENCIÓN: la tabla no tiene clave primaria. JPA exige un @Id: añádelo antes de usar esta entidad.');
  }

  const annotations = [`@${jpa('Entity')}`, tableAnnotation(table, jpa)];
  let idClass: PlannedIdClass | undefined;
  if (idClassName) {
    annotations.push(`@${jpa('IdClass')}(${idClassName}.class)`);
    const idFields = fields
      .filter((field) => field.annotations.includes('@Id'))
      .map((field) => ({
        name: field.name,
        javaType: enums.some((planned) => planned.name === field.javaType) ? `${className}.${field.javaType}` : field.javaType,
      }));
    idClass = {
      className: idClassName,
      entityClassName: className,
      fields: idFields,
      imports: idFields.flatMap((field) => importOf(field.javaType) ?? []),
    };
  }

  return { className, tableName: table.name, javadoc, annotations, fields, enums, ...(idClass ? { idClass } : {}), imports: [...imports] };
}

function tableAnnotation(table: EnrichedTable, jpa: (name: string) => string): string {
  const composite = table.uniqueConstraints.filter((unique) => unique.columns.length > 1);
  if (composite.length === 0) return `@${jpa('Table')}(name = ${physicalName(table.name)})`;

  const constraints = composite.map((unique) => {
    const name = unique.name ? `name = ${javaString(unique.name)}, ` : '';
    return `        @${jpa('UniqueConstraint')}(${name}columnNames = {${unique.columns.map(javaString).join(', ')}})`;
  });
  return [`@${jpa('Table')}(name = ${physicalName(table.name)}, uniqueConstraints = {`, constraints.join(',\n'), '})'].join('\n');
}

interface BasicFieldContext extends EntityContext {
  readonly className: string;
  readonly isPrimaryKey: boolean;
  readonly singlePrimaryKey: boolean;
  readonly unique: boolean;
  readonly jpa: (name: string) => string;
  readonly imports: Set<string>;
  readonly enums: PlannedEnum[];
}

function buildBasicField(name: string, column: Column, context: BasicFieldContext): PlannedField {
  const { table, jpa, diagnostics } = context;
  const annotations: string[] = [];
  const location = { table: table.name, column: column.name };

  if (context.isPrimaryKey) {
    annotations.push(`@${jpa('Id')}`);
    if (column.autoIncrement && context.singlePrimaryKey) {
      annotations.push(`@${jpa('GeneratedValue')}(strategy = ${jpa('GenerationType')}.IDENTITY)`);
    } else if (column.autoIncrement) {
      diagnostics.push({
        severity: 'warning',
        stage: 'generator',
        code: JPA_DIAGNOSTICS.generatedCompositeKey,
        message: `La columna autoincremental "${table.name}.${column.name}" forma parte de una clave compuesta; @GeneratedValue no se admite con @IdClass y no se genera.`,
        fragment: columnFragment(column),
        location,
      });
    }
  }

  let javaType = STRING_TYPE.name;
  if (column.type.logical === 'enum') {
    const values = column.type.enumValues ?? [];
    if (values.length > 0 && values.every(isValidEnumConstant) && new Set(values).size === values.length) {
      const enumName = toNestedTypeName(name, context.className);
      context.enums.push({ name: enumName, constants: values });
      annotations.push(`@${jpa('Enumerated')}(${jpa('EnumType')}.STRING)`);
      javaType = enumName;
    } else {
      diagnostics.push({
        severity: 'warning',
        stage: 'generator',
        code: JPA_DIAGNOSTICS.enumAsString,
        message: `Los valores del ENUM de "${table.name}.${column.name}" no son identificadores Java válidos; se mapea como String.`,
        fragment: columnFragment(column),
        location,
      });
    }
  } else {
    const mapped = javaTypeFor(column.type.logical);
    if (mapped) {
      javaType = mapped.name;
      if (mapped.import) context.imports.add(mapped.import);
    } else {
      diagnostics.push({
        severity: 'warning',
        stage: 'generator',
        code: JPA_DIAGNOSTICS.unmappedType,
        message: `El tipo "${column.type.raw}" de "${table.name}.${column.name}" no tiene equivalente Java; se mapea como String.`,
        fragment: columnFragment(column),
        location,
      });
    }
  }

  if (isLob(column.type)) annotations.push(`@${jpa('Lob')}`);

  const attributes = [`name = ${physicalName(column.name)}`];
  if (!column.nullable) attributes.push('nullable = false');
  if (context.unique) attributes.push('unique = true');
  if ((column.type.logical === 'string' || column.type.logical === 'binary') && column.type.length !== undefined) {
    attributes.push(`length = ${column.type.length}`);
  }
  if (column.type.logical === 'decimal' && column.type.precision !== undefined) {
    attributes.push(`precision = ${column.type.precision}`);
    if (column.type.scale !== undefined) attributes.push(`scale = ${column.type.scale}`);
  }
  annotations.push(`@${jpa('Column')}(${attributes.join(', ')})`);

  return { name, javaType, annotations, ...(column.comment ? { javadoc: javadocText(column.comment) } : {}) };
}

interface RelationshipFieldContext extends EntityContext {
  readonly jpa: (name: string) => string;
  readonly imports: Set<string>;
  readonly singleUniques: ReadonlySet<string>;
}

function buildRelationshipField(spec: FieldSpec, context: RelationshipFieldContext): PlannedField {
  const { schema, tables, classNames, jpa, imports } = context;
  const index = spec.relationshipIndex ?? -1;
  const relationship = relationshipAt(schema, index);
  const sourceClass = classNames.get(key(relationship.source)) ?? relationship.source;
  const targetClass = classNames.get(key(relationship.target)) ?? relationship.target;
  const sourceTable = tables.get(key(relationship.source));
  const targetTable = tables.get(key(relationship.target));
  const mappedBy = `mappedBy = ${javaString(context.ownerFieldName(index))}`;

  switch (spec.role) {
    case 'owning': {
      if (!isForeignKeyRelationship(relationship) || !sourceTable) break;
      const { foreignKey } = relationship;
      const annotation = relationship.kind === 'one-to-one' ? 'OneToOne' : 'ManyToOne';
      const optional = foreignKey.columns.every((name) => !columnOf(sourceTable, name)?.nullable)
        ? ', optional = false'
        : '';
      return {
        name: spec.name,
        javaType: targetClass,
        annotations: [
          `@${jpa(annotation)}(fetch = ${jpa('FetchType')}.LAZY${optional})`,
          joinColumns(foreignKey, sourceTable, targetTable, {
            jpa,
            readOnly: context.readOnly.has(index),
            singleUniques: context.singleUniques,
          }),
        ],
      };
    }
    case 'many-to-many-owner': {
      if (relationship.kind !== 'many-to-many') break;
      const joinTable = tables.get(key(relationship.joinTable));
      if (!joinTable) break;
      imports.add('java.util.Set').add('java.util.HashSet');
      const joinOptions = { jpa, readOnly: false, singleUniques: new Set<string>(), nested: true };
      return {
        name: spec.name,
        javaType: `Set<${targetClass}>`,
        initializer: 'new HashSet<>()',
        annotations: [
          `@${jpa('ManyToMany')}`,
          [
            `@${jpa('JoinTable')}(`,
            `        name = ${physicalName(relationship.joinTable)},`,
            `        joinColumns = ${joinColumns(relationship.sourceForeignKey, joinTable, sourceTable, joinOptions)},`,
            `        inverseJoinColumns = ${joinColumns(relationship.targetForeignKey, joinTable, targetTable, joinOptions)})`,
          ].join('\n'),
        ],
      };
    }
    case 'inverse': {
      if (relationship.kind === 'many-to-one') {
        imports.add('java.util.List').add('java.util.ArrayList');
        return {
          name: spec.name,
          javaType: `List<${sourceClass}>`,
          initializer: 'new ArrayList<>()',
          annotations: [`@${jpa('OneToMany')}(${mappedBy})`],
        };
      }
      return { name: spec.name, javaType: sourceClass, annotations: [`@${jpa('OneToOne')}(${mappedBy})`] };
    }
    case 'many-to-many-inverse':
      imports.add('java.util.Set').add('java.util.HashSet');
      return {
        name: spec.name,
        javaType: `Set<${sourceClass}>`,
        initializer: 'new HashSet<>()',
        annotations: [`@${jpa('ManyToMany')}(${mappedBy})`],
      };
    default:
      break;
  }
  throw new Error(`Campo de relación sin datos suficientes: ${spec.name}`);
}

interface JoinColumnOptions {
  readonly jpa: (name: string) => string;
  readonly readOnly: boolean;
  readonly singleUniques: ReadonlySet<string>;
  /** Dentro de `@JoinTable`: una sangría más. */
  readonly nested?: boolean;
}

/** `@JoinColumn(...)` o, si la FK es compuesta, `@JoinColumns({ ... })` (o `{ ... }` dentro de `@JoinTable`). */
function joinColumns(
  foreignKey: ForeignKey,
  owner: EnrichedTable,
  target: EnrichedTable | undefined,
  options: JoinColumnOptions,
): string {
  const { jpa } = options;
  const withReference =
    foreignKey.columns.length > 1 ||
    !target?.primaryKey ||
    !sameColumnList(foreignKey.referencedColumns, target.primaryKey.columns);

  const columns = foreignKey.columns.map((name, position) => {
    const attributes = [`name = ${physicalName(name)}`];
    const referenced = foreignKey.referencedColumns[position];
    if (withReference && referenced) attributes.push(`referencedColumnName = ${physicalName(referenced)}`);
    if (columnOf(owner, name)?.nullable === false) attributes.push('nullable = false');
    if (options.singleUniques.has(key(name))) attributes.push('unique = true');
    if (options.readOnly) attributes.push('insertable = false', 'updatable = false');
    return `@${jpa('JoinColumn')}(${attributes.join(', ')})`;
  });

  const [single] = columns;
  if (columns.length === 1 && single) return single;
  const indent = options.nested ? '                ' : '        ';
  const closing = options.nested ? '        }' : '})';
  const body = columns.map((column) => `${indent}${column}`).join(',\n');
  return options.nested ? `{\n${body}\n${closing}` : `@${jpa('JoinColumns')}({\n${body}\n${closing}`;
}

function sameColumnList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((column, position) => key(column) === key(b[position] ?? ''));
}

function columnOf(table: EnrichedTable, name: string): Column | undefined {
  return table.columns.find((column) => key(column.name) === key(name));
}

// ---------------------------------------------------------------------------
// Fragmentos de diagnóstico (el generador no tiene el script: se reconstruyen)
// ---------------------------------------------------------------------------

function tableFragment(table: EnrichedTable): string {
  return `CREATE TABLE ${table.name} (${table.columns.map((column) => column.name).join(', ')})`;
}

function columnFragment(column: Column): string {
  return `${column.name} ${column.type.raw}`.trim();
}

function foreignKeyFragment(foreignKey: ForeignKey): string {
  return `FOREIGN KEY (${foreignKey.columns.join(', ')}) REFERENCES ${foreignKey.referencedTable} (${foreignKey.referencedColumns.join(', ')})`;
}
