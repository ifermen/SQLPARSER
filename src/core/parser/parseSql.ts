import type { Diagnostic, DialectResolution, SchemaModel, SqlDialect } from '@/core/model';
import { detectDialect } from './dialectDetection';
import { PARSER_DIAGNOSTICS } from './diagnosticCodes';
import { finalizeTables } from './finalizeTables';
import { createParseContext, type ParseContext } from './parseContext';
import { scanSql, type ScanError, type Statement } from './sqlScanner';
import { handleAlterTable } from './statements/alterTable';
import { classifyStatement } from './statements/classifyStatement';
import { handleCommentOn } from './statements/commentOn';
import { handleCreateTable } from './statements/createTable';
import { handleCreateUniqueIndex } from './statements/createUniqueIndex';

export interface ParseOptions {
  /** Dialecto indicado manualmente. Si se omite, se detecta a partir del script. */
  readonly dialect?: SqlDialect;
}

export interface ParseResult {
  /** `null` si hay algún error o si el script está vacío. */
  readonly schema: SchemaModel | null;
  readonly dialect: DialectResolution;
  /** Ordenados por posición en el script. */
  readonly diagnostics: readonly Diagnostic[];
}

const SCAN_ERRORS: Record<ScanError['kind'], { code: string; message: string }> = {
  'unterminated-string': {
    code: PARSER_DIAGNOSTICS.unterminatedString,
    message: 'Literal o identificador entrecomillado sin cerrar.',
  },
  'unterminated-comment': {
    code: PARSER_DIAGNOSTICS.unterminatedComment,
    message: 'Comentario /* … */ sin cerrar.',
  },
  'unbalanced-parentheses': {
    code: PARSER_DIAGNOSTICS.unbalancedParentheses,
    message: 'Paréntesis sin emparejar.',
  },
};

/**
 * Analiza un script SQL DDL y devuelve el modelo de esquema. Es una función
 * pura: los problemas del script se devuelven como diagnósticos, nunca como
 * excepciones.
 */
export function parseSql(input: string, options: ParseOptions = {}): ParseResult {
  const dialect: DialectResolution = options.dialect
    ? { dialect: options.dialect, source: 'manual' }
    : { dialect: detectDialect(input), source: 'detected' };

  if (!input.trim()) return { schema: null, dialect, diagnostics: [] };

  const backslashEscapes = dialect.dialect === 'mysql';
  const context = createParseContext(input, dialect.dialect, backslashEscapes);
  const scan = scanSql(input, { backslashEscapes });

  if (scan.error) {
    const { code, message } = SCAN_ERRORS[scan.error.kind];
    context.report('error', code, message, scan.error);
    return { schema: null, dialect, diagnostics: context.diagnostics };
  }

  const [firstStatement] = scan.statements;
  if (!firstStatement) {
    context.report(
      'error',
      PARSER_DIAGNOSTICS.noTables,
      'El script no contiene ninguna sentencia SQL.',
      { start: 0, end: input.length },
    );
    return { schema: null, dialect, diagnostics: context.diagnostics };
  }

  if (dialect.dialect === null) {
    context.report(
      'warning',
      PARSER_DIAGNOSTICS.dialectNotDetected,
      'No se ha podido detectar el dialecto SQL; se analiza con reglas genéricas. Puedes indicarlo manualmente.',
      firstLineOf(input, firstStatement),
    );
  }

  processStatements(context, scan.statements);
  const tables = finalizeTables(context);

  if (tables.length === 0) {
    context.report(
      'error',
      PARSER_DIAGNOSTICS.noTables,
      'El script no contiene ninguna sentencia CREATE TABLE válida.',
      firstLineOf(input, firstStatement),
    );
  }

  const diagnostics = sortByPosition(context.diagnostics);
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return {
    schema: hasErrors ? null : { dialect: dialect.dialect, tables },
    dialect,
    diagnostics,
  };
}

/**
 * Primero todos los CREATE TABLE y después el resto en orden, para que los
 * ALTER, índices y comentarios encuentren su tabla aunque aparezcan antes.
 */
function processStatements(context: ParseContext, statements: readonly Statement[]): void {
  const deferred: Statement[] = [];

  for (const statement of statements) {
    if (classifyStatement(statement.skeleton) === 'create-table') handleCreateTable(context, statement);
    else deferred.push(statement);
  }

  for (const statement of deferred) {
    switch (classifyStatement(statement.skeleton)) {
      case 'alter-table':
        handleAlterTable(context, statement);
        break;
      case 'create-unique-index':
        handleCreateUniqueIndex(context, statement);
        break;
      case 'comment-on':
        handleCommentOn(context, statement);
        break;
      case 'unsupported':
        context.report(
          'warning',
          PARSER_DIAGNOSTICS.unsupportedStatement,
          'Sentencia no soportada; se ignora.',
          statement,
        );
        break;
      default:
        break;
    }
  }
}

function firstLineOf(input: string, statement: Statement): { start: number; end: number } {
  const lineEnd = input.indexOf('\n', statement.start);
  return { start: statement.start, end: lineEnd < 0 ? statement.end : Math.min(lineEnd, statement.end) };
}

function sortByPosition(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const lineOf = (diagnostic: Diagnostic) => diagnostic.position?.line ?? Number.MAX_SAFE_INTEGER;
  const columnOf = (diagnostic: Diagnostic) => diagnostic.position?.column ?? 0;
  return [...diagnostics].sort((a, b) => lineOf(a) - lineOf(b) || columnOf(a) - columnOf(b));
}
