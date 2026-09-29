import type {
  Column,
  Diagnostic,
  DiagnosticLocation,
  DiagnosticSeverity,
  SqlDialect,
} from '@/core/model';
import { createLocator, toFragment } from './sourceText';
import type { Segment } from './sqlScanner';

/**
 * Estado mutable interno del parser. Nunca sale del módulo: `parseSql` lo
 * convierte en un `SchemaModel` inmutable al terminar.
 */

export type ColumnDraft = { -readonly [K in keyof Column]: Column[K] };

export interface PrimaryKeyDraft extends Segment {
  readonly name?: string;
  readonly columns: readonly string[];
}

export interface UniqueDraft extends Segment {
  readonly name?: string;
  readonly columns: readonly string[];
}

export interface ForeignKeyDraft extends Segment {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly referencedTable: string;
  readonly referencedColumns: readonly string[];
}

export interface TableDraft extends Segment {
  readonly name: string;
  comment?: string;
  readonly columns: ColumnDraft[];
  primaryKey?: PrimaryKeyDraft;
  readonly uniqueConstraints: UniqueDraft[];
  readonly foreignKeys: ForeignKeyDraft[];
}

export interface ParseContext {
  readonly input: string;
  readonly dialect: SqlDialect | null;
  readonly backslashEscapes: boolean;
  /** Tablas por nombre en minúsculas: los identificadores sin comillas no distinguen mayúsculas. */
  readonly tables: Map<string, TableDraft>;
  readonly diagnostics: Diagnostic[];
  /** Registra un diagnóstico cuyo fragmento es `input[span.start, span.end)`. */
  report(
    severity: DiagnosticSeverity,
    code: string,
    message: string,
    span: Segment,
    location?: DiagnosticLocation,
  ): void;
}

export function createParseContext(
  input: string,
  dialect: SqlDialect | null,
  backslashEscapes: boolean,
): ParseContext {
  const locate = createLocator(input);
  const diagnostics: Diagnostic[] = [];

  return {
    input,
    dialect,
    backslashEscapes,
    tables: new Map(),
    diagnostics,
    report(severity, code, message, span, location) {
      diagnostics.push({
        severity,
        stage: 'parser',
        code,
        message,
        fragment: toFragment(input.slice(span.start, span.end)),
        position: locate(span.start),
        ...(location ? { location } : {}),
      });
    },
  };
}

export function findTable(context: ParseContext, name: string): TableDraft | undefined {
  return context.tables.get(name.toLowerCase());
}

export function findColumn(table: TableDraft, name: string): ColumnDraft | undefined {
  const lower = name.toLowerCase();
  return (
    table.columns.find((column) => column.name === name) ??
    table.columns.find((column) => column.name.toLowerCase() === lower)
  );
}
