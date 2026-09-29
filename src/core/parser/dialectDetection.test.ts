import { describe, expect, it } from 'vitest';
import { detectDialect } from './dialectDetection';

describe('detectDialect', () => {
  it.each([
    ['CREATE TABLE `a` (id INT AUTO_INCREMENT) ENGINE=InnoDB;', 'mysql'],
    ['CREATE TABLE a (id SERIAL, data JSONB);', 'postgresql'],
    ["ALTER TABLE ONLY a ALTER COLUMN id SET DEFAULT nextval('a_seq'::regclass);", 'postgresql'],
    ['CREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT) WITHOUT ROWID;', 'sqlite'],
  ])('%s → %s', (sql, dialect) => {
    expect(detectDialect(sql)).toBe(dialect);
  });

  it('devuelve null si no hay rasgos propios de ningún dialecto', () => {
    expect(detectDialect('CREATE TABLE a (id INTEGER PRIMARY KEY, name VARCHAR(10));')).toBeNull();
  });

  it('devuelve null si hay empate', () => {
    expect(detectDialect('CREATE TABLE a (id INT AUTO_INCREMENT, b SERIAL);')).toBeNull();
  });
});
