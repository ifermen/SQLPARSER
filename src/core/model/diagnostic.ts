/**
 * - `warning`: el proceso continúa y se genera igualmente.
 * - `error`: el proceso no puede continuar y no se genera.
 */
export type DiagnosticSeverity = 'warning' | 'error';

/** Etapa del pipeline que emite el diagnóstico. */
export type DiagnosticStage = 'parser' | 'inference' | 'generator';

/** Posición en el script original. Ambos valores empiezan en 1. */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

/** Elemento del esquema al que se refiere el diagnóstico, si aplica. */
export interface DiagnosticLocation {
  readonly table: string;
  readonly column?: string;
}

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly stage: DiagnosticStage;
  /**
   * Identificador estable con espacio de nombres por etapa, p. ej.
   * `parser.unsupported-statement` o `jpa.unmapped-type`. Es un `string`
   * abierto para que cada generador defina sus códigos sin tocar el modelo.
   */
  readonly code: string;
  readonly message: string;
  /** Fragmento SQL problemático. Obligatorio: un mensaje sin fragmento no es aceptable. */
  readonly fragment: string;
  readonly position?: SourcePosition;
  readonly location?: DiagnosticLocation;
}
