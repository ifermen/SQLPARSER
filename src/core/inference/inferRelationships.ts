import type {
  Diagnostic,
  EnrichedSchemaModel,
  EnrichedTable,
  ForeignKey,
  Relationship,
  SchemaModel,
  Table,
} from '@/core/model';
import { classifyTable } from './classifyTable';
import { sameColumnSet } from './columnSets';
import { INFERENCE_DIAGNOSTICS } from './diagnosticCodes';

export interface InferenceResult {
  readonly schema: EnrichedSchemaModel;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Infiere las relaciones entre entidades a partir de las claves del esquema.
 * Es una función pura e independiente del ORM: produce relaciones en el
 * modelo, no anotaciones.
 *
 * | Situación                                              | Resultado                                       |
 * | ------------------------------------------------------ | ----------------------------------------------- |
 * | FK de A a B                                            | `many-to-one` (A → B)                           |
 * | FK con UNIQUE sobre exactamente sus columnas           | `one-to-one`, regla `unique-foreign-key`        |
 * | FK cuyas columnas son exactamente la PK                | `one-to-one`, regla `primary-key-foreign-key`   |
 * | PK = dos FK, sin más columnas (tabla intermedia pura)  | `many-to-many`, la tabla no genera entidad      |
 * | PK = dos FK, con columnas propias                      | dos `many-to-one`, regla `association-entity`   |
 *
 * Las relaciones se devuelven en el orden del script: por tabla y, dentro de
 * cada tabla, por FK.
 */
export function inferRelationships(schema: SchemaModel): InferenceResult {
  const tablesByName = new Map(schema.tables.map((table) => [table.name.toLowerCase(), table]));
  const diagnostics: Diagnostic[] = [];
  const relationships: Relationship[] = [];
  const tables: EnrichedTable[] = [];

  for (const table of schema.tables) {
    const foreignKeys = validForeignKeys(table, tablesByName, diagnostics);
    const { kind, linkForeignKeys } = classifyTable(table, foreignKeys);
    tables.push({ ...table, kind });

    const targetOf = (foreignKey: ForeignKey): string =>
      tablesByName.get(foreignKey.referencedTable.toLowerCase())?.name ?? foreignKey.referencedTable;

    if (kind === 'join-table' && linkForeignKeys) {
      const [sourceForeignKey, targetForeignKey] = linkForeignKeys;
      relationships.push({
        kind: 'many-to-many',
        rule: 'join-table',
        source: targetOf(sourceForeignKey),
        target: targetOf(targetForeignKey),
        joinTable: table.name,
        sourceForeignKey,
        targetForeignKey,
      });
      continue;
    }

    for (const foreignKey of foreignKeys) {
      const base = { source: table.name, target: targetOf(foreignKey), foreignKey };
      if (linkForeignKeys?.includes(foreignKey)) {
        relationships.push({ ...base, kind: 'many-to-one', rule: 'association-entity' });
      } else if (table.primaryKey && sameColumnSet(foreignKey.columns, table.primaryKey.columns)) {
        relationships.push({ ...base, kind: 'one-to-one', rule: 'primary-key-foreign-key' });
      } else if (table.uniqueConstraints.some((unique) => sameColumnSet(unique.columns, foreignKey.columns))) {
        relationships.push({ ...base, kind: 'one-to-one', rule: 'unique-foreign-key' });
      } else {
        relationships.push({ ...base, kind: 'many-to-one', rule: 'foreign-key' });
      }
    }
  }

  return {
    schema: { dialect: schema.dialect, tables, relationships },
    diagnostics,
  };
}

/**
 * FK que pueden dar lugar a una relación. El parser ya descarta las FK hacia
 * tablas inexistentes; aquí se comprueba de nuevo porque la inferencia puede
 * recibir cualquier `SchemaModel`.
 */
function validForeignKeys(
  table: Table,
  tablesByName: ReadonlyMap<string, Table>,
  diagnostics: Diagnostic[],
): ForeignKey[] {
  return table.foreignKeys.filter((foreignKey) => {
    const location = { table: table.name, column: foreignKey.columns.join(', ') };
    const fragment = renderForeignKey(foreignKey);

    const target = tablesByName.get(foreignKey.referencedTable.toLowerCase());
    if (!target) {
      diagnostics.push({
        severity: 'warning',
        stage: 'inference',
        code: INFERENCE_DIAGNOSTICS.unknownReferencedTable,
        message: `La clave foránea de "${table.name}" referencia la tabla "${foreignKey.referencedTable}", que no está en el esquema; no se genera la relación.`,
        fragment,
        location,
      });
      return false;
    }

    if (target === table && sameColumnSet(foreignKey.columns, foreignKey.referencedColumns)) {
      diagnostics.push({
        severity: 'warning',
        stage: 'inference',
        code: INFERENCE_DIAGNOSTICS.selfReferencingKey,
        message: `La clave foránea de "${table.name}" apunta a sus propias columnas; no es una relación y se ignora.`,
        fragment,
        location,
      });
      return false;
    }

    return true;
  });
}

/**
 * La inferencia no tiene acceso al script: el fragmento de sus diagnósticos es
 * la FK reconstruida a partir del modelo.
 */
function renderForeignKey(foreignKey: ForeignKey): string {
  return `FOREIGN KEY (${foreignKey.columns.join(', ')}) REFERENCES ${foreignKey.referencedTable} (${foreignKey.referencedColumns.join(', ')})`;
}
