/** Códigos de los diagnósticos que emite la inferencia de relaciones. Todos son avisos. */
export const INFERENCE_DIAGNOSTICS = {
  /** FK hacia una tabla que no está en el esquema: se omite la relación. */
  unknownReferencedTable: 'inference.unknown-referenced-table',
  /** FK cuyas columnas se referencian a sí mismas (`id REFERENCES misma_tabla (id)`): no es una relación. */
  selfReferencingKey: 'inference.self-referencing-key',
} as const;
