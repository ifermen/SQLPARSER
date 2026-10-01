import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@/core/model';
import { describeDialect, diagnosticsSection, inlineCode, markdownTable, tableCell } from './readme';

describe('utilidades de Markdown', () => {
  it('tableCell escapa las barras verticales y aplana los saltos de línea', () => {
    expect(tableCell('a | b\nc')).toBe('a \\| b c');
  });

  it('inlineCode admite acentos graves en el contenido', () => {
    expect(inlineCode('users')).toBe('`users`');
    expect(inlineCode('CREATE TABLE `users`')).toBe('`` CREATE TABLE `users` ``');
  });

  it('markdownTable genera cabecera, separador y filas', () => {
    expect(markdownTable(['A', 'B'], [['1', '2|3']])).toBe('| A | B |\n| --- | --- |\n| 1 | 2\\|3 |');
  });

  it.each([
    [null, undefined, 'No detectado (se han aplicado reglas genéricas)'],
    ['oracle', { dialect: 'oracle', source: 'detected' }, 'Oracle (detectado automáticamente)'],
    ['mysql', { dialect: 'mysql', source: 'manual' }, 'MySQL (indicado manualmente)'],
    ['sqlite', undefined, 'SQLite'],
  ] as const)('describeDialect(%s) → %s', (dialect, resolution, expected) => {
    expect(describeDialect(dialect, resolution)).toBe(expected);
  });
});

describe('diagnosticsSection', () => {
  it('sin diagnósticos lo indica expresamente', () => {
    expect(diagnosticsSection([])).toBe('## Registro de avisos y errores\n\nEl proceso no ha generado ningún aviso ni error.');
  });

  it('lista todos los diagnósticos en orden, con etapa, tipo, código, mensaje, fragmento y posición', () => {
    const diagnostics: Diagnostic[] = [
      {
        severity: 'warning',
        stage: 'parser',
        code: 'parser.unsupported-statement',
        message: 'Sentencia no soportada; se ignora.',
        fragment: 'CREATE VIEW v AS SELECT 1 | 2',
        position: { line: 3, column: 1 },
      },
      {
        severity: 'error',
        stage: 'generator',
        code: 'jpa.unmapped-type',
        message: 'Tipo sin equivalente.',
        fragment: 'area GEOMETRY',
      },
    ];

    expect(diagnosticsSection(diagnostics).split('\n')).toEqual([
      '## Registro de avisos y errores',
      '',
      '1 aviso(s) y 1 error(es). La posición (línea:columna) se refiere al script original; los avisos de la inferencia y de la generación no tienen posición porque se producen sobre el modelo.',
      '',
      '| Etapa | Tipo | Código | Mensaje | Fragmento | Posición |',
      '| --- | --- | --- | --- | --- | --- |',
      '| Análisis | Aviso | `parser.unsupported-statement` | Sentencia no soportada; se ignora. | `CREATE VIEW v AS SELECT 1 \\| 2` | 3:1 |',
      '| Generación | Error | `jpa.unmapped-type` | Tipo sin equivalente. | `area GEOMETRY` | — |',
    ]);
  });
});
