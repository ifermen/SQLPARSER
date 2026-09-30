import type { ForeignKey, Table, TableKind } from '@/core/model';
import { areDisjoint, isSubset, sameColumnSet } from './columnSets';

export interface TableClassification {
  readonly kind: TableKind;
  /**
   * Las dos FK que forman la clave de una tabla intermedia (`join-table` o
   * `association-entity`), en el orden del script. `null` para una entidad.
   */
  readonly linkForeignKeys: readonly [ForeignKey, ForeignKey] | null;
}

const ENTITY: TableClassification = { kind: 'entity', linkForeignKeys: null };

/**
 * Clasifica una tabla según sus claves:
 *
 * - **Tabla intermedia pura** (`join-table`): su PK está formada exactamente
 *   por dos FK y no tiene más columnas. También cuando no tiene PK pero sus
 *   columnas son exactamente las de dos FK: sin clave no puede ser una
 *   entidad, así que la única lectura útil es la de tabla intermedia.
 * - **Entidad de asociación** (`association-entity`): su PK está formada
 *   exactamente por dos FK y además tiene columnas propias.
 * - **Entidad** (`entity`): cualquier otro caso.
 *
 * "Exactamente dos FK" significa que hay dos FK contenidas en la PK, que no
 * comparten columnas y que entre las dos cubren toda la PK. Cada FK puede ser
 * compuesta.
 *
 * `foreignKeys` son las FK válidas de la tabla (las que apuntan a tablas
 * conocidas), que pueden ser menos que `table.foreignKeys`.
 */
export function classifyTable(table: Table, foreignKeys: readonly ForeignKey[]): TableClassification {
  const columnNames = table.columns.map((column) => column.name);
  const primaryKey = table.primaryKey?.columns;

  if (primaryKey && primaryKey.length >= 2) {
    const keyForeignKeys = foreignKeys.filter((foreignKey) => isSubset(foreignKey.columns, primaryKey));
    const [first, second] = keyForeignKeys;
    if (keyForeignKeys.length === 2 && first && second && coversExactly(first, second, primaryKey)) {
      return {
        kind: sameColumnSet(columnNames, primaryKey) ? 'join-table' : 'association-entity',
        linkForeignKeys: [first, second],
      };
    }
    return ENTITY;
  }

  const [first, second] = foreignKeys;
  if (!primaryKey && foreignKeys.length === 2 && first && second && coversExactly(first, second, columnNames)) {
    return { kind: 'join-table', linkForeignKeys: [first, second] };
  }
  return ENTITY;
}

/** Las dos FK no se solapan y entre las dos cubren exactamente `columns`. */
function coversExactly(first: ForeignKey, second: ForeignKey, columns: readonly string[]): boolean {
  return (
    areDisjoint(first.columns, second.columns) && sameColumnSet([...first.columns, ...second.columns], columns)
  );
}
