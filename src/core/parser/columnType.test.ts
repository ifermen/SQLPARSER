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
    ['pg_catalog.int4', 'postgresql', 'integer'],
    // Oracle: NUMBER según precisión y escala (convención de Hibernate).
    ['NUMBER(1)', 'oracle', 'boolean'],
    ['NUMBER(3)', 'oracle', 'smallint'],
    ['NUMBER(5,0)', 'oracle', 'smallint'],
    ['NUMBER(6,0)', 'oracle', 'integer'],
    ['NUMBER(10)', 'oracle', 'integer'],
    ['NUMBER(11)', 'oracle', 'bigint'],
    ['NUMBER(19,0)', 'oracle', 'bigint'],
    ['NUMBER(20)', 'oracle', 'decimal'],
    ['NUMBER(8,2)', 'oracle', 'decimal'],
    ['NUMBER', 'oracle', 'decimal'],
    ['NUMBER(*,0)', 'oracle', 'integer'],
    ['NUMBER(*)', 'oracle', 'decimal'],
    // Oracle: resto de tipos propios.
    ['DATE', 'oracle', 'datetime'],
    ['DATE', 'postgresql', 'date'],
    ['FLOAT', 'oracle', 'double'],
    ['REAL', 'oracle', 'double'],
    ['BINARY_FLOAT', 'oracle', 'float'],
    ['BINARY_DOUBLE', 'oracle', 'double'],
    ['VARCHAR2(20 BYTE)', 'oracle', 'string'],
    ['NVARCHAR2(50)', 'oracle', 'string'],
    ['CHAR(1 CHAR)', 'oracle', 'string'],
    ['CLOB', 'oracle', 'text'],
    ['NCLOB', 'oracle', 'text'],
    ['LONG', 'oracle', 'text'],
    ['BLOB', 'oracle', 'binary'],
    ['RAW(16)', 'oracle', 'binary'],
    ['LONG RAW', 'oracle', 'binary'],
    ['TIMESTAMP(6)', 'oracle', 'datetime'],
    ['TIMESTAMP(6) WITH TIME ZONE', 'oracle', 'datetime-tz'],
    ['TIMESTAMP WITH LOCAL TIME ZONE', 'oracle', 'datetime-tz'],
    ['ROWID', 'oracle', 'string'],
    ['XMLTYPE', 'oracle', 'text'],
    ['SYS.XMLTYPE', 'oracle', 'text'],
    ['INTERVAL YEAR(2) TO MONTH', 'oracle', 'unknown'],
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

  it('Oracle: longitud con semántica BYTE/CHAR y precisión solo en los NUMBER decimales', () => {
    expect(parseColumnType('VARCHAR2(20 BYTE)', 'oracle')).toEqual({
      raw: 'VARCHAR2(20 BYTE)',
      name: 'VARCHAR2',
      logical: 'string',
      length: 20,
    });
    expect(parseColumnType('NUMBER(12,4)', 'oracle')).toEqual({
      raw: 'NUMBER(12,4)',
      name: 'NUMBER',
      logical: 'decimal',
      precision: 12,
      scale: 4,
    });
    expect(parseColumnType('NUMBER(10)', 'oracle')).toEqual({ raw: 'NUMBER(10)', name: 'NUMBER', logical: 'integer' });
  });
});
