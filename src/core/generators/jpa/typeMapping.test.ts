import { describe, expect, it } from 'vitest';
import type { LogicalType } from '@/core/model';
import { importOf, isLob, javaTypeFor } from './typeMapping';

describe('javaTypeFor', () => {
  it.each<[LogicalType, string, string | undefined]>([
    ['boolean', 'Boolean', undefined],
    ['smallint', 'Short', undefined],
    ['integer', 'Integer', undefined],
    ['bigint', 'Long', undefined],
    ['decimal', 'BigDecimal', 'java.math.BigDecimal'],
    ['float', 'Float', undefined],
    ['double', 'Double', undefined],
    ['string', 'String', undefined],
    ['text', 'String', undefined],
    ['date', 'LocalDate', 'java.time.LocalDate'],
    ['time', 'LocalTime', 'java.time.LocalTime'],
    ['datetime', 'LocalDateTime', 'java.time.LocalDateTime'],
    ['datetime-tz', 'OffsetDateTime', 'java.time.OffsetDateTime'],
    ['uuid', 'UUID', 'java.util.UUID'],
    ['binary', 'byte[]', undefined],
    ['json', 'String', undefined],
  ])('%s → %s', (logical, name, javaImport) => {
    expect(javaTypeFor(logical)).toEqual({ name, ...(javaImport ? { import: javaImport } : {}) });
  });

  it('enum y unknown los resuelve el planificador', () => {
    expect(javaTypeFor('enum')).toBeNull();
    expect(javaTypeFor('unknown')).toBeNull();
  });

  it('importOf devuelve el import de un tipo simple', () => {
    expect(importOf('BigDecimal')).toBe('java.math.BigDecimal');
    expect(importOf('Long')).toBeUndefined();
  });
});

describe('isLob', () => {
  const type = (name: string) => ({ raw: name, name, logical: 'text' as const });

  it.each(['CLOB', 'NCLOB', 'BLOB', 'LONGBLOB', 'MEDIUMTEXT', 'LONGTEXT'])('%s → @Lob', (name) => {
    expect(isLob(type(name))).toBe(true);
  });

  it.each(['TEXT', 'BYTEA', 'VARCHAR', 'RAW'])('%s → sin @Lob', (name) => {
    expect(isLob(type(name))).toBe(false);
  });
});
