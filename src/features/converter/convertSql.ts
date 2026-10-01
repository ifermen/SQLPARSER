import { generatorRegistry, type GeneratedFile } from '@/core/generators';
import type { JpaOptions } from '@/core/generators/jpa';
import { inferRelationships } from '@/core/inference';
import type { Diagnostic, DialectResolution, EnrichedSchemaModel, SqlDialect } from '@/core/model';
import { parseSql } from '@/core/parser';

/**
 * Pipeline completo: script SQL → parser → inferencia → generador. Es una
 * función pura sin React, para poder ejecutarla en la UI o en un Web Worker.
 */

export interface ConversionSettings {
  /** Dialecto indicado manualmente; si se omite, se detecta. */
  readonly dialect?: SqlDialect;
  /** Opciones del generador (JPA en el MVP). */
  readonly options: JpaOptions;
}

export interface ConversionResult {
  readonly dialect: DialectResolution;
  /** `null` si el análisis tiene errores o el script está vacío: en ese caso no se genera nada. */
  readonly schema: EnrichedSchemaModel | null;
  /** Ficheros generados, README incluido. Vacío si no hay esquema. */
  readonly files: readonly GeneratedFile[];
  /** Todos los diagnósticos, en orden: análisis, inferencia y generación. */
  readonly diagnostics: readonly Diagnostic[];
}

export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  options: generatorRegistry.jpa.defaultOptions,
};

export function convertSql(script: string, settings: ConversionSettings = DEFAULT_CONVERSION_SETTINGS): ConversionResult {
  const parsed = parseSql(script, settings.dialect ? { dialect: settings.dialect } : {});
  if (!parsed.schema) {
    return { dialect: parsed.dialect, schema: null, files: [], diagnostics: parsed.diagnostics };
  }

  const inferred = inferRelationships(parsed.schema);
  const previous = [...parsed.diagnostics, ...inferred.diagnostics];
  const generated = generatorRegistry.jpa.generate(inferred.schema, settings.options, {
    diagnostics: previous,
    dialect: parsed.dialect,
  });

  return {
    dialect: parsed.dialect,
    schema: inferred.schema,
    files: generated.files,
    diagnostics: [...previous, ...generated.diagnostics],
  };
}
