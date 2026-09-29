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
   * Tipo tal y como está escrito cuando la librería lo recorta: tipos con
   * zona horaria (`timestamp(6) with time zone`) o cualificados (`public.status`).
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
const AUTO_INCREMENT =
  /\bAUTO_?INCREMENT\b|\bIDENTITY\b|\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)(?:\s+ON\s+NULL)?\s+AS\s+IDENTITY\b|\bnextval\s*\(/i;
const COMMENT = /\bCOMMENT\s+'/i;
const TIME_ZONE_TYPE = /^\s*((?:TIMESTAMP|TIME)\s*(?:\(\s*\d+\s*\))?\s+WITH(?:OUT)?\s+TIME\s+ZONE)\b/i;
const QUALIFIED_TYPE = new RegExp(`^\\s*(${IDENTIFIER}(?:\\s*\\.\\s*${IDENTIFIER})+(?:\\s*\\[\\s*\\])?)`);

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

  const rawType = (TIME_ZONE_TYPE.exec(rest)?.[1] ?? QUALIFIED_TYPE.exec(rest)?.[1])?.replace(/\s+/g, ' ');

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
