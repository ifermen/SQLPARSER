/** Códigos de los diagnósticos que emite el generador JPA. Todos son avisos: siempre se genera. */
export const JPA_DIAGNOSTICS = {
  /** Tabla sin PK que no es tabla intermedia: la clase se genera sin `@Id` (JPA lo exige). */
  missingPrimaryKey: 'jpa.missing-primary-key',
  /** Tipo SQL sin equivalente Java: se usa `String`. */
  unmappedType: 'jpa.unmapped-type',
  /** ENUM con valores que no son identificadores Java válidos: se usa `String`. */
  enumAsString: 'jpa.enum-as-string',
  /** Dos tablas darían la misma clase: se añade un número. */
  classNameCollision: 'jpa.class-name-collision',
  /** Autoincremento dentro de una clave compuesta: no se genera `@GeneratedValue`. */
  generatedCompositeKey: 'jpa.generated-composite-key',
  /** FK hacia una tabla intermedia pura (no tiene clase): se mapea como columnas simples. */
  relationshipToJoinTable: 'jpa.relationship-to-join-table',
  /** Paquete base no válido en Java: se usa el paquete por defecto. */
  invalidPackage: 'jpa.invalid-package',
  /** Lombok todavía no está implementado: se generan getters y setters. */
  lombokNotSupported: 'jpa.lombok-not-supported',
} as const;
