/** Códigos de los diagnósticos que emite el parser. */
export const PARSER_DIAGNOSTICS = {
  // Errores: impiden obtener un esquema.
  unterminatedString: 'parser.unterminated-string',
  unterminatedComment: 'parser.unterminated-comment',
  unbalancedParentheses: 'parser.unbalanced-parentheses',
  invalidCreateTable: 'parser.invalid-create-table',
  noTables: 'parser.no-tables',

  // Avisos: el análisis continúa.
  dialectNotDetected: 'parser.dialect-not-detected',
  unsupportedStatement: 'parser.unsupported-statement',
  unsupportedAlterAction: 'parser.unsupported-alter-action',
  unsupportedTableElement: 'parser.unsupported-table-element',
  unsupportedIndex: 'parser.unsupported-index',
  unreadableColumn: 'parser.unreadable-column',
  unknownColumnType: 'parser.unknown-column-type',
  duplicateTable: 'parser.duplicate-table',
  duplicateColumn: 'parser.duplicate-column',
  duplicatePrimaryKey: 'parser.duplicate-primary-key',
  unknownTable: 'parser.unknown-table',
  unknownColumn: 'parser.unknown-column',
  unknownReferencedTable: 'parser.unknown-referenced-table',
  unknownReferencedColumn: 'parser.unknown-referenced-column',
  missingReferencedKey: 'parser.missing-referenced-key',
  foreignKeyColumnMismatch: 'parser.foreign-key-column-mismatch',
} as const;
