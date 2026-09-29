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
  FLOAT8: 'double',
  DOUBLE: 'double',
  'DOUBLE PRECISION': 'double',

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

  TEXT: 'text',
  TINYTEXT: 'text',
  MEDIUMTEXT: 'text',
  LONGTEXT: 'text',
  NTEXT: 'text',
  CLOB: 'text',
  CITEXT: 'text',
  XML: 'text',

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

  JSON: 'json',
  JSONB: 'json',

  ENUM: 'enum',
};

function resolveLogicalType(
  name: string,
  firstParam: number | undefined,
  unsigned: boolean,
  dialect: SqlDialect | null,
): LogicalType {
  switch (name) {
    case 'TINYINT':
      // Convención de MySQL para booleanos.
      if (firstParam === 1) return 'boolean';
      break;
    case 'BIT':
      return firstParam === undefined || firstParam === 1 ? 'boolean' : 'binary';
    case 'FLOAT':
      // En PostgreSQL FLOAT sin precisión es de 8 bytes; en MySQL, de 4.
      return dialect === 'postgresql' ? 'double' : 'float';
    case 'REAL':
      // En PostgreSQL REAL es de 4 bytes; en MySQL y SQLite, de 8.
      return dialect === 'postgresql' ? 'float' : 'double';
  }

  const logical = LOGICAL_TYPES[name] ?? 'unknown';
  if (unsigned) {
    // Un entero sin signo no cabe en el tipo con signo del mismo tamaño.
    if (name === 'SMALLINT') return 'integer';
    if (name === 'INT' || name === 'INTEGER') return 'bigint';
  }
  return logical;
}

/** Interpreta un tipo SQL (`VARCHAR(255)`, `DECIMAL(10,2)`, `INT UNSIGNED`…). */
export function parseColumnType(raw: string, dialect: SqlDialect | null): ColumnType {
  const trimmed = raw.trim();
  const isArray = /\[\s*\d*\s*\]\s*$/.test(trimmed);
  const unsigned = /\bUNSIGNED\b/i.test(trimmed);
  const params = /\(([^)]*)\)/.exec(trimmed)?.[1];
  const name = trimmed
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:UNSIGNED|SIGNED|ZEROFILL)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const numbers =
    params !== undefined && /^\s*\d+\s*(?:,\s*\d+\s*)?$/.test(params)
      ? params.split(',').map((value) => Number(value.trim()))
      : [];
  const logical = isArray ? 'unknown' : resolveLogicalType(name, numbers[0], unsigned, dialect);

  const length = logical === 'string' || logical === 'binary' ? numbers[0] : undefined;
  const precision = logical === 'decimal' ? numbers[0] : undefined;
  const scale = logical === 'decimal' ? numbers[1] : undefined;
  const enumValues =
    logical === 'enum' && params !== undefined
      ? [...params.matchAll(/'((?:[^']|'')*)'/g)].map((match) => (match[1] ?? '').replace(/''/g, "'"))
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
