import { describe, expect, it } from 'vitest';
import type { Column, Diagnostic, EnrichedSchemaModel, EnrichedTable } from '@/core/model';
import type { GenerationResult } from '../generator';
import { JPA_DIAGNOSTICS } from './diagnosticCodes';
import { jpaGenerator } from './jpaGenerator';
import { JPA_DEFAULT_OPTIONS, type JpaOptions } from './jpaOptions';

function col(name: string): Column {
  return { name, type: { raw: 'INT', name: 'INT', logical: 'integer' }, nullable: false, autoIncrement: false };
}

function table(name: string, columns: readonly string[], pk: readonly string[] = ['id']): EnrichedTable {
  return {
    name,
    columns: columns.map(col),
    ...(pk.length > 0 ? { primaryKey: { columns: pk } } : {}),
    foreignKeys: [],
    uniqueConstraints: [],
    kind: 'entity',
  };
}

const schema: EnrichedSchemaModel = {
  dialect: 'mysql',
  tables: [table('customers', ['id']), table('order_line', ['order_id', 'line_no'], ['order_id', 'line_no'])],
  relationships: [],
};

function generate(options: Partial<JpaOptions> = {}, diagnostics: readonly Diagnostic[] = []): GenerationResult {
  return jpaGenerator.generate(schema, { ...JPA_DEFAULT_OPTIONS, ...options }, {
    diagnostics,
    dialect: { dialect: 'mysql', source: 'manual' },
  });
}

function readmeOf(result: GenerationResult): string {
  return result.files.find((file) => file.path === 'README.md')?.content ?? '';
}

describe('jpaGenerator · contrato', () => {
  it('identidad y opciones por defecto', () => {
    expect(jpaGenerator.id).toBe('jpa');
    expect(jpaGenerator.label).toBe('JPA (Jakarta Persistence)');
    expect(jpaGenerator.defaultOptions).toEqual({
      basePackage: 'com.example.entity',
      annotationLibrary: 'jakarta',
      useLombok: false,
      classNaming: { number: 'singular', case: 'pascal' },
    });
  });

  it('una clase por entidad, su IdClass a continuación y el README al final', () => {
    const result = generate();

    expect(result.files.map((file) => [file.path, file.language])).toEqual([
      ['src/main/java/com/example/entity/Customer.java', 'java'],
      ['src/main/java/com/example/entity/OrderLine.java', 'java'],
      ['src/main/java/com/example/entity/OrderLineId.java', 'java'],
      ['README.md', 'markdown'],
    ]);
    expect(result.files[0]?.content.startsWith('package com.example.entity;\n')).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('funciona sin contexto (los diagnósticos anteriores son opcionales)', () => {
    const result = jpaGenerator.generate(schema, JPA_DEFAULT_OPTIONS);

    expect(readmeOf(result)).toContain('| Dialecto SQL | MySQL |');
    expect(readmeOf(result)).toContain('El proceso no ha generado ningún aviso ni error.');
  });
});

describe('jpaGenerator · opciones', () => {
  it('el paquete base decide la carpeta y la sentencia package', () => {
    const result = generate({ basePackage: 'org.acme.shop.domain' });

    expect(result.files[0]?.path).toBe('src/main/java/org/acme/shop/domain/Customer.java');
    expect(result.files[0]?.content.startsWith('package org.acme.shop.domain;\n')).toBe(true);
  });

  it('paquete vacío: paquete por defecto, sin sentencia package', () => {
    const result = generate({ basePackage: '' });

    expect(result.files[0]?.path).toBe('src/main/java/Customer.java');
    expect(result.files[0]?.content.startsWith('import ')).toBe(true);
    expect(readmeOf(result)).toContain('| Paquete base | Paquete por defecto (sin `package`) |');
  });

  it('paquete no válido: aviso y paquete por defecto', () => {
    const result = generate({ basePackage: 'com.1acme' });

    expect(result.files[0]?.path).toBe('src/main/java/com/example/entity/Customer.java');
    expect(result.diagnostics).toEqual<Diagnostic[]>([
      {
        severity: 'warning',
        stage: 'generator',
        code: JPA_DIAGNOSTICS.invalidPackage,
        message: '"com.1acme" no es un paquete Java válido; se usa com.example.entity.',
        fragment: 'basePackage = "com.1acme"',
      },
    ]);
    expect(readmeOf(result)).toContain(
      '| Paquete base | `com.example.entity` (el indicado, `com.1acme`, no es un paquete Java válido) |',
    );
  });

  it('Lombok todavía no está implementado: aviso y getters/setters igualmente', () => {
    const result = generate({ useLombok: true });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([JPA_DIAGNOSTICS.lombokNotSupported]);
    expect(result.files[0]?.content).toContain('public Integer getId() {');
    expect(result.files[0]?.content).not.toContain('lombok');
    expect(readmeOf(result)).toContain('| Lombok | Solicitado, pero todavía no está implementado: se generan getters y setters |');
  });

  it('la estrategia de nombres de clase cambia los nombres de fichero', () => {
    expect(generate({ classNaming: { number: 'plural', case: 'pascal' } }).files.map((file) => file.path)).toContain(
      'src/main/java/com/example/entity/OrderLines.java',
    );
    expect(generate({ classNaming: { number: 'as-is', case: 'as-is' } }).files.map((file) => file.path)).toContain(
      'src/main/java/com/example/entity/customers.java',
    );
  });
});

describe('jpaGenerator · README', () => {
  const parserWarning: Diagnostic = {
    severity: 'warning',
    stage: 'parser',
    code: 'parser.unsupported-statement',
    message: 'Sentencia no soportada; se ignora.',
    fragment: 'CREATE VIEW v AS SELECT 1',
    position: { line: 7, column: 1 },
  };

  it('recoge configuración, tablas, relaciones, ficheros, integración, decisiones y registro', () => {
    const readme = readmeOf(generate({}, [parserWarning]));

    expect(readme.match(/^## .+$/gm)).toEqual([
      '## Configuración',
      '## Tablas detectadas',
      '## Relaciones inferidas',
      '## Ficheros generados',
      '## Cómo integrarlo',
      '## Decisiones de mapeo',
      '## Registro de avisos y errores',
    ]);
    expect(readme).toContain('| Dialecto SQL | MySQL (indicado manualmente) |');
    expect(readme).toContain('| `customers` | Entidad | `Customer` | 1 | id |');
    expect(readme).toContain('| `order_line` | Entidad | `OrderLine` | 2 | order_id, line_no |');
    expect(readme).toContain('No se ha inferido ninguna relación.');
    expect(readme).toContain('- `src/main/java/com/example/entity/OrderLineId.java`');
    expect(readme).toContain('- `README.md` (este fichero)');
  });

  it('el registro incluye los diagnósticos anteriores y los del generador, en orden', () => {
    const result = generate({ useLombok: true }, [parserWarning]);
    const readme = readmeOf(result);

    expect(readme).toContain('2 aviso(s) y 0 error(es).');
    expect(readme.indexOf('parser.unsupported-statement')).toBeLessThan(readme.indexOf('jpa.lombok-not-supported'));
    expect(readme).toContain('| Análisis | Aviso | `parser.unsupported-statement` | Sentencia no soportada; se ignora. | `CREATE VIEW v AS SELECT 1` | 7:1 |');
    // El resultado solo devuelve los diagnósticos propios del generador.
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([JPA_DIAGNOSTICS.lombokNotSupported]);
  });

  it('es determinista (sin fechas ni datos variables)', () => {
    expect(generate()).toEqual(generate());
  });
});
