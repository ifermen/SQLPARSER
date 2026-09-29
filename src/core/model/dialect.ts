/**
 * Dialectos SQL soportados en el MVP. El array es la fuente de verdad: el tipo
 * y el selector de la UI se derivan de él. Añadir un dialecto obliga a revisar
 * la detección, el escáner y el mapeo de tipos (ver AGENTS.md → Dialectos).
 */
export const SQL_DIALECTS = ['mysql', 'postgresql', 'sqlite', 'oracle'] as const;

export type SqlDialect = (typeof SQL_DIALECTS)[number];

/** Cómo se ha determinado el dialecto con el que se ha analizado el script. */
export type DialectSource = 'detected' | 'manual';

export interface DialectResolution {
  /** `null` cuando la detección automática no reconoce el dialecto. */
  readonly dialect: SqlDialect | null;
  readonly source: DialectSource;
}
