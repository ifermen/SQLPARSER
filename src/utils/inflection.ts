/**
 * Singular y plural deliberadamente simples: solo se quita o se pone una `s`
 * final. No se aplican reglas ortográficas (`categories` → `categorie`,
 * `status` → `statu`); es una decisión del proyecto para mantener las
 * conversiones predecibles. Queda documentado en el README generado.
 */

/** Quita una `s` final: `users` → `user`. */
export function singularize(word: string): string {
  return word.length > 1 && /s$/i.test(word) ? word.slice(0, -1) : word;
}

/** Pone una `s` final respetando las mayúsculas: `user` → `users`, `USER` → `USERS`. */
export function pluralize(word: string): string {
  return /[A-Z]$/.test(word) && word === word.toUpperCase() ? `${word}S` : `${word}s`;
}
