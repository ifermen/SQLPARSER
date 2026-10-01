import { jpaGenerator } from './jpa';

/**
 * Registro de generadores disponibles. Añadir un ORM = crear su carpeta en
 * `core/generators/` y registrarlo aquí; el mapa conserva el tipo de opciones
 * de cada generador.
 */
export const generatorRegistry = {
  jpa: jpaGenerator,
} as const;

export type GeneratorId = keyof typeof generatorRegistry;
