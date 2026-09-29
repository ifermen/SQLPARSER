import { describe, expect, it } from 'vitest';
import type { Column, Diagnostic, Table } from '@/core/model';
import oracleFeaturesSql from './__fixtures__/oracle-features.sql?raw';
import oracleSqlDeveloperSql from './__fixtures__/oracle-sqldeveloper.sql?raw';
import oracleUs01Sql from './__fixtures__/oracle-us01.sql?raw';
import { PARSER_DIAGNOSTICS, parseSql, type ParseResult } from './index';

function tableOf(result: ParseResult, name: string): Table {
  const table = result.schema?.tables.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`La tabla "${name}" no está en el esquema`);
  return table;
}

function columnOf(table: Table, name: string): Column {
  const column = table.columns.find((candidate) => candidate.name === name);
  if (!column) throw new Error(`La columna "${name}" no está en la tabla "${table.name}"`);
  return column;
}

function codesOf(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

describe('parseSql · Oracle · criterios de aceptación de US-01', () => {
  const result = parseSql(oracleUs01Sql);

  it('detecta Oracle y analiza el script sin diagnósticos', () => {
    expect(result.dialect).toEqual({ dialect: 'oracle', source: 'detected' });
    expect(result.diagnostics).toEqual([]);
    expect(result.schema?.dialect).toBe('oracle');
  });

  it('criterio 1: tabla sin relaciones con tipos de Oracle', () => {
    expect(tableOf(result, 'product')).toEqual<Table>({
      name: 'product',
      comment: 'Productos del catálogo',
      columns: [
        {
          name: 'id',
          type: { raw: 'NUMBER(19)', name: 'NUMBER', logical: 'bigint' },
          nullable: false,
          autoIncrement: true,
        },
        {
          name: 'sku',
          type: { raw: 'VARCHAR2(32 CHAR)', name: 'VARCHAR2', logical: 'string', length: 32 },
          nullable: false,
          autoIncrement: false,
          // Literal alternativo q'[…]' con paréntesis dentro.
          comment: 'Código interno (no se reutiliza)',
        },
        {
          name: 'name',
          type: { raw: 'VARCHAR2(255)', name: 'VARCHAR2', logical: 'string', length: 255 },
          nullable: false,
          autoIncrement: false,
        },
        {
          name: 'description',
          type: { raw: 'CLOB', name: 'CLOB', logical: 'text' },
          nullable: true,
          autoIncrement: false,
        },
        {
          name: 'price',
          type: { raw: 'NUMBER(10,2)', name: 'NUMBER', logical: 'decimal', precision: 10, scale: 2 },
          nullable: false,
          autoIncrement: false,
          defaultValue: '0',
        },
        {
          name: 'active',
          type: { raw: 'NUMBER(1)', name: 'NUMBER', logical: 'boolean' },
          nullable: false,
          autoIncrement: false,
          defaultValue: '1',
        },
        {
          name: 'created_at',
          type: {
            raw: 'TIMESTAMP(6) WITH TIME ZONE',
            name: 'TIMESTAMP WITH TIME ZONE',
            logical: 'datetime-tz',
          },
          nullable: false,
          autoIncrement: false,
          defaultValue: 'SYSTIMESTAMP',
        },
      ],
      primaryKey: { name: 'product_pk', columns: ['id'] },
      foreignKeys: [],
      uniqueConstraints: [{ name: 'product_sku_uk', columns: ['sku'] }],
    });
  });

  it('criterio 2: FK entre dos tablas; DATE de Oracle incluye la hora', () => {
    const order = tableOf(result, 'purchase_order');

    expect(order.foreignKeys).toEqual([
      {
        name: 'order_customer_fk',
        columns: ['customer_id'],
        referencedTable: 'customer',
        referencedColumns: ['id'],
      },
    ]);
    expect(columnOf(order, 'ordered_on')).toEqual<Column>({
      name: 'ordered_on',
      type: { raw: 'DATE', name: 'DATE', logical: 'datetime' },
      nullable: false,
      autoIncrement: false,
      defaultValue: 'SYSDATE',
    });
  });

  it('criterio 3: uno a uno por FK única (restricciones en línea con nombre) y por PK compartida', () => {
    const settings = tableOf(result, 'customer_settings');
    expect(settings.uniqueConstraints).toEqual([{ columns: ['customer_id'] }]);
    expect(settings.foreignKeys).toEqual([
      {
        name: 'settings_customer_fk',
        columns: ['customer_id'],
        referencedTable: 'customer',
        referencedColumns: ['id'],
      },
    ]);

    const profile = tableOf(result, 'customer_profile');
    expect(profile.primaryKey).toEqual({ columns: ['customer_id'] });
    expect(profile.foreignKeys).toEqual([
      { columns: ['customer_id'], referencedTable: 'customer', referencedColumns: ['id'] },
    ]);
  });

  it('criterio 4: tabla intermedia pura (ORGANIZATION INDEX)', () => {
    const productTag = tableOf(result, 'product_tag');

    expect(productTag.columns.map((column) => column.name)).toEqual(['product_id', 'tag_id']);
    expect(productTag.primaryKey).toEqual({ name: 'product_tag_pk', columns: ['product_id', 'tag_id'] });
    expect(productTag.foreignKeys).toEqual([
      { columns: ['product_id'], referencedTable: 'product', referencedColumns: ['id'] },
      { columns: ['tag_id'], referencedTable: 'tag', referencedColumns: ['id'] },
    ]);
  });

  it('criterio 5: tabla intermedia con atributos propios', () => {
    const orderLine = tableOf(result, 'order_line');

    expect(orderLine.primaryKey).toEqual({ name: 'order_line_pk', columns: ['order_id', 'product_id'] });
    expect(orderLine.foreignKeys.map((foreignKey) => foreignKey.referencedTable)).toEqual([
      'purchase_order',
      'product',
    ]);
    expect(orderLine.columns.map((column) => [column.name, column.type.logical])).toEqual([
      ['order_id', 'integer'],
      ['product_id', 'bigint'],
      ['quantity', 'smallint'],
      ['unit_price', 'decimal'],
    ]);
  });

  it('criterio 6: PK compuesta referenciada por una FK compuesta', () => {
    const stockItem = tableOf(result, 'stock_item');

    expect(stockItem.primaryKey).toEqual({
      name: 'stock_item_pk',
      columns: ['country_code', 'warehouse_code', 'product_id'],
    });
    expect(stockItem.foreignKeys).toEqual([
      {
        name: 'stock_warehouse_fk',
        columns: ['country_code', 'warehouse_code'],
        referencedTable: 'warehouse',
        referencedColumns: ['country_code', 'code'],
      },
    ]);
    // CHAR(2 BYTE): la semántica de longitud no impide leer la longitud.
    expect(columnOf(stockItem, 'country_code').type).toEqual({
      raw: 'CHAR(2 BYTE)',
      name: 'CHAR',
      logical: 'string',
      length: 2,
    });
    // NUMBER(*,0) es la forma en que Oracle define INTEGER.
    expect(columnOf(stockItem, 'quantity').type.logical).toBe('integer');
  });
});

describe('parseSql · Oracle · exportación de SQL Developer', () => {
  const result = parseSql(oracleSqlDeveloperSql);

  it('omite los comandos de SQL*Plus y avisa solo del trigger que no es de autoincremento', () => {
    expect(result.dialect).toEqual({ dialect: 'oracle', source: 'detected' });
    expect(result.schema?.tables.map((table) => table.name)).toEqual(['DEPARTMENTS', 'EMPLOYEES']);
    expect(result.diagnostics).toMatchObject([
      {
        severity: 'warning',
        code: PARSER_DIAGNOSTICS.unsupportedStatement,
        position: { line: 91, column: 3 },
        fragment: expect.stringContaining('TRIGGER "HR"."SECURE_EMPLOYEES"'),
      },
    ]);
  });

  it('aplica las restricciones exportadas como ALTER TABLE (MODIFY … NOT NULL, PK, UNIQUE, FK)', () => {
    const employees = tableOf(result, 'EMPLOYEES');

    expect(employees.primaryKey).toEqual({ name: 'EMP_EMP_ID_PK', columns: ['EMPLOYEE_ID'] });
    // El índice único y la restricción EMP_EMAIL_UK son la misma; el índice de la PK no se duplica.
    expect(employees.uniqueConstraints).toEqual([{ name: 'EMP_EMAIL_UK', columns: ['EMAIL'] }]);
    expect(employees.foreignKeys).toEqual([
      {
        name: 'EMP_DEPT_FK',
        columns: ['DEPARTMENT_ID'],
        referencedTable: 'DEPARTMENTS',
        referencedColumns: ['DEPARTMENT_ID'],
      },
      {
        name: 'EMP_MANAGER_FK',
        columns: ['MANAGER_ID'],
        referencedTable: 'EMPLOYEES',
        referencedColumns: ['EMPLOYEE_ID'],
      },
    ]);
    // `MODIFY ("EMAIL" CONSTRAINT … NOT NULL ENABLE)` solo cambia la nulabilidad.
    expect(columnOf(employees, 'EMAIL')).toEqual<Column>({
      name: 'EMAIL',
      type: { raw: 'VARCHAR2(25 BYTE)', name: 'VARCHAR2', logical: 'string', length: 25 },
      nullable: false,
      autoIncrement: false,
    });
    expect(columnOf(employees, 'LAST_NAME').nullable).toBe(false);
    expect(columnOf(employees, 'FIRST_NAME').nullable).toBe(true);
  });

  it('reconoce el autoincremento por secuencia + trigger BEFORE INSERT', () => {
    expect(columnOf(tableOf(result, 'EMPLOYEES'), 'EMPLOYEE_ID').autoIncrement).toBe(true);
  });

  it('mapea NUMBER según precisión y escala, y admite # en los identificadores', () => {
    const employees = tableOf(result, 'EMPLOYEES');

    expect(
      employees.columns.map((column) => [column.name, column.type.logical, column.type.precision, column.type.scale]),
    ).toEqual([
      ['EMPLOYEE_ID', 'integer', undefined, undefined],
      ['FIRST_NAME', 'string', undefined, undefined],
      ['LAST_NAME', 'string', undefined, undefined],
      ['EMAIL', 'string', undefined, undefined],
      ['HIRE_DATE', 'datetime', undefined, undefined],
      ['SALARY', 'decimal', 8, 2],
      ['COMMISSION_PCT', 'decimal', 2, 2],
      ['MANAGER_ID', 'integer', undefined, undefined],
      ['DEPARTMENT_ID', 'smallint', undefined, undefined],
      ['BADGE#', 'string', undefined, undefined],
    ]);
  });

  it('lee COMMENT ON con nombres entrecomillados y cualificados con esquema', () => {
    const departments = tableOf(result, 'DEPARTMENTS');

    expect(departments.comment).toBe(
      'Departments table that shows details of departments where employees work.',
    );
    expect(columnOf(departments, 'DEPARTMENT_NAME')).toMatchObject({
      nullable: false,
      comment: 'A not null column that shows name of a department.',
    });
    expect(departments.foreignKeys).toEqual([
      {
        name: 'DEPT_MGR_FK',
        columns: ['MANAGER_ID'],
        referencedTable: 'EMPLOYEES',
        referencedColumns: ['EMPLOYEE_ID'],
      },
    ]);
  });
});

describe('parseSql · Oracle · tipos, secuencias, SQL*Plus y PL/SQL', () => {
  const result = parseSql(oracleFeaturesSql);

  it('avisa del tipo INTERVAL, del paquete PL/SQL y del CREATE TABLE dinámico', () => {
    expect(result.dialect).toEqual({ dialect: 'oracle', source: 'detected' });
    expect(result.schema?.tables.map((table) => table.name)).toEqual(['audit_log', 'legacy_customer']);
    expect(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.position?.line, diagnostic.location]),
    ).toEqual([
      [PARSER_DIAGNOSTICS.unknownColumnType, 28, { table: 'audit_log', column: 'retention' }],
      [PARSER_DIAGNOSTICS.unsupportedStatement, 66, undefined], // CREATE PACKAGE
      [PARSER_DIAGNOSTICS.unsupportedStatement, 76, undefined], // EXECUTE IMMEDIATE 'CREATE TABLE …'
    ]);
  });

  it('mapea los tipos propios de Oracle', () => {
    const auditLog = tableOf(result, 'audit_log');

    expect(auditLog.columns.map((column) => [column.name, column.type.name, column.type.logical])).toEqual([
      ['id', 'NUMBER', 'bigint'],
      ['order#', 'NUMBER', 'integer'],
      ['event_type', 'VARCHAR2', 'string'],
      ['payload', 'CLOB', 'text'],
      ['attachment', 'BLOB', 'binary'],
      ['checksum', 'RAW', 'binary'],
      ['legacy_blob', 'LONG RAW', 'binary'],
      ['ratio', 'BINARY_DOUBLE', 'double'],
      ['score', 'FLOAT', 'double'],
      ['logged_at', 'TIMESTAMP WITH LOCAL TIME ZONE', 'datetime-tz'],
      ['logged_on', 'DATE', 'datetime'],
      ['retention', 'INTERVAL DAY TO SECOND', 'unknown'],
      ['row_ref', 'UROWID', 'string'],
      ['metadata', 'SYS.XMLTYPE', 'text'],
    ]);
    expect(columnOf(auditLog, 'retention').type.raw).toBe('INTERVAL DAY(3) TO SECOND(0)');
    expect(columnOf(auditLog, 'checksum').type.length).toBe(16);
  });

  it('DEFAULT secuencia.NEXTVAL es autoincremento y DEFAULT ON NULL conserva el valor', () => {
    const auditLog = tableOf(result, 'audit_log');

    expect(columnOf(auditLog, 'id')).toMatchObject({
      autoIncrement: true,
      defaultValue: 'audit_log_seq.NEXTVAL',
      nullable: false,
    });
    expect(columnOf(auditLog, 'event_type').defaultValue).toBe("'UNKNOWN'");
  });

  it('interpreta el trigger con :new.col := secuencia.NEXTVAL', () => {
    expect(columnOf(tableOf(result, 'legacy_customer'), 'customer_id').autoIncrement).toBe(true);
  });

  it('aplica ADD (…) con columnas y restricciones, y MODIFY parcial con y sin paréntesis', () => {
    const customer = tableOf(result, 'legacy_customer');

    expect(customer.columns.map((column) => column.name)).toEqual([
      'customer_id',
      'full_name',
      'vip',
      'email',
      'created_by',
    ]);
    expect(customer.uniqueConstraints).toEqual([{ name: 'legacy_customer_email_uk', columns: ['email'] }]);
    expect(customer.foreignKeys).toEqual([
      {
        name: 'legacy_customer_creator_fk',
        columns: ['created_by'],
        referencedTable: 'audit_log',
        referencedColumns: ['id'],
      },
    ]);

    // MODIFY (full_name NOT NULL, …): cambia la nulabilidad y conserva el tipo.
    expect(columnOf(customer, 'full_name')).toEqual<Column>({
      name: 'full_name',
      type: { raw: 'NVARCHAR2(100)', name: 'NVARCHAR2', logical: 'string', length: 100 },
      nullable: false,
      autoIncrement: false,
      comment: "Nombre completo; puede contener 'comillas'",
    });
    // MODIFY (…, vip DEFAULT 'Y'): cambia el valor por defecto y conserva la nulabilidad.
    expect(columnOf(customer, 'vip')).toMatchObject({ defaultValue: "'Y'", nullable: true });
    // MODIFY email VARCHAR2(500): cambia el tipo.
    expect(columnOf(customer, 'email').type.length).toBe(500);
  });
});

describe('parseSql · Oracle · sintaxis y errores', () => {
  it('una sentencia terminada solo con / en su línea', () => {
    const result = parseSql('CREATE TABLE a (id NUMBER(10) PRIMARY KEY)\n/\nCREATE TABLE b (id NUMBER(10))\n/', {
      dialect: 'oracle',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.schema?.tables.map((table) => table.name)).toEqual(['a', 'b']);
  });

  it('el literal q-quote sin cerrar es un error', () => {
    const result = parseSql("CREATE TABLE a (id NUMBER);\nCOMMENT ON TABLE a IS q'[sin cerrar';", {
      dialect: 'oracle',
    });

    expect(result.schema).toBeNull();
    expect(result.diagnostics).toMatchObject([
      { severity: 'error', code: PARSER_DIAGNOSTICS.unterminatedString, position: { line: 2, column: 23 } },
    ]);
  });

  it('en Oracle # es parte del identificador; en MySQL, un comentario', () => {
    const sql = 'CREATE TABLE t (id NUMBER(10), order# NUMBER(10));';

    expect(tableOf(parseSql(sql, { dialect: 'oracle' }), 't').columns.map((column) => column.name)).toEqual([
      'id',
      'order#',
    ]);
    // En MySQL todo lo que sigue a # es comentario: el paréntesis queda sin cerrar.
    expect(codesOf(parseSql(sql, { dialect: 'mysql' }).diagnostics)).toEqual([
      PARSER_DIAGNOSTICS.unbalancedParentheses,
    ]);
  });

  it('un script genérico con tipos de Oracle se detecta como Oracle aunque use WITH TIME ZONE y COMMENT ON', () => {
    const result = parseSql(
      "CREATE TABLE ev (id NUMBER(10), at TIMESTAMP WITH TIME ZONE);\nCOMMENT ON TABLE ev IS 'Eventos';",
    );

    expect(result.dialect).toEqual({ dialect: 'oracle', source: 'detected' });
  });
});
