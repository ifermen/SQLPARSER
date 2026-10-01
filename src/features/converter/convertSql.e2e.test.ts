/**
 * Tests end-to-end del pipeline que usará la UI: script SQL (texto) →
 * `convertSql` → ficheros finales (clases Java + README). No hay mocks: se
 * ejecutan el parser, la inferencia y el generador reales.
 *
 * La UI todavía no existe; cuando exista, estos escenarios se repetirán desde
 * el navegador.
 */
import { describe, expect, it } from 'vitest';
import { JPA_DEFAULT_OPTIONS, JPA_DIAGNOSTICS } from '@/core/generators/jpa';
import { INFERENCE_DIAGNOSTICS } from '@/core/inference';
import { PARSER_DIAGNOSTICS } from '@/core/parser';
import mysqlDumpSql from '@/core/parser/__fixtures__/mysql-dump.sql?raw';
import oracleUs01Sql from '@/core/parser/__fixtures__/oracle-us01.sql?raw';
import postgresDumpSql from '@/core/parser/__fixtures__/postgres-dump.sql?raw';
import { convertSql, DEFAULT_CONVERSION_SETTINGS, type ConversionResult } from './convertSql';

function readmeOf(result: ConversionResult): string {
  return result.files.find((file) => file.path === 'README.md')?.content ?? '';
}

describe('convertSql · de script a ficheros', () => {
  it('Oracle con los seis criterios de US-01: clases, claves compuestas y README', async () => {
    const result = convertSql(oracleUs01Sql);

    expect(result.dialect).toEqual({ dialect: 'oracle', source: 'detected' });
    expect(result.diagnostics).toEqual([]);
    expect(result.files.map((file) => file.path)).toEqual([
      'src/main/java/com/example/entity/Product.java',
      'src/main/java/com/example/entity/Customer.java',
      'src/main/java/com/example/entity/PurchaseOrder.java',
      'src/main/java/com/example/entity/CustomerSetting.java',
      'src/main/java/com/example/entity/CustomerProfile.java',
      'src/main/java/com/example/entity/Tag.java',
      'src/main/java/com/example/entity/OrderLine.java',
      'src/main/java/com/example/entity/OrderLineId.java',
      'src/main/java/com/example/entity/Warehouse.java',
      'src/main/java/com/example/entity/WarehouseId.java',
      'src/main/java/com/example/entity/StockItem.java',
      'src/main/java/com/example/entity/StockItemId.java',
      'README.md',
    ]);
    expect(result.files.every((file) => file.language === (file.path.endsWith('.java') ? 'java' : 'markdown'))).toBe(true);
    // El README del pipeline es exactamente el golden file del generador.
    await expect(readmeOf(result)).toMatchFileSnapshot('../../core/generators/jpa/__golden__/oracle-us01/README.md');
  });

  it('los diagnósticos se acumulan en orden (análisis, inferencia, generación) y todos llegan al README', () => {
    const result = convertSql(postgresDumpSql);
    const readme = readmeOf(result);
    const stages = result.diagnostics.map((diagnostic) => diagnostic.stage);

    expect(result.schema).not.toBeNull();
    expect(stages).toEqual([...stages].sort((a, b) => ['parser', 'inference', 'generator'].indexOf(a) - ['parser', 'inference', 'generator'].indexOf(b)));
    expect(stages).toContain('parser');
    expect(stages).toContain('generator');
    expect(result.diagnostics.filter((diagnostic) => diagnostic.stage === 'generator').map((d) => d.code)).toEqual([
      JPA_DIAGNOSTICS.unmappedType,
      JPA_DIAGNOSTICS.unmappedType,
    ]);

    expect(readme).toContain(`${result.diagnostics.length} aviso(s) y 0 error(es).`);
    let cursor = 0;
    for (const diagnostic of result.diagnostics) {
      const found = readme.indexOf(diagnostic.message, cursor);
      expect(found, `falta en el README: ${diagnostic.message}`).toBeGreaterThan(-1);
      cursor = found;
    }
  });

  it('script con errores: no se genera nada y se devuelven los errores', () => {
    const result = convertSql("CREATE TABLE a (name VARCHAR(10) DEFAULT 'sin cerrar);");

    expect(result.schema).toBeNull();
    expect(result.files).toEqual([]);
    expect(result.diagnostics).toMatchObject([{ severity: 'error', code: PARSER_DIAGNOSTICS.unterminatedString }]);
  });

  it('script vacío: nada que generar y ningún diagnóstico', () => {
    expect(convertSql('  \n ')).toEqual<ConversionResult>({
      dialect: { dialect: null, source: 'detected' },
      schema: null,
      files: [],
      diagnostics: [],
    });
  });

  it('avisos de inferencia en el README (FK hacia sus propias columnas)', () => {
    const result = convertSql('CREATE TABLE node (id INT PRIMARY KEY REFERENCES node (id));', { ...DEFAULT_CONVERSION_SETTINGS, dialect: 'postgresql' });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([INFERENCE_DIAGNOSTICS.selfReferencingKey]);
    expect(readmeOf(result)).toContain('| Inferencia | Aviso | `inference.self-referencing-key` |');
  });
});

describe('convertSql · configuración', () => {
  it('generar sin tocar nada usa las opciones por defecto del generador', () => {
    expect(DEFAULT_CONVERSION_SETTINGS).toEqual({ options: JPA_DEFAULT_OPTIONS });
  });

  it('el dialecto indicado manualmente llega al README', () => {
    const script = 'CREATE TABLE a (id INTEGER PRIMARY KEY, name VARCHAR(20));';

    expect(readmeOf(convertSql(script))).toContain('| Dialecto SQL | No detectado (se han aplicado reglas genéricas) |');
    expect(readmeOf(convertSql(script, { ...DEFAULT_CONVERSION_SETTINGS, dialect: 'postgresql' }))).toContain(
      '| Dialecto SQL | PostgreSQL (indicado manualmente) |',
    );
  });

  it('cambiar las opciones cambia la salida sin tocar el script (paquete, nombres, Lombok)', () => {
    const result = convertSql(mysqlDumpSql, {
      options: {
        ...JPA_DEFAULT_OPTIONS,
        basePackage: 'org.acme.catalog',
        useLombok: true,
        classNaming: { number: 'plural', case: 'pascal' },
      },
    });

    expect(result.files.map((file) => file.path)).toEqual([
      'src/main/java/org/acme/catalog/Categorys.java',
      'src/main/java/org/acme/catalog/Products.java',
      'README.md',
    ]);
    expect(result.files[0]?.content.startsWith('package org.acme.catalog;\n')).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(JPA_DIAGNOSTICS.lombokNotSupported);
    expect(readmeOf(result)).toContain('| Nombres de clase | Plural, PascalCase |');
  });
});

describe('convertSql · requisitos no funcionales', () => {
  it('es determinista y su resultado es serializable (Web Worker)', () => {
    const result = convertSql(oracleUs01Sql);

    expect(convertSql(oracleUs01Sql)).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('análisis + generación de 100 tablas en menos de 2 segundos', () => {
    const script = Array.from(
      { length: 100 },
      (_, i) =>
        `CREATE TABLE t${i} (\n  id BIGINT AUTO_INCREMENT PRIMARY KEY,\n${Array.from({ length: 12 }, (_, c) => `  c${c} VARCHAR(100) NOT NULL,`).join('\n')}\n  parent_id BIGINT${i > 0 ? ` REFERENCES t${i - 1} (id)` : ''}\n) ENGINE=InnoDB;`,
    ).join('\n');

    const start = performance.now();
    const result = convertSql(script);
    const elapsed = performance.now() - start;

    expect(result.files).toHaveLength(101);
    expect(elapsed).toBeLessThan(2000);
  });
});
