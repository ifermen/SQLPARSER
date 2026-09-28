import type { ClassNamingOptions } from '../generator';

/** Librería de anotaciones de persistencia. Solo Jakarta en el MVP. */
export type JpaAnnotationLibrary = 'jakarta';

export interface JpaOptions {
  /** Paquete base de las clases generadas, p. ej. `com.example.domain`. */
  readonly basePackage: string;
  readonly annotationLibrary: JpaAnnotationLibrary;
  readonly useLombok: boolean;
  readonly classNaming: ClassNamingOptions;
}
