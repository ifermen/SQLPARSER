import { describe, expect, it } from 'vitest';
import type { LogicalType, SqlDialect } from '@/core/model';
import { parseColumnType } from './columnType';

describe('parseColumnType', () => {
  it.each<[string, SqlDialect | null, LogicalType]>([
    ['BOOLEAN', null, 'boolean'],
    ['tinyint(1)', 'mysql', 'boolean'],
    ['BIT', null, 'boolean'],
    ['BIT(8)', null, 'binary'],
    ['tinyint(4)', 'mysql', 'smallint'],
    ['SMALLINT UNSIGNED', 'mysql', 'integer'],
    ['int(11)', 'mysql', 'integer'],
    ['int unsigned', 'mysql', 'bigint'],
    ['SERIAL', 'postgresql', 'integer'],
    ['BIGSERIAL', 'postgresql', 'bigint'],
    ['NUMERIC(10,2)', null, 'decimal'],
    ['FLOAT', 'mysql', 'float'],
    ['FLOAT', 'postgresql', 'double'],
    ['REAL', 'postgresql', 'float'],
    ['REAL', 'sqlite', 'double'],
    ['double precision', 'postgresql', 'double'],
    ['character varying(80)', 'postgresql', 'string'],
    ['LONGTEXT', 'mysql', 'text'],
    ['DATE', null, 'date'],
    ['time with time zone', 'postgresql', 'time'],
    ['DATETIME', 'mysql', 'datetime'],
    ['timestamp without time zone', 'postgresql', 'datetime'],
    ['timestamptz', 'postgresql', 'datetime-tz'],
    ['UUID', 'postgresql', 'uuid'],
    ['BYTEA', 'postgresql', 'binary'],
    ['JSONB', 'postgresql', 'json'],
    ["ENUM('a','b')", 'mysql', 'enum'],
    ['text[]', 'postgresql', 'unknown'],
    ['GEOMETRY', 'mysql', 'unknown'],
  ])('%s (%s) → %s', (raw, dialect, logical) => {
    expect(parseColumnType(raw, dialect).logical).toBe(logical);
  });

  it('extrae longitud, precisión, escala y valores de enumerado', () => {
    expect(parseColumnType('VARCHAR(255)', null)).toEqual({
      raw: 'VARCHAR(255)',
      name: 'VARCHAR',
      logical: 'string',
      length: 255,
    });
    expect(parseColumnType('DECIMAL(12, 4) UNSIGNED', 'mysql')).toEqual({
      raw: 'DECIMAL(12, 4) UNSIGNED',
      name: 'DECIMAL',
      logical: 'decimal',
      precision: 12,
      scale: 4,
    });
    expect(parseColumnType("ENUM('it''s','b')", 'mysql').enumValues).toEqual(["it's", 'b']);
  });
});
