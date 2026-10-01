import { describe, expect, it } from 'vitest';
import { capitalize, decapitalize, splitWords, toCamelCase, toPascalCase } from './naming';

describe('splitWords', () => {
  it.each([
    ['purchase_order', ['purchase', 'order']],
    ['DEPARTMENT_ID', ['department', 'id']],
    ['OrderLine', ['order', 'line']],
    ['customerId', ['customer', 'id']],
    ['XMLData', ['xml', 'data']],
    ['ORDER#', ['order']],
    ['Order Line', ['order', 'line']],
    ['line-2-total', ['line', '2', 'total']],
    ['__private__', ['private']],
    ['año_fiscal', ['año', 'fiscal']],
    ['', []],
  ])('%s → %j', (input, expected) => {
    expect(splitWords(input)).toEqual(expected);
  });
});

describe('toPascalCase y toCamelCase', () => {
  it.each([
    ['purchase_order', 'PurchaseOrder', 'purchaseOrder'],
    ['EMPLOYEES', 'Employees', 'employees'],
    ['DEPARTMENT_ID', 'DepartmentId', 'departmentId'],
    ['customerId', 'CustomerId', 'customerId'],
    ['OrderLine', 'OrderLine', 'orderLine'],
    ['BADGE#', 'Badge', 'badge'],
    ['x', 'X', 'x'],
  ])('%s → %s / %s', (input, pascal, camel) => {
    expect(toPascalCase(input)).toBe(pascal);
    expect(toCamelCase(input)).toBe(camel);
  });

  it('capitalize y decapitalize solo tocan la primera letra', () => {
    expect(capitalize('orderLine')).toBe('OrderLine');
    expect(decapitalize('OrderLine')).toBe('orderLine');
    expect(capitalize('')).toBe('');
  });
});
