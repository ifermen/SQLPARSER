import type { ForeignKey } from './schema';

/**
 * Regla de inferencia que originó la relación. Los generadores la usan para
 * documentar en el README las decisiones de mapeo aplicadas.
 */
export type InferenceRule =
  /** FK simple ⇒ many-to-one (y one-to-many inverso). */
  | 'foreign-key'
  /** FK cuyas columnas tienen una restricción UNIQUE ⇒ one-to-one. */
  | 'unique-foreign-key'
  /** FK que es a la vez la PK de la tabla ⇒ one-to-one con PK compartida. */
  | 'primary-key-foreign-key'
  /** Tabla intermedia pura ⇒ many-to-many. */
  | 'join-table'
  /** FK que forma parte de la PK de una entidad de asociación ⇒ many-to-one. */
  | 'association-entity';

/**
 * Relación con FK: `source` es la tabla que contiene la FK (lado propietario)
 * y `target` la tabla referenciada. `source === target` en autorreferencias.
 */
interface ForeignKeyRelationship {
  readonly source: string;
  readonly target: string;
  readonly foreignKey: ForeignKey;
}

/** `@ManyToOne` en `source`; el generador decide si emite el `@OneToMany` inverso en `target`. */
export interface ManyToOneRelationship extends ForeignKeyRelationship {
  readonly kind: 'many-to-one';
  readonly rule: 'foreign-key' | 'association-entity';
}

export interface OneToOneRelationship extends ForeignKeyRelationship {
  readonly kind: 'one-to-one';
  readonly rule: 'unique-foreign-key' | 'primary-key-foreign-key';
}

/**
 * Relación a través de una tabla intermedia pura (`kind: 'join-table'`).
 * `source` es el lado propietario (el de la primera FK en el orden del script)
 * y `target` el inverso.
 */
export interface ManyToManyRelationship {
  readonly kind: 'many-to-many';
  readonly rule: 'join-table';
  readonly source: string;
  readonly target: string;
  readonly joinTable: string;
  /** FK de la tabla intermedia hacia `source`. */
  readonly sourceForeignKey: ForeignKey;
  /** FK de la tabla intermedia hacia `target`. */
  readonly targetForeignKey: ForeignKey;
}

/** Relaciones inferidas, independientes de cualquier ORM. Unión discriminada por `kind`. */
export type Relationship = ManyToOneRelationship | OneToOneRelationship | ManyToManyRelationship;

export type RelationshipKind = Relationship['kind'];
