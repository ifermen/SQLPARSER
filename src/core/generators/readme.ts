import type { Diagnostic, DialectResolution, SqlDialect, TableKind } from '@/core/model';

/**
 * Piezas comunes del README que genera cualquier generador: tablas Markdown,
 * registro de avisos y errores y etiquetas del modelo. Cada generador compone
 * su README con estas piezas y añade sus secciones propias.
 */

export const DIALECT_LABELS: Readonly<Record<SqlDialect, string>> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
  oracle: 'Oracle',
};

export const TABLE_KIND_LABELS: Readonly<Record<TableKind, string>> = {
  entity: 'Entidad',
  'join-table': 'Tabla intermedia (sin clase propia)',
  'association-entity': 'Entidad de asociación',
};

const STAGE_LABELS: Readonly<Record<Diagnostic['stage'], string>> = {
  parser: 'Análisis',
  inference: 'Inferencia',
  generator: 'Generación',
};

/** Descripción del dialecto usado y de cómo se determinó. */
export function describeDialect(dialect: SqlDialect | null, resolution: DialectResolution | undefined): string {
  if (!dialect) return 'No detectado (se han aplicado reglas genéricas)';
  const label = DIALECT_LABELS[dialect];
  if (!resolution) return label;
  return resolution.source === 'manual' ? `${label} (indicado manualmente)` : `${label} (detectado automáticamente)`;
}

/** Texto seguro dentro de una celda de tabla Markdown. */
export function tableCell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/** Código en línea que admite acentos graves en el contenido (`` `a`b` `` → ``` `` a`b `` ```). */
export function inlineCode(text: string): string {
  const content = text.replace(/\r?\n/g, ' ');
  return content.includes('`') ? `\`\` ${content} \`\`` : `\`${content}\``;
}

export function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => `| ${cells.map(tableCell).join(' | ')} |`;
  return [line(headers), `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n');
}

/** Sección con el registro completo de avisos y errores del proceso, en orden. */
export function diagnosticsSection(diagnostics: readonly Diagnostic[]): string {
  const title = '## Registro de avisos y errores';
  if (diagnostics.length === 0) return `${title}\n\nEl proceso no ha generado ningún aviso ni error.`;

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  const rows = diagnostics.map((diagnostic) => [
    STAGE_LABELS[diagnostic.stage],
    diagnostic.severity === 'error' ? 'Error' : 'Aviso',
    inlineCode(diagnostic.code),
    diagnostic.message,
    inlineCode(diagnostic.fragment),
    diagnostic.position ? `${diagnostic.position.line}:${diagnostic.position.column}` : '—',
  ]);
  return [
    title,
    '',
    `${warnings} aviso(s) y ${errors} error(es). La posición (línea:columna) se refiere al script original; los avisos de la inferencia y de la generación no tienen posición porque se producen sobre el modelo.`,
    '',
    markdownTable(['Etapa', 'Tipo', 'Código', 'Mensaje', 'Fragmento', 'Posición'], rows),
  ].join('\n');
}
