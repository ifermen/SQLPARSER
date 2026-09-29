import { cleanIdentifier, IDENTIFIER, QUALIFIED_IDENTIFIER } from './identifiers';
import { readStringLiteral } from './literals';
import { readReferencedColumns } from './tableElement';

export interface InlineReference {
  readonly name?: string;
  readonly table: string;
  /** Vacío si no se indican: se resuelven a la PK de la tabla referenciada. */
  readonly columns: readonly string[];
}

/** Información de una definición de columna que la librería de parseo no aporta. */
export interface ColumnDefinitionInfo {
  readonly name: string;
  readonly primaryKey: boolean;
  readonly unique: boolean;
  readonly reference?: InlineReference;
  readonly autoIncrement: boolean;
  /**
   * Tipo tal y como está escrito cuando la librería lo recorta: tipos de varias
   * palabras (`timestamp(6) with time zone`, `LONG RAW`, `INTERVAL DAY TO SECOND`)
   * o cualificados (`public.status`).
   */
  readonly rawType?: string;
  /** `UNSIGNED` (MySQL). La librería lo pierde en tipos sin parámetros (`int unsigned`). */
  readonly unsigned: boolean;
  /** Comentario explícito `COMMENT '…'` (MySQL). */
  readonly comment?: string;
}

const COLUMN_NAME = new RegExp(`^\\s*(${IDENTIFIER})`);
const INLINE_REFERENCE = new RegExp(
  `(?:\\bCONSTRAINT\\s+(${IDENTIFIER})\\s+)?\\bREFERENCES\\s+(${QUALIFIED_IDENTIFIER})\\s*`,
  'i',
);
/** Valor por defecto tomado de una secuencia: `nextval('seq')` (PostgreSQL) o `seq.NEXTVAL` (Oracle). */
const SEQUENCE_VALUE = /\bnextval\s*\(|\.\s*"?NEXTVAL\b/i;
const AUTO_INCREMENT = new RegExp(
  '\\bAUTO_?INCREMENT\\b|\\bIDENTITY\\b|' +
    '\\bGENERATED\\s+(?:ALWAYS|BY\\s+DEFAULT)(?:\\s+ON\\s+NULL)?\\s+AS\\s+IDENTITY\\b|' +
    SEQUENCE_VALUE.source,
  'i',
);
const COMMENT = /\bCOMMENT\s+'/i;
/** Tipos de varias palabras que la librería recorta a la primera. */
const MULTI_WORD_TYPE = new RegExp(
  '^\\s*(' +
    [
      '(?:TIMESTAMP|TIME)\\s*(?:\\(\\s*\\d+\\s*\\))?\\s+WITH(?:OUT)?\\s+(?:LOCAL\\s+)?TIME\\s+ZONE',
      'INTERVAL\\s+(?:YEAR|DAY)\\s*(?:\\(\\s*\\d+\\s*\\))?\\s+TO\\s+(?:MONTH|SECOND)(?:\\s*\\(\\s*\\d+\\s*\\))?',
      'LONG\\s+RAW',
    ].join('|') +
    // No `\b`: el tipo puede terminar en `)` (`SECOND(0)`).
    ')(?![\\w$#])',
  'i',
);
const QUALIFIED_TYPE = new RegExp(`^\\s*(${IDENTIFIER}(?:\\s*\\.\\s*${IDENTIFIER})+(?:\\s*\\[\\s*\\])?)`);

/** Indica si un valor por defecto se obtiene de una secuencia (autoincremento). */
export function isSequenceValue(expression: string): boolean {
  return SEQUENCE_VALUE.test(expression);
}

/**
 * Lee una definición de columna. Las palabras clave se buscan en el esqueleto
 * para no confundirlas con el contenido de un literal; los valores de los
 * literales se leen del texto original en las mismas posiciones.
 */
export function readColumnDefinitionInfo(
  skeleton: string,
  text: string,
  backslashEscapes: boolean,
): ColumnDefinitionInfo | null {
  const nameMatch = COLUMN_NAME.exec(skeleton);
  if (!nameMatch?.[1]) return null;
  const rest = skeleton.slice(nameMatch[0].length);

  let reference: InlineReference | undefined;
  const referenceMatch = INLINE_REFERENCE.exec(rest);
  if (referenceMatch?.[2]) {
    const afterTable = rest.slice(referenceMatch.index + referenceMatch[0].length);
    reference = {
      ...(referenceMatch[1] ? { name: cleanIdentifier(referenceMatch[1]) } : {}),
      table: cleanIdentifier(referenceMatch[2]),
      columns: readReferencedColumns(afterTable) ?? [],
    };
  }

  const rawType = (MULTI_WORD_TYPE.exec(rest)?.[1] ?? QUALIFIED_TYPE.exec(rest)?.[1])?.replace(/\s+/g, ' ');

  const commentMatch = COMMENT.exec(skeleton);
  const comment = commentMatch
    ? readStringLiteral(text, commentMatch.index + commentMatch[0].length - 1, backslashEscapes)
    : undefined;

  return {
    name: cleanIdentifier(nameMatch[1]),
    primaryKey: /\bPRIMARY\s+KEY\b/i.test(rest),
    unique: /\bUNIQUE\b/i.test(rest),
    ...(reference ? { reference } : {}),
    autoIncrement: AUTO_INCREMENT.test(rest),
    ...(rawType !== undefined ? { rawType } : {}),
    unsigned: /\bUNSIGNED\b/i.test(rest),
    ...(comment !== undefined ? { comment } : {}),
  };
}
