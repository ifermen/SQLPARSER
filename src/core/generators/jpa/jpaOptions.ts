import type { ClassNamingOptions } from '../generator';

/** Librería de anotaciones de persistencia. Solo Jakarta en el MVP. */
export type JpaAnnotationLibrary = 'jakarta';

export interface JpaOptions {
  /** Paquete base de las clases generadas, p. ej. `com.example.entity`. Vacío = paquete por defecto. */
  readonly basePackage: string;
  readonly annotationLibrary: JpaAnnotationLibrary;
  /** Todavía no implementado: se ignora y se avisa si está activo (se generan getters y setters). */
  readonly useLombok: boolean;
  readonly classNaming: ClassNamingOptions;
}

/** Valores por defecto: generar sin tocar nada debe dar un resultado útil. */
export const JPA_DEFAULT_OPTIONS: JpaOptions = {
  basePackage: 'com.example.entity',
  annotationLibrary: 'jakarta',
  useLombok: false,
  classNaming: { number: 'singular', case: 'pascal' },
};

/** Paquete Java de cada librería de anotaciones. */
export const ANNOTATION_PACKAGES: Readonly<Record<JpaAnnotationLibrary, string>> = {
  jakarta: 'jakarta.persistence',
};
