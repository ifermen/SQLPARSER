/**
 * Conversión de identificadores SQL (snake_case, MAYÚSCULAS de Oracle,
 * camelCase, con espacios o símbolos) a las convenciones de nombres de
 * código. No sabe nada de ningún lenguaje concreto: sanear palabras
 * reservadas es trabajo de cada generador.
 */

/**
 * Divide un identificador en palabras en minúsculas:
 * `purchase_order` → `['purchase', 'order']`, `DEPARTMENT_ID` →
 * `['department', 'id']`, `OrderLine` → `['order', 'line']`,
 * `XMLData` → `['xml', 'data']`, `ORDER#` → `['order']`.
 */
export function splitWords(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9À-￿]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function decapitalize(word: string): string {
  return word.charAt(0).toLowerCase() + word.slice(1);
}

/** `purchase_order` → `PurchaseOrder`. */
export function toPascalCase(identifier: string): string {
  return splitWords(identifier).map(capitalize).join('');
}

/** `purchase_order` → `purchaseOrder`. */
export function toCamelCase(identifier: string): string {
  return decapitalize(toPascalCase(identifier));
}
