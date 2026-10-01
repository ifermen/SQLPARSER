import { describe, expect, it } from 'vitest';
import {
  foreignKeyDiscriminator,
  isValidEnumConstant,
  isValidPackageName,
  javadocText,
  javaString,
  physicalName,
  pluralFieldName,
  singularFieldName,
  toClassName,
  toFieldName,
  toJavaIdentifier,
  toNestedTypeName,
} from './javaNames';

const DEFAULT_NAMING = { number: 'singular', case: 'pascal' } as const;

describe('toClassName', () => {
  it.each([
    ['purchase_order', 'PurchaseOrder'],
    ['purchase_orders', 'PurchaseOrder'],
    ['users', 'User'],
    ['EMPLOYEES', 'Employee'],
    ['Order Line', 'OrderLine'],
    ['2fa_codes', '_2faCode'],
    // Tipos que usa el código generado: se añade el sufijo Entity.
    ['table', 'TableEntity'],
    ['lists', 'ListEntity'],
    ['objects', 'ObjectEntity'],
    // Palabras reservadas de Java: se detectan antes del singular y se añade Entity.
    ['class', 'ClassEntity'],
    ['CLASS', 'ClassEntity'],
    ['extends', 'ExtendsEntity'],
    ['package', 'PackageEntity'],
    // Solo si el nombre completo es la palabra reservada.
    ['classes', 'Classe'],
    ['class_room', 'ClassRoom'],
  ])('%s → %s (singular, PascalCase)', (table, expected) => {
    expect(toClassName(table, DEFAULT_NAMING)).toBe(expected);
  });

  it.each([
    [{ number: 'plural', case: 'pascal' } as const, 'user', 'Users'],
    [{ number: 'plural', case: 'pascal' } as const, 'users', 'Users'],
    [{ number: 'as-is', case: 'pascal' } as const, 'users', 'Users'],
    [{ number: 'singular', case: 'as-is' } as const, 'purchase_orders', 'purchase_order'],
    [{ number: 'as-is', case: 'as-is' } as const, 'Order Line', 'Order_Line'],
    [{ number: 'plural', case: 'pascal' } as const, 'class', 'ClassEntity'],
    [{ number: 'as-is', case: 'as-is' } as const, 'class', 'classEntity'],
  ])('respeta la estrategia de nombres %j', (naming, table, expected) => {
    expect(toClassName(table, naming)).toBe(expected);
  });
});

describe('nombres de campo', () => {
  it.each([
    ['customer_id', 'customerId'],
    ['DEPARTMENT_ID', 'departmentId'],
    ['BADGE#', 'badge'],
    ['class', 'class_'],
    ['default', 'default_'],
    ['1st_line', '_1stLine'],
    ['###', 'field'],
  ])('toFieldName(%s) → %s', (column, expected) => {
    expect(toFieldName(column)).toBe(expected);
  });

  it('las relaciones usan la tabla en singular o en plural', () => {
    expect(singularFieldName('users')).toBe('user');
    expect(singularFieldName('PURCHASE_ORDERS')).toBe('purchaseOrder');
    expect(pluralFieldName('purchase_order')).toBe('purchaseOrders');
    expect(pluralFieldName('users')).toBe('users');
    expect(pluralFieldName('EMPLOYEES')).toBe('employees');
  });

  it.each([
    [['created_by'], 'CreatedBy'],
    [['author_id'], 'Author'],
    [['AUTHOR_ID'], 'Author'],
    [['authorId'], 'Author'],
    [['paid'], 'Paid'],
    [['PAID'], 'Paid'],
    [['id'], 'Id'],
    [['country_code', 'warehouse_code'], 'CountryCodeWarehouseCode'],
  ])('foreignKeyDiscriminator(%j) → %s', (columns, expected) => {
    expect(foreignKeyDiscriminator(columns)).toBe(expected);
  });

  it('toJavaIdentifier sanea cualquier texto', () => {
    expect(toJavaIdentifier('a-b c', 'x')).toBe('a_b_c');
    expect(toJavaIdentifier('', 'fallback')).toBe('fallback');
    expect(toJavaIdentifier('record', 'x')).toBe('record_');
  });

  it('los enum anidados no pueden llamarse como su clase ni como un tipo usado', () => {
    expect(toNestedTypeName('status', 'Order')).toBe('Status');
    expect(toNestedTypeName('status', 'Status')).toBe('StatusType');
    expect(toNestedTypeName('list', 'Order')).toBe('ListType');
  });
});

describe('validaciones y literales', () => {
  it.each([
    ['NEW', true],
    ['in_progress', true],
    ['in progress', false],
    ['1st', false],
    ['class', false],
    ['', false],
  ])('isValidEnumConstant(%j) → %s', (value, expected) => {
    expect(isValidEnumConstant(value)).toBe(expected);
  });

  it.each([
    ['com.example.entity', true],
    ['', true],
    ['entity', true],
    ['com.1example', false],
    ['com.class.entity', false],
    ['com..entity', false],
    ['com.example-app', false],
  ])('isValidPackageName(%j) → %s', (name, expected) => {
    expect(isValidPackageName(name)).toBe(expected);
  });

  it('javaString escapa comillas y barras', () => {
    expect(javaString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it('physicalName cita los nombres que no son identificadores simples', () => {
    expect(physicalName('purchase_order')).toBe('"purchase_order"');
    expect(physicalName('BADGE#')).toBe('"BADGE#"');
    expect(physicalName('Order Line')).toBe('"\\"Order Line\\""');
  });

  it('javadocText no puede cerrar el comentario ni ocupar varias líneas', () => {
    expect(javadocText('fin */ del\ncomentario')).toBe('fin *&#47; del comentario');
  });
});
