import type { ColumnType, LogicalType, SqlDialect } from '@/core/model';

const LOGICAL_TYPES: Readonly<Record<string, LogicalType>> = {
  BOOLEAN: 'boolean',
  BOOL: 'boolean',

  TINYINT: 'smallint',
  SMALLINT: 'smallint',
  INT2: 'smallint',
  SMALLSERIAL: 'smallint',
  SERIAL2: 'smallint',
  YEAR: 'smallint',

  MEDIUMINT: 'integer',
  INT: 'integer',
  INTEGER: 'integer',
  INT4: 'integer',
  SERIAL: 'integer',
  SERIAL4: 'integer',

  BIGINT: 'bigint',
  INT8: 'bigint',
  BIGSERIAL: 'bigint',
  SERIAL8: 'bigint',

  DECIMAL: 'decimal',
  NUMERIC: 'decimal',
  DEC: 'decimal',
  FIXED: 'decimal',
  MONEY: 'decimal',

  FLOAT4: 'float',
  BINARY_FLOAT: 'float',
  FLOAT8: 'double',
  DOUBLE: 'double',
  'DOUBLE PRECISION': 'double',
  BINARY_DOUBLE: 'double',

  CHAR: 'string',
  CHARACTER: 'string',
  VARCHAR: 'string',
  'CHARACTER VARYING': 'string',
  NCHAR: 'string',
  NVARCHAR: 'string',
  'NATIONAL CHARACTER': 'string',
  'NATIONAL CHARACTER VARYING': 'string',
  VARCHAR2: 'string',
  NVARCHAR2: 'string',
  BPCHAR: 'string',
  INET: 'string',
  CIDR: 'string',
  MACADDR: 'string',
  ROWID: 'string',
  UROWID: 'string',

  TEXT: 'text',
  TINYTEXT: 'text',
  MEDIUMTEXT: 'text',
  LONGTEXT: 'text',
  NTEXT: 'text',
  CLOB: 'text',
  NCLOB: 'text',
  LONG: 'text',
  CITEXT: 'text',
  XML: 'text',
  XMLTYPE: 'text',

  DATE: 'date',

  TIME: 'time',
  TIMETZ: 'time',
  'TIME WITHOUT TIME ZONE': 'time',
  'TIME WITH TIME ZONE': 'time',

  DATETIME: 'datetime',
  DATETIME2: 'datetime',
  SMALLDATETIME: 'datetime',
  TIMESTAMP: 'datetime',
  'TIMESTAMP WITHOUT TIME ZONE': 'datetime',

  TIMESTAMPTZ: 'datetime-tz',
  'TIMESTAMP WITH TIME ZONE': 'datetime-tz',
  'TIMESTAMP WITH LOCAL TIME ZONE': 'datetime-tz',
  DATETIMEOFFSET: 'datetime-tz',

  UUID: 'uuid',
  UNIQUEIDENTIFIER: 'uuid',

  BINARY: 'binary',
  VARBINARY: 'binary',
  BLOB: 'binary',
  TINYBLOB: 'binary',
  MEDIUMBLOB: 'binary',
  LONGBLOB: 'binary',
  BYTEA: 'binary',
  RAW: 'binary',
  'LONG RAW': 'binary',

  JSON: 'json',
  JSONB: 'json',

  ENUM: 'enum',
};

interface TypeParams {
  /** Primer parámetro numérico: longitud o precisión (`(255)`, `(10,2)`, `(20 BYTE)`). */
  readonly first?: number;
  /** Segundo parámetro numérico: escala (`(10,2)`). */
  readonly second?: number;
  /** Precisión `*` de Oracle (`NUMBER(*,0)`): el máximo, sin valor en `first`. */
  readonly anyPrecision: boolean;
}

const NO_PARAMS: TypeParams = { anyPrecision: false };

function parseTypeParams(params: string | undefined): TypeParams {
  if (params === undefined) return NO_PARAMS;
  // Oracle: semántica de longitud en `VARCHAR2(20 BYTE)` o `CHAR(1 CHAR)`.
  const normalized = params.replace(/\s+(?:BYTE|CHAR)\s*$/i, '').trim();
  const match = /^(\*|\d+)\s*(?:,\s*(\d+))?$/.exec(normalized);
  if (!match?.[1]) return NO_PARAMS;

  const anyPrecision = match[1] === '*';
  return {
    ...(anyPrecision ? {} : { first: Number(match[1]) }),
    ...(match[2] !== undefined ? { second: Number(match[2]) } : {}),
    anyPrecision,
  };
}

/**
 * `NUMBER` de Oracle. Sin escala (o con escala 0) es un entero; los umbrales
 * siguen la convención de Hibernate (`Boolean` → `NUMBER(1)`, `Short` →
 * `NUMBER(5)`, `Integer` → `NUMBER(10)`, `Long` → `NUMBER(19)`) para que un
 * esquema generado por Hibernate vuelva a los mismos tipos. Con decimales o
 * sin precisión, es un decimal. `NUMBER(*,0)` es como Oracle define `INTEGER`.
 */
function resolveOracleNumber({ first: precision, second: scale, anyPrecision }: TypeParams): LogicalType {
  if (anyPrecision) return scale === 0 ? 'integer' : 'decimal';
  if (precision === undefined || (scale !== undefined && scale > 0)) return 'decimal';
  if (precision === 1) return 'boolean';
  if (precision <= 5) return 'smallint';
  if (precision <= 10) return 'integer';
  if (precision <= 19) return 'bigint';
  return 'decimal';
}

function resolveLogicalType(
  name: string,
  params: TypeParams,
  unsigned: boolean,
  dialect: SqlDialect | null,
): LogicalType {
  switch (name) {
    case 'TINYINT':
      // Convención de MySQL para booleanos.
      if (params.first === 1) return 'boolean';
      break;
    case 'BIT':
      return params.first === undefined || params.first === 1 ? 'boolean' : 'binary';
    case 'NUMBER':
      return resolveOracleNumber(params);
    case 'DATE':
      // En Oracle, DATE incluye la hora.
      return dialect === 'oracle' ? 'datetime' : 'date';
    case 'FLOAT':
      // En PostgreSQL y Oracle, FLOAT sin precisión es de 8 bytes; en MySQL, de 4.
      return dialect === 'postgresql' || dialect === 'oracle' ? 'double' : 'float';
    case 'REAL':
      // En PostgreSQL, REAL es de 4 bytes; en MySQL, SQLite y Oracle, de 8.
      return dialect === 'postgresql' ? 'float' : 'double';
  }

  // Tipos cualificados con esquema (`SYS.XMLTYPE`, `pg_catalog.int4`): se prueba el último nombre.
  const logical = LOGICAL_TYPES[name] ?? LOGICAL_TYPES[name.slice(name.lastIndexOf('.') + 1)] ?? 'unknown';
  if (unsigned) {
    // Un entero sin signo no cabe en el tipo con signo del mismo tamaño.
    if (name === 'SMALLINT') return 'integer';
    if (name === 'INT' || name === 'INTEGER') return 'bigint';
  }
  return logical;
}

/** Interpreta un tipo SQL (`VARCHAR(255)`, `DECIMAL(10,2)`, `INT UNSIGNED`, `NUMBER(10)`…). */
export function parseColumnType(raw: string, dialect: SqlDialect | null): ColumnType {
  const trimmed = raw.trim();
  const isArray = /\[\s*\d*\s*\]\s*$/.test(trimmed);
  const unsigned = /\bUNSIGNED\b/i.test(trimmed);
  const rawParams = /\(([^)]*)\)/.exec(trimmed)?.[1];
  const name = trimmed
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:UNSIGNED|SIGNED|ZEROFILL)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const params = parseTypeParams(rawParams);
  const logical = isArray ? 'unknown' : resolveLogicalType(name, params, unsigned, dialect);

  const length = logical === 'string' || logical === 'binary' ? params.first : undefined;
  const precision = logical === 'decimal' ? params.first : undefined;
  const scale = logical === 'decimal' ? params.second : undefined;
  const enumValues =
    logical === 'enum' && rawParams !== undefined
      ? [...rawParams.matchAll(/'((?:[^']|'')*)'/g)].map((match) => (match[1] ?? '').replace(/''/g, "'"))
      : undefined;

  return {
    raw: trimmed,
    name,
    logical,
    ...(length !== undefined ? { length } : {}),
    ...(precision !== undefined ? { precision } : {}),
    ...(scale !== undefined ? { scale } : {}),
    ...(enumValues !== undefined ? { enumValues } : {}),
  };
}
