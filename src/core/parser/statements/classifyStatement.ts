export type StatementKind =
  | 'create-table'
  | 'alter-table'
  | 'create-unique-index'
  | 'comment-on'
  /** Sentencias válidas que no aportan nada al modelo de entidades: se omiten sin aviso. */
  | 'ignored'
  /** Sentencias que podrían definir estructura y no se interpretan: se avisa. */
  | 'unsupported';

const CREATE_TABLE =
  /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMPORARY|TEMP|UNLOGGED)\s+)?TABLE\b/i;
const ALTER_TABLE = /^ALTER\s+TABLE\b/i;
const CREATE_UNIQUE_INDEX = /^CREATE\s+UNIQUE\s+(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX\b/i;
const COMMENT_ON = /^COMMENT\s+ON\b/i;
const IGNORED = new RegExp(
  [
    // Datos, transacciones y configuración de sesión.
    'SET',
    'RESET',
    'USE',
    'BEGIN',
    'START\\s+TRANSACTION',
    'COMMIT',
    'END',
    'ROLLBACK',
    'SAVEPOINT',
    'RELEASE',
    'LOCK',
    'UNLOCK',
    'INSERT',
    'REPLACE',
    'UPDATE',
    'DELETE',
    'SELECT',
    'WITH',
    'VALUES',
    'COPY',
    'TRUNCATE',
    'DROP',
    'GRANT',
    'REVOKE',
    'PRAGMA',
    'ANALYZE',
    'VACUUM',
    'REINDEX',
    'CHECKPOINT',
    // Directiva del cliente mysql para cambiar el delimitador (triggers, procedimientos).
    'DELIMITER',
    // Objetos que no forman parte del modelo de entidades.
    'CREATE\\s+(?:DATABASE|SCHEMA|EXTENSION|SEQUENCE|ROLE|USER)',
    'ALTER\\s+(?:SEQUENCE|DATABASE|SCHEMA|EXTENSION|ROLE|USER|DEFAULT\\s+PRIVILEGES)',
    'CREATE\\s+(?:(?:FULLTEXT|SPATIAL|BITMAP|CLUSTERED|NONCLUSTERED)\\s+)?INDEX',
  ]
    .map((keyword) => `^${keyword}\\b`)
    .join('|'),
  'i',
);

export function classifyStatement(skeleton: string): StatementKind {
  if (CREATE_TABLE.test(skeleton)) return 'create-table';
  if (ALTER_TABLE.test(skeleton)) return 'alter-table';
  if (CREATE_UNIQUE_INDEX.test(skeleton)) return 'create-unique-index';
  if (COMMENT_ON.test(skeleton)) return 'comment-on';
  if (IGNORED.test(skeleton)) return 'ignored';
  return 'unsupported';
}
