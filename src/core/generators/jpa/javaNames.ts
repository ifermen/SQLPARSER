import { singularize, pluralize } from '@/utils/inflection';
import { capitalize, splitWords, toCamelCase, toPascalCase } from '@/utils/naming';
import type { ClassNamingOptions } from '../generator';

/** Palabras reservadas y literales de Java (incluidas las contextuales que no pueden ser nombres de tipo). */
const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null', 'var', 'yield', 'record', 'sealed', 'permits', '_',
]);

/**
 * Nombres de tipo que usa el código generado (java.lang, imports y anotaciones).
 * Una clase con uno de estos nombres ocultaría el tipo y el código no compilaría.
 */
const RESERVED_TYPE_NAMES = new Set([
  'Object', 'String', 'Class', 'Override', 'Boolean', 'Byte', 'Short', 'Integer', 'Long', 'Float',
  'Double', 'Character', 'Number', 'Enum', 'Record', 'Void', 'System', 'Math',
  'List', 'ArrayList', 'Set', 'HashSet', 'UUID', 'Objects', 'Arrays', 'Serializable', 'BigDecimal',
  'LocalDate', 'LocalTime', 'LocalDateTime', 'OffsetDateTime',
  'Entity', 'Table', 'Id', 'IdClass', 'Column', 'GeneratedValue', 'GenerationType', 'ManyToOne',
  'OneToMany', 'OneToOne', 'ManyToMany', 'JoinColumn', 'JoinColumns', 'JoinTable', 'FetchType',
  'Enumerated', 'EnumType', 'Lob', 'UniqueConstraint',
]);

const IDENTIFIER = /^[A-Za-z_$À-￿][\w$À-￿]*$/;

/** Convierte cualquier texto en un identificador Java válido. */
export function toJavaIdentifier(candidate: string, fallback: string): string {
  let identifier = candidate.replace(/[^\w$À-￿]/g, '_');
  if (!identifier || /^_+$/.test(identifier)) identifier = fallback;
  if (/^\d/.test(identifier)) identifier = `_${identifier}`;
  return JAVA_KEYWORDS.has(identifier) ? `${identifier}_` : identifier;
}

/**
 * Nombre de clase de una tabla según la estrategia de nombres.
 *
 * Si el nombre de la tabla es una palabra reservada de Java (`class`,
 * `CLASS`, `extends`…), se detecta antes de aplicar el singular o el plural y
 * se le añade `Entity` (`class` → `ClassEntity`, no `Clas`). Si el resultado
 * coincide con un tipo usado en el código generado (`Table`, `List`…),
 * también se le añade `Entity`.
 */
export function toClassName(tableName: string, naming: ClassNamingOptions): string {
  const words = splitWords(tableName);
  const [onlyWord] = words;
  if (words.length === 1 && onlyWord && JAVA_KEYWORDS.has(onlyWord)) {
    const cased = naming.case === 'pascal' ? capitalize(onlyWord) : tableName;
    return `${cased}Entity`;
  }

  const numbered =
    naming.number === 'singular'
      ? singularize(tableName)
      : naming.number === 'plural'
        ? pluralize(singularize(tableName))
        : tableName;
  const cased = naming.case === 'pascal' ? toPascalCase(numbered) : numbered;
  const identifier = toJavaIdentifier(cased, 'Entity');
  return RESERVED_TYPE_NAMES.has(identifier) ? `${identifier}Entity` : identifier;
}

/** Nombre de campo (camelCase) de una columna o una tabla. */
export function toFieldName(identifier: string): string {
  return toJavaIdentifier(toCamelCase(identifier), 'field');
}

/** Nombre de un atributo de relación simple: la tabla referenciada en singular (`users` → `user`). */
export function singularFieldName(tableName: string): string {
  return toFieldName(singularize(tableName));
}

/** Nombre de un atributo de relación de colección: la tabla en plural (`purchase_order` → `purchaseOrders`). */
export function pluralFieldName(tableName: string): string {
  return toJavaIdentifier(pluralize(toCamelCase(singularize(tableName))), 'items');
}

/**
 * Sufijo que distingue relaciones hacia la misma tabla: las columnas de la FK
 * sin el sufijo `_id` (`created_by` → `CreatedBy`, `author_id` → `Author`).
 * Con una FK compuesta se concatenan todas sus columnas.
 */
export function foreignKeyDiscriminator(columns: readonly string[]): string {
  return columns
    .map((column) => {
      const words = splitWords(column);
      const withoutId = words.length > 1 && words[words.length - 1] === 'id' ? words.slice(0, -1) : words;
      return withoutId.map(capitalize).join('');
    })
    .join('');
}

/** Nombre de tipo anidado (enum) que no choque con la clase ni con los tipos usados. */
export function toNestedTypeName(fieldName: string, enclosingClass: string): string {
  const name = toPascalCase(fieldName);
  return name === enclosingClass || RESERVED_TYPE_NAMES.has(name) ? `${name}Type` : name;
}

/** Un valor de ENUM puede ser una constante Java si es un identificador válido y no reservado. */
export function isValidEnumConstant(value: string): boolean {
  return IDENTIFIER.test(value) && !JAVA_KEYWORDS.has(value);
}

/** `com.example.entity` → válido; `com.1bad`, `com.class` → no. Vacío = paquete por defecto (válido). */
export function isValidPackageName(name: string): boolean {
  return name === '' || name.split('.').every((part) => IDENTIFIER.test(part) && !JAVA_KEYWORDS.has(part));
}

/** Literal de cadena Java. */
export function javaString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Nombre físico para `@Table`/`@Column`. Los nombres que no son identificadores
 * SQL simples (espacios, símbolos) se escriben entre comillas dobles para que
 * el proveedor JPA los cite.
 */
export function physicalName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_$#]*$/.test(name) ? javaString(name) : javaString(`"${name}"`);
}

/** Texto seguro dentro de un comentario Javadoc. */
export function javadocText(text: string): string {
  return text.replace(/\*\//g, '*&#47;').replace(/\r?\n/g, ' ').trim();
}
