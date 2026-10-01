import type { Diagnostic, DialectResolution, EnrichedSchemaModel, InferenceRule } from '@/core/model';
import type { GeneratedFile } from '../generator';
import {
  describeDialect,
  diagnosticsSection,
  inlineCode,
  markdownTable,
  TABLE_KIND_LABELS,
} from '../readme';
import type { EntityPlan, RelationshipMapping } from './planEntities';
import { ANNOTATION_PACKAGES, type JpaOptions } from './jpaOptions';

export interface JpaReadmeInput {
  readonly schema: EnrichedSchemaModel;
  readonly options: JpaOptions;
  /** Paquete realmente usado (puede diferir de `options.basePackage` si no era válido). */
  readonly packageName: string;
  readonly plan: EntityPlan;
  readonly files: readonly GeneratedFile[];
  /** Todos los diagnósticos del proceso: análisis, inferencia y generación. */
  readonly diagnostics: readonly Diagnostic[];
  readonly dialect: DialectResolution | undefined;
}

export const README_PATH = 'README.md';

export function renderJpaReadme(input: JpaReadmeInput): string {
  return [
    '# Entidades JPA generadas por SQLPARSER',
    '',
    'Clases de entidad JPA (Jakarta Persistence) generadas a partir de un script SQL. Este fichero recoge la configuración usada, las tablas y relaciones detectadas, los ficheros generados, cómo integrarlos y el registro de avisos y errores del proceso.',
    '',
    configurationSection(input),
    '',
    tablesSection(input),
    '',
    relationshipsSection(input.plan.relationships),
    '',
    filesSection(input.files),
    '',
    integrationSection(input.packageName),
    '',
    decisionsSection(),
    '',
    diagnosticsSection(input.diagnostics),
    '',
  ].join('\n');
}

function configurationSection({ schema, options, packageName, dialect }: JpaReadmeInput): string {
  const packageValue = packageName ? inlineCode(packageName) : 'Paquete por defecto (sin `package`)';
  const packageNote =
    options.basePackage.trim() !== packageName
      ? ` (el indicado, ${inlineCode(options.basePackage)}, no es un paquete Java válido)`
      : '';
  const numberLabels = { singular: 'singular', plural: 'plural', 'as-is': 'sin cambios' } as const;
  const caseLabels = { pascal: 'PascalCase', 'as-is': 'nombre de la tabla sin cambios' } as const;

  return [
    '## Configuración',
    '',
    markdownTable(
      ['Opción', 'Valor'],
      [
        ['Generador', 'JPA (Jakarta Persistence)'],
        ['Dialecto SQL', describeDialect(schema.dialect, dialect)],
        ['Paquete base', `${packageValue}${packageNote}`],
        ['Librería de anotaciones', `Jakarta Persistence (${inlineCode(ANNOTATION_PACKAGES[options.annotationLibrary])})`],
        [
          'Lombok',
          options.useLombok
            ? 'Solicitado, pero todavía no está implementado: se generan getters y setters'
            : 'No (se generan getters y setters)',
        ],
        ['Nombres de clase', `${capitalizeFirst(numberLabels[options.classNaming.number])}, ${caseLabels[options.classNaming.case]}`],
        ['Nombres de campo', 'camelCase'],
      ],
    ),
  ].join('\n');
}

function tablesSection({ schema, plan }: JpaReadmeInput): string {
  const rows = schema.tables.map((table) => [
    inlineCode(table.name),
    TABLE_KIND_LABELS[table.kind],
    table.kind === 'join-table' ? '— (`@ManyToMany`)' : inlineCode(plan.classNames.get(table.name.toLowerCase()) ?? '—'),
    String(table.columns.length),
    table.primaryKey ? table.primaryKey.columns.join(', ') : 'Sin clave primaria',
  ]);
  return [
    '## Tablas detectadas',
    '',
    `${schema.tables.length} tabla(s).`,
    '',
    markdownTable(['Tabla', 'Tipo', 'Clase', 'Columnas', 'Clave primaria'], rows),
  ].join('\n');
}

const RELATIONSHIP_ANNOTATIONS: Readonly<Record<RelationshipMapping['relationship']['kind'], [string, string]>> = {
  'many-to-one': ['@ManyToOne', '@OneToMany'],
  'one-to-one': ['@OneToOne', '@OneToOne(mappedBy)'],
  'many-to-many': ['@ManyToMany', '@ManyToMany(mappedBy)'],
};

function relationshipsSection(relationships: readonly RelationshipMapping[]): string {
  const title = '## Relaciones inferidas';
  if (relationships.length === 0) return `${title}\n\nNo se ha inferido ninguna relación.`;

  const rows = relationships.map((mapping) => {
    const [ownerAnnotation, inverseAnnotation] = RELATIONSHIP_ANNOTATIONS[mapping.relationship.kind];
    return [
      `${inlineCode(`${mapping.owner.className}.${mapping.owner.field}`)} ${ownerAnnotation}${mapping.readOnly ? ' (solo lectura)' : ''}`,
      `${inlineCode(`${mapping.inverse.className}.${mapping.inverse.field}`)} ${inverseAnnotation}`,
      describeRule(mapping),
    ];
  });
  return [
    title,
    '',
    'Cada relación indica el lado propietario (el que tiene la clave foránea o la tabla intermedia), el lado inverso y la regla que la originó.',
    '',
    markdownTable(['Lado propietario', 'Lado inverso', 'Regla aplicada'], rows),
  ].join('\n');
}

const RULE_DESCRIPTIONS: Readonly<Record<InferenceRule, string>> = {
  'foreign-key': 'Clave foránea: muchos a uno',
  'unique-foreign-key': 'Clave foránea con UNIQUE: uno a uno',
  'primary-key-foreign-key': 'Clave foránea que es también la clave primaria: uno a uno con clave compartida',
  'join-table': 'Tabla intermedia pura: muchos a muchos',
  'association-entity': 'Clave foránea de una entidad de asociación: muchos a uno',
};

function describeRule({ relationship }: RelationshipMapping): string {
  const detail =
    relationship.kind === 'many-to-many'
      ? `${inlineCode(relationship.joinTable)}`
      : `${inlineCode(`${relationship.source}(${relationship.foreignKey.columns.join(', ')})`)} → ${inlineCode(relationship.target)}`;
  return `${RULE_DESCRIPTIONS[relationship.rule]} (${detail})`;
}

function filesSection(files: readonly GeneratedFile[]): string {
  return [
    '## Ficheros generados',
    '',
    `${files.length + 1} fichero(s):`,
    '',
    ...files.map((file) => `- ${inlineCode(file.path)}`),
    `- ${inlineCode(README_PATH)} (este fichero)`,
  ].join('\n');
}

function integrationSection(packageName: string): string {
  const packageText = packageName ? inlineCode(packageName) : 'por defecto';
  return [
    '## Cómo integrarlo',
    '',
    '1. Copia el contenido de `src/main/java/` en el mismo directorio de tu proyecto (Java 17 o superior).',
    '2. Añade Jakarta Persistence 3.x y un proveedor. Con Spring Boot 3 basta con `spring-boot-starter-data-jpa`; sin Spring, la API y un proveedor como Hibernate 6:',
    '',
    '   ```xml',
    '   <dependency>',
    '       <groupId>jakarta.persistence</groupId>',
    '       <artifactId>jakarta.persistence-api</artifactId>',
    '       <version>3.1.0</version>',
    '   </dependency>',
    '   ```',
    '',
    `3. Comprueba que el paquete ${packageText} se escanea como paquete de entidades (en Spring Boot, que esté bajo el paquete de la aplicación o indicado con \`@EntityScan\`).`,
    '4. Revisa el registro de avisos y errores: señala los mapeos que necesitan atención.',
  ].join('\n');
}

function decisionsSection(): string {
  return [
    '## Decisiones de mapeo',
    '',
    '- **Nombres.** Clases en PascalCase y campos en camelCase a partir de los nombres SQL (`purchase_order` → `PurchaseOrder`, `customer_id` → `customerId`; los nombres en MAYÚSCULAS de Oracle se pasan antes a minúsculas). Las tablas cuyo nombre es una palabra reservada de Java (`class`) generan una clase con el sufijo `Entity` (`ClassEntity`), sin aplicar el singular; lo mismo las clases que coinciden con tipos usados en el código (`Table`, `List`…). Los campos que coinciden con palabras reservadas llevan un `_` final.',
    '- **Singular y plural.** Se aplica una regla simple: quitar o poner una `s` final (`users` → `User`, `purchase_order` → `purchaseOrders`). No se aplican reglas ortográficas, así que `categories` da `Categorie`.',
    '- **Atributos de relación.** Se llaman como la tabla relacionada: en singular para un objeto (`customer`) y en plural para una colección (`purchaseOrders`). Si dos atributos se llamarían igual (por ejemplo, dos claves foráneas hacia la misma tabla), se les añade el nombre de la columna de la clave foránea sin `_id` (`userCreatedBy`, `documentsCreatedBy`); si aún coinciden, un número.',
    '- **Nombres físicos.** `@Table` y `@Column` llevan siempre el nombre de la base de datos, para no depender de la estrategia de nombres del proveedor.',
    '- **Autoincremento.** `@GeneratedValue(strategy = GenerationType.IDENTITY)`. Las secuencias (`seq.NEXTVAL`, `nextval(...)`, triggers de Oracle) también se mapean como `IDENTITY`: el uso de `GenerationType.SEQUENCE` está pendiente.',
    '- **Claves compuestas.** `@IdClass` con una clase `XxxId` (`Serializable`, con `equals` y `hashCode`).',
    '- **Columnas compartidas.** Una columna solo la escribe un mapeo. Si una relación usa columnas de la clave primaria o de otra relación, se mapea en solo lectura (`insertable = false, updatable = false`) y la columna se asigna mediante el campo `@Id` o el campo correspondiente.',
    '- **Relaciones.** `@ManyToOne` y `@OneToOne` con `FetchType.LAZY` y sin `cascade`. Los lados inversos se generan siempre: `List` para `@OneToMany` y `Set` para `@ManyToMany`. Las tablas intermedias puras no generan clase: se mapean con `@ManyToMany` y `@JoinTable`.',
    '- **Tipos.** Siempre clases envoltorio (`Integer`, `Long`…). Fechas con `java.time`. Los ENUM cuyos valores son identificadores Java válidos se generan como `enum` anidado con `@Enumerated(EnumType.STRING)`; el resto, como `String`. Los tipos sin equivalente, como `String` con aviso. `@Lob` solo para CLOB, BLOB y los TEXT/BLOB grandes de MySQL.',
    '- **Valores por defecto.** Los `DEFAULT` del script no se trasladan: JPA no tiene una forma portable de declararlos.',
    '- **Tablas sin clave primaria.** Se generan sin `@Id` y con un aviso: JPA lo exige y hay que añadirlo a mano.',
  ].join('\n');
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
