import type { SourcePosition } from '@/core/model';

const MAX_FRAGMENT_LENGTH = 300;

export type Locator = (offset: number) => SourcePosition;

/** Devuelve una función que traduce un offset del script a línea y columna (base 1). */
export function createLocator(input: string): Locator {
  const lineStarts = [0];
  for (let i = 0; i < input.length; i++) {
    if (input.charAt(i) === '\n') lineStarts.push(i + 1);
  }

  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 };
  };
}

/** Fragmento SQL para mostrar en un diagnóstico, recortado si es muy largo. */
export function toFragment(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_FRAGMENT_LENGTH
    ? `${trimmed.slice(0, MAX_FRAGMENT_LENGTH)}…`
    : trimmed;
}
