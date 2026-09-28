/**
 * Dialectos SQL soportados en el MVP (los que cubre `@khanakia/sql-schema-core`).
 * El array es la fuente de verdad: el tipo y el selector de la UI se derivan de él.
 */
export const SQL_DIALECTS = ['mysql', 'postgresql', 'sqlite'] as const;

export type SqlDialect = (typeof SQL_DIALECTS)[number];

/** Cómo se ha determinado el dialecto con el que se ha analizado el script. */
export type DialectSource = 'detected' | 'manual';

export interface DialectResolution {
  /** `null` cuando la detección automática no reconoce el dialecto. */
  readonly dialect: SqlDialect | null;
  readonly source: DialectSource;
}
