import type { ColumnType, LogicalType } from '@/core/model';

export interface JavaType {
  /** Nombre simple del tipo: `Long`, `BigDecimal`, `byte[]`. */
  readonly name: string;
  /** Import necesario, si el tipo no es de `java.lang`. */
  readonly import?: string;
}

/**
 * Tipo Java de cada tipo lógico. Siempre clases envoltorio (nunca primitivos)
 * para que una columna nula no dé problemas. `enum` y `unknown` los resuelve el
 * planificador (enum anidado o `String` con aviso).
 */
const JAVA_TYPES: Readonly<Record<Exclude<LogicalType, 'enum' | 'unknown'>, JavaType>> = {
  boolean: { name: 'Boolean' },
  smallint: { name: 'Short' },
  integer: { name: 'Integer' },
  bigint: { name: 'Long' },
  decimal: { name: 'BigDecimal', import: 'java.math.BigDecimal' },
  float: { name: 'Float' },
  double: { name: 'Double' },
  string: { name: 'String' },
  text: { name: 'String' },
  date: { name: 'LocalDate', import: 'java.time.LocalDate' },
  time: { name: 'LocalTime', import: 'java.time.LocalTime' },
  datetime: { name: 'LocalDateTime', import: 'java.time.LocalDateTime' },
  'datetime-tz': { name: 'OffsetDateTime', import: 'java.time.OffsetDateTime' },
  uuid: { name: 'UUID', import: 'java.util.UUID' },
  binary: { name: 'byte[]' },
  json: { name: 'String' },
};

export const STRING_TYPE: JavaType = { name: 'String' };

/** Import que necesita un tipo simple (`BigDecimal` → `java.math.BigDecimal`), si lo necesita. */
export function importOf(typeName: string): string | undefined {
  return Object.values(JAVA_TYPES).find((type) => type.name === typeName)?.import;
}

/** Tipo Java de un tipo lógico, o `null` para `enum` y `unknown`. */
export function javaTypeFor(logical: LogicalType): JavaType | null {
  return logical === 'enum' || logical === 'unknown' ? null : JAVA_TYPES[logical];
}

/**
 * Tipos SQL que son LOB y necesitan `@Lob`. No se incluyen `TEXT` ni `BYTEA`
 * de PostgreSQL: con `@Lob`, Hibernate los mapearía a objetos grandes (`oid`).
 */
const LOB_TYPES = new Set(['CLOB', 'NCLOB', 'BLOB', 'TINYBLOB', 'MEDIUMBLOB', 'LONGBLOB', 'MEDIUMTEXT', 'LONGTEXT']);

export function isLob(type: ColumnType): boolean {
  return LOB_TYPES.has(type.name);
}
