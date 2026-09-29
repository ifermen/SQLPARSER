import type { Statement } from '../sqlScanner';

export type StatementKind =
  | 'create-table'
  | 'alter-table'
  | 'create-unique-index'
  | 'comment-on'
  | 'create-trigger'
  /** Sentencias válidas que no aportan nada al modelo de entidades: se omiten sin aviso. */
  | 'ignored'
  /** Sentencias que podrían definir estructura y no se interpretan: se avisa. */
  | 'unsupported';

const CREATE_TABLE =
  /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMPORARY|TEMP|UNLOGGED)\s+)?TABLE\b/i;
const ALTER_TABLE = /^ALTER\s+TABLE\b/i;
const CREATE_UNIQUE_INDEX = /^CREATE\s+UNIQUE\s+(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX\b/i;
const COMMENT_ON = /^COMMENT\s+ON\b/i;
const CREATE_TRIGGER = /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:DEFINER\s*=\s*\S+\s+)?TRIGGER\b/i;
/** Bloque anónimo de PL/SQL. */
const ANONYMOUS_BLOCK = /^(?:DECLARE|BEGIN)\b/i;
/** Un bloque que crea tablas con SQL dinámico sí define estructura (y no se interpreta). */
const DYNAMIC_CREATE_TABLE = /\bEXECUTE\s+IMMEDIATE\b[\s\S]*?\bCREATE\s+(?:GLOBAL\s+TEMPORARY\s+)?TABLE\b/i;
const IGNORED = new RegExp(
  [
    // Datos, transacciones y configuración de sesión.
    'SET',
    'RESET',
    'USE',
    'BEGIN',
    'DECLARE',
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
    'MERGE',
    'SELECT',
    'WITH',
    'VALUES',
    'COPY',
    'TRUNCATE',
    'DROP',
    'PURGE',
    'GRANT',
    'REVOKE',
    'PRAGMA',
    'ANALYZE',
    'VACUUM',
    'REINDEX',
    'CHECKPOINT',
    'CALL',
    'EXEC(?:UTE)?',
    // Directiva del cliente mysql para cambiar el delimitador (triggers, procedimientos).
    'DELIMITER',
    // Objetos que no forman parte del modelo de entidades.
    'CREATE\\s+(?:DATABASE|SCHEMA|EXTENSION|SEQUENCE|ROLE|USER|TABLESPACE|DIRECTORY)',
    'CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:PUBLIC\\s+)?SYNONYM',
    'ALTER\\s+(?:SEQUENCE|DATABASE|SCHEMA|EXTENSION|ROLE|USER|SESSION|SYSTEM|TABLESPACE|DEFAULT\\s+PRIVILEGES)',
    // SQL Developer exporta `ALTER TRIGGER … ENABLE` tras cada trigger.
    'ALTER\\s+TRIGGER',
    'CREATE\\s+(?:(?:FULLTEXT|SPATIAL|BITMAP|CLUSTERED|NONCLUSTERED)\\s+)?INDEX',
  ]
    .map((keyword) => `^${keyword}\\b`)
    .join('|'),
  'i',
);

export function classifyStatement(statement: Statement): StatementKind {
  const { skeleton } = statement;
  if (CREATE_TABLE.test(skeleton)) return 'create-table';
  if (ALTER_TABLE.test(skeleton)) return 'alter-table';
  if (CREATE_UNIQUE_INDEX.test(skeleton)) return 'create-unique-index';
  if (COMMENT_ON.test(skeleton)) return 'comment-on';
  if (CREATE_TRIGGER.test(skeleton)) return 'create-trigger';
  // El SQL dinámico va dentro de literales: se busca en el texto original.
  if (ANONYMOUS_BLOCK.test(skeleton) && DYNAMIC_CREATE_TABLE.test(statement.text)) return 'unsupported';
  if (IGNORED.test(skeleton)) return 'ignored';
  return 'unsupported';
}
