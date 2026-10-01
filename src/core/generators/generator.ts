import type { Diagnostic, DialectResolution, EnrichedSchemaModel } from '@/core/model';

export interface GeneratedFile {
  /** Ruta relativa dentro del ZIP, con `/` como separador. */
  readonly path: string;
  readonly content: string;
  /** Lenguaje para el resaltado de sintaxis, p. ej. `java` o `markdown`. */
  readonly language: string;
}

export interface GenerationResult {
  /** Incluye el README. */
  readonly files: readonly GeneratedFile[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Estrategia de nombres de clase, común a cualquier ORM. */
export interface ClassNamingOptions {
  /** `singular`: `users` → `User`; `plural`: `user` → `Users`; `as-is`: sin cambios. */
  readonly number: 'singular' | 'plural' | 'as-is';
  /** `pascal`: `order_line` → `OrderLine`; `as-is`: respeta el nombre de la tabla. */
  readonly case: 'pascal' | 'as-is';
}

/**
 * Información de las etapas anteriores del pipeline que el generador no puede
 * deducir del esquema. Se usa para el README (registro de avisos, dialecto).
 */
export interface GenerationContext {
  /** Diagnósticos del parser y de la inferencia, en orden. */
  readonly diagnostics: readonly Diagnostic[];
  /** Cómo se determinó el dialecto (detectado o indicado por el usuario). */
  readonly dialect?: DialectResolution;
}

export const EMPTY_GENERATION_CONTEXT: GenerationContext = { diagnostics: [] };

/**
 * Contrato de todo generador de ORM. Las opciones deben ser datos
 * serializables para poder ejecutar el pipeline en un Web Worker.
 */
export interface Generator<TOptions extends object> {
  /** Identificador estable, p. ej. `jpa`. */
  readonly id: string;
  /** Nombre visible en la UI. */
  readonly label: string;
  /** Valores por defecto: generar sin tocar nada debe dar un resultado útil. */
  readonly defaultOptions: TOptions;
  /**
   * Genera los ficheros (README incluido). `GenerationResult.diagnostics`
   * contiene solo los del generador; los de `context` aparecen en el README.
   */
  generate(schema: EnrichedSchemaModel, options: TOptions, context?: GenerationContext): GenerationResult;
}
