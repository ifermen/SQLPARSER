import type { SqlDialect } from './dialect';
import type { Relationship } from './relationship';

/**
 * Tipo lógico independiente del dialecto y del ORM. Lo rellena el parser para
 * que cada generador solo tenga que mapear estas categorías a su lenguaje.
 */
export type LogicalType =
  | 'boolean'
  | 'smallint'
  | 'integer'
  | 'bigint'
  | 'decimal'
  | 'float'
  | 'double'
  | 'string'
  | 'text'
  | 'date'
  | 'time'
  | 'datetime'
  | 'datetime-tz'
  | 'uuid'
  | 'binary'
  | 'json'
  | 'enum'
  | 'unknown';

export interface ColumnType {
  /** Tipo tal y como aparece en el script, p. ej. `VARCHAR(255)`. */
  readonly raw: string;
  /** Nombre base normalizado en mayúsculas, sin parámetros, p. ej. `VARCHAR`. */
  readonly name: string;
  readonly logical: LogicalType;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  /** Valores permitidos cuando `logical` es `enum`. */
  readonly enumValues?: readonly string[];
}

export interface Column {
  readonly name: string;
  readonly type: ColumnType;
  readonly nullable: boolean;
  /** Expresión SQL del valor por defecto tal y como está escrita. */
  readonly defaultValue?: string;
  readonly comment?: string;
  /** `AUTO_INCREMENT`, `SERIAL`, `IDENTITY`… */
  readonly autoIncrement: boolean;
}

/**
 * Las restricciones son la única fuente de verdad: las columnas no llevan
 * flags `pk`/`unique`. Un `UNIQUE` o `PRIMARY KEY` de columna se normaliza a
 * una restricción de una sola columna. El orden de `columns` es el del script.
 */
export interface PrimaryKey {
  readonly name?: string;
  /** Más de una columna ⇒ clave compuesta. */
  readonly columns: readonly string[];
}

export interface UniqueConstraint {
  readonly name?: string;
  readonly columns: readonly string[];
}

export interface ForeignKey {
  readonly name?: string;
  /** Columnas de la tabla propietaria, emparejadas por posición con `referencedColumns`. */
  readonly columns: readonly string[];
  readonly referencedTable: string;
  readonly referencedColumns: readonly string[];
}

export interface Table {
  /** Identificador de la tabla dentro del esquema: único y sin comillas. */
  readonly name: string;
  readonly comment?: string;
  readonly columns: readonly Column[];
  /** Ausente si la tabla no declara clave primaria. */
  readonly primaryKey?: PrimaryKey;
  readonly foreignKeys: readonly ForeignKey[];
  readonly uniqueConstraints: readonly UniqueConstraint[];
}

/** Salida del parser. */
export interface SchemaModel {
  /** Dialecto con el que se analizó; `null` si no se detectó ni se indicó. */
  readonly dialect: SqlDialect | null;
  readonly tables: readonly Table[];
}

/**
 * Papel de la tabla tras la inferencia:
 * - `entity`: tabla normal, genera su propia clase.
 * - `join-table`: PK compuesta por exactamente dos FK y sin más columnas;
 *   no genera clase, se representa como `many-to-many`.
 * - `association-entity`: PK compuesta por dos FK y con columnas propias;
 *   genera clase con clave compuesta y dos `many-to-one`.
 */
export type TableKind = 'entity' | 'join-table' | 'association-entity';

export interface EnrichedTable extends Table {
  readonly kind: TableKind;
}

/** Salida de la inferencia y entrada de los generadores. */
export interface EnrichedSchemaModel {
  readonly dialect: SqlDialect | null;
  readonly tables: readonly EnrichedTable[];
  readonly relationships: readonly Relationship[];
}
