import type { Diagnostic, EnrichedSchemaModel } from '@/core/model';

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
  generate(schema: EnrichedSchemaModel, options: TOptions): GenerationResult;
}
