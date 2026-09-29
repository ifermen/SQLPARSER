/**
 * Las restricciones se comparan como conjuntos de columnas: `UNIQUE (a, b)` y
 * `UNIQUE (b, a)` son la misma. Los identificadores sin comillas no distinguen
 * mayúsculas en SQL, así que la comparación tampoco.
 */

function normalize(columns: readonly string[]): string[] {
  return columns.map((column) => column.toLowerCase());
}

export function sameColumnSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(normalize(a));
  const setB = new Set(normalize(b));
  return setA.size === setB.size && [...setA].every((column) => setB.has(column));
}

export function isSubset(subset: readonly string[], superset: readonly string[]): boolean {
  const set = new Set(normalize(superset));
  return normalize(subset).every((column) => set.has(column));
}

export function areDisjoint(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(normalize(a));
  return normalize(b).every((column) => !set.has(column));
}
