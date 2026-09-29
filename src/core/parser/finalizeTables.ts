import type { Column, ForeignKey, PrimaryKey, Table, UniqueConstraint } from '@/core/model';
import { PARSER_DIAGNOSTICS } from './diagnosticCodes';
import { findColumn, findTable, type ParseContext, type TableDraft } from './parseContext';
import type { Segment } from './sqlScanner';

/**
 * Convierte los borradores en tablas del modelo. Se ejecuta cuando ya se conocen
 * todas las tablas, así que aquí se resuelven las referencias entre ellas:
 * nombres normalizados, FK sin columnas explícitas, restricciones sobre
 * columnas inexistentes, etc. Lo que no se puede resolver se descarta con aviso.
 */
export function finalizeTables(context: ParseContext): Table[] {
  return [...context.tables.values()].map((table) => finalizeTable(context, table));
}

function finalizeTable(context: ParseContext, table: TableDraft): Table {
  const primaryKey = finalizePrimaryKey(context, table);
  if (primaryKey) {
    for (const name of primaryKey.columns) {
      const column = findColumn(table, name);
      if (column) column.nullable = false;
    }
    markSqliteRowId(context, table, primaryKey);
  }

  return {
    name: table.name,
    ...(table.comment ? { comment: table.comment } : {}),
    columns: table.columns.map((column): Column => ({ ...column })),
    ...(primaryKey ? { primaryKey } : {}),
    foreignKeys: finalizeForeignKeys(context, table),
    uniqueConstraints: finalizeUniqueConstraints(context, table, primaryKey),
  };
}

function finalizePrimaryKey(context: ParseContext, table: TableDraft): PrimaryKey | undefined {
  if (!table.primaryKey) return undefined;
  const columns = resolveColumns(context, table, table.primaryKey.columns, table.primaryKey, 'la clave primaria');
  return columns ? { ...optionalName(table.primaryKey.name), columns } : undefined;
}

/** En SQLite, `INTEGER PRIMARY KEY` es un alias de `rowid` y se autoincrementa. */
function markSqliteRowId(context: ParseContext, table: TableDraft, primaryKey: PrimaryKey): void {
  const [name] = primaryKey.columns;
  if (context.dialect !== 'sqlite' || primaryKey.columns.length !== 1 || name === undefined) return;
  const column = findColumn(table, name);
  if (column?.type.name === 'INTEGER') column.autoIncrement = true;
}

function finalizeUniqueConstraints(
  context: ParseContext,
  table: TableDraft,
  primaryKey: PrimaryKey | undefined,
): UniqueConstraint[] {
  const seen = new Set(primaryKey ? [columnSetKey(primaryKey.columns)] : []);
  const result: UniqueConstraint[] = [];

  for (const unique of table.uniqueConstraints) {
    const columns = resolveColumns(context, table, unique.columns, unique, 'una restricción UNIQUE');
    if (!columns) continue;
    const key = columnSetKey(columns);
    // Una UNIQUE igual a la PK o a otra UNIQUE no aporta información.
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...optionalName(unique.name), columns });
  }
  return result;
}

function finalizeForeignKeys(context: ParseContext, table: TableDraft): ForeignKey[] {
  const seen = new Set<string>();
  const result: ForeignKey[] = [];

  for (const foreignKey of table.foreignKeys) {
    const location = { table: table.name, column: foreignKey.columns.join(', ') };
    const warn = (code: string, message: string) =>
      context.report('warning', code, message, foreignKey, location);

    const target = findTable(context, foreignKey.referencedTable);
    if (!target) {
      warn(
        PARSER_DIAGNOSTICS.unknownReferencedTable,
        `La clave foránea de "${table.name}" referencia la tabla "${foreignKey.referencedTable}", que no está definida en el script; se ignora.`,
      );
      continue;
    }

    const columns = resolveColumns(context, table, foreignKey.columns, foreignKey, 'una clave foránea');
    if (!columns) continue;

    const requestedColumns =
      foreignKey.referencedColumns.length > 0 ? foreignKey.referencedColumns : target.primaryKey?.columns;
    if (!requestedColumns) {
      warn(
        PARSER_DIAGNOSTICS.missingReferencedKey,
        `La clave foránea de "${table.name}" no indica columnas y la tabla "${target.name}" no tiene clave primaria; se ignora.`,
      );
      continue;
    }

    const referencedColumns: string[] = [];
    for (const name of requestedColumns) {
      const column = findColumn(target, name);
      if (!column) {
        warn(
          PARSER_DIAGNOSTICS.unknownReferencedColumn,
          `La clave foránea de "${table.name}" referencia la columna "${target.name}.${name}", que no existe; se ignora.`,
        );
        break;
      }
      referencedColumns.push(column.name);
    }
    if (referencedColumns.length !== requestedColumns.length) continue;

    if (columns.length !== referencedColumns.length) {
      warn(
        PARSER_DIAGNOSTICS.foreignKeyColumnMismatch,
        `La clave foránea de "${table.name}" tiene ${columns.length} columna(s) pero referencia ${referencedColumns.length}; se ignora.`,
      );
      continue;
    }

    const key = `${columns.join('\u0000')}->${target.name}.${referencedColumns.join('\u0000')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...optionalName(foreignKey.name), columns, referencedTable: target.name, referencedColumns });
  }
  return result;
}

/** Normaliza los nombres de columna o avisa y devuelve `null` si alguna no existe. */
function resolveColumns(
  context: ParseContext,
  table: TableDraft,
  names: readonly string[],
  span: Segment,
  constraintLabel: string,
): string[] | null {
  const resolved: string[] = [];
  for (const name of names) {
    const column = findColumn(table, name);
    if (!column) {
      context.report(
        'warning',
        PARSER_DIAGNOSTICS.unknownColumn,
        `La columna "${name}" usada en ${constraintLabel} no existe en la tabla "${table.name}"; se ignora la restricción.`,
        span,
        { table: table.name, column: name },
      );
      return null;
    }
    resolved.push(column.name);
  }
  return resolved;
}

function columnSetKey(columns: readonly string[]): string {
  return columns
    .map((column) => column.toLowerCase())
    .sort()
    .join('\u0000');
}

function optionalName(name: string | undefined): { name?: string } {
  return name !== undefined ? { name } : {};
}
