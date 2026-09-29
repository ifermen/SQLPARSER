import type { SqlDialect } from '@/core/model';
import type { ColumnDefinitionInfo } from './columnDefinition';
import { parseColumnType } from './columnType';
import { PARSER_DIAGNOSTICS } from './diagnosticCodes';
import { findColumn, type ColumnDraft, type ParseContext, type PrimaryKeyDraft, type TableDraft } from './parseContext';
import type { LibraryColumn } from './sqlSchemaLibrary';
import type { Segment } from './sqlScanner';
import type { TableElement } from './tableElement';

/** Combina lo que aporta la librería con lo que extrae el parser de la definición. */
export function buildColumn(
  dialect: SqlDialect | null,
  libraryColumn: LibraryColumn,
  info: ColumnDefinitionInfo,
): ColumnDraft {
  const rawType = info.rawType ?? libraryColumn.type ?? '';
  const type = parseColumnType(
    info.unsigned && !/\bUNSIGNED\b/i.test(rawType) ? `${rawType} unsigned` : rawType,
    dialect,
  );
  const defaultValue =
    libraryColumn.defaultValue !== undefined && !/^NULL$/i.test(libraryColumn.defaultValue)
      ? libraryColumn.defaultValue
      : undefined;
  const comment = info.comment ?? libraryColumn.comment;

  return {
    name: info.name,
    type,
    nullable: libraryColumn.nullable,
    autoIncrement:
      info.autoIncrement ||
      /SERIAL/.test(type.name) ||
      (defaultValue !== undefined && /\bnextval\s*\(/i.test(defaultValue)),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(comment ? { comment } : {}),
  };
}

/** Añade una columna nueva y sus restricciones en línea. */
export function addColumn(
  context: ParseContext,
  table: TableDraft,
  info: ColumnDefinitionInfo | null,
  libraryColumn: LibraryColumn | undefined,
  span: Segment,
): void {
  if (!info || !libraryColumn) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.unreadableColumn,
      `No se ha podido interpretar una columna de la tabla "${table.name}"; se ignora.`,
      span,
      { table: table.name },
    );
    return;
  }
  if (findColumn(table, info.name)) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.duplicateColumn,
      `La columna "${info.name}" ya está definida en la tabla "${table.name}"; se ignora esta definición.`,
      span,
      { table: table.name, column: info.name },
    );
    return;
  }

  const column = buildColumn(context.dialect, libraryColumn, info);
  reportUnknownType(context, table, column, span);
  table.columns.push(column);
  addInlineConstraints(context, table, info, span);
}

/** Sustituye la definición de una columna existente (`MODIFY`, `CHANGE`). */
export function replaceColumn(
  context: ParseContext,
  table: TableDraft,
  index: number,
  info: ColumnDefinitionInfo,
  libraryColumn: LibraryColumn,
  span: Segment,
): void {
  const column = buildColumn(context.dialect, libraryColumn, info);
  reportUnknownType(context, table, column, span);
  table.columns[index] = column;
  addInlineConstraints(context, table, info, span);
}

function reportUnknownType(context: ParseContext, table: TableDraft, column: ColumnDraft, span: Segment): void {
  if (column.type.logical !== 'unknown') return;
  const typeLabel = column.type.raw ? `"${column.type.raw}"` : 'de la columna';
  context.report(
    'warning',
    PARSER_DIAGNOSTICS.unknownColumnType,
    `Tipo ${typeLabel} no reconocido en "${table.name}.${column.name}"; se tratará como un tipo genérico.`,
    span,
    { table: table.name, column: column.name },
  );
}

function addInlineConstraints(
  context: ParseContext,
  table: TableDraft,
  info: ColumnDefinitionInfo,
  span: Segment,
): void {
  if (info.primaryKey) setPrimaryKey(context, table, { columns: [info.name], ...span });
  if (info.unique) table.uniqueConstraints.push({ columns: [info.name], ...span });
  if (info.reference) {
    table.foreignKeys.push({
      name: info.reference.name,
      columns: [info.name],
      referencedTable: info.reference.table,
      referencedColumns: info.reference.columns,
      ...span,
    });
  }
}

/** Añade una restricción de tabla ya clasificada. */
export function addConstraint(
  context: ParseContext,
  table: TableDraft,
  element: Exclude<TableElement, { kind: 'column' }>,
  span: Segment,
): void {
  switch (element.kind) {
    case 'primary-key':
      setPrimaryKey(context, table, { name: element.name, columns: element.columns, ...span });
      return;
    case 'unique':
      table.uniqueConstraints.push({ name: element.name, columns: element.columns, ...span });
      return;
    case 'foreign-key':
      table.foreignKeys.push({
        name: element.name,
        columns: element.columns,
        referencedTable: element.referencedTable,
        referencedColumns: element.referencedColumns,
        ...span,
      });
      return;
    case 'ignored':
      return;
    case 'unsupported':
      context.report(
        'warning',
        PARSER_DIAGNOSTICS.unsupportedTableElement,
        `Elemento de la tabla "${table.name}" no soportado; se ignora.`,
        span,
        { table: table.name },
      );
  }
}

function setPrimaryKey(context: ParseContext, table: TableDraft, primaryKey: PrimaryKeyDraft): void {
  if (table.primaryKey) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.duplicatePrimaryKey,
      `La tabla "${table.name}" ya tiene clave primaria; se ignora esta declaración.`,
      primaryKey,
      { table: table.name },
    );
    return;
  }
  table.primaryKey = primaryKey;
}
