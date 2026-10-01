import { describe, expect, it } from 'vitest';
import { pluralize, singularize } from './inflection';

describe('singularize: quita una s final', () => {
  it.each([
    ['users', 'user'],
    ['EMPLOYEES', 'EMPLOYEE'],
    ['purchase_orders', 'purchase_order'],
    ['customer', 'customer'],
    // Regla simple a propósito: sin ortografía.
    ['categories', 'categorie'],
    ['status', 'statu'],
    ['s', 's'],
  ])('%s → %s', (input, expected) => {
    expect(singularize(input)).toBe(expected);
  });
});

describe('pluralize: pone una s final', () => {
  it.each([
    ['user', 'users'],
    ['purchaseOrder', 'purchaseOrders'],
    ['USER', 'USERS'],
    ['category', 'categorys'],
  ])('%s → %s', (input, expected) => {
    expect(pluralize(input)).toBe(expected);
  });

  it('singular y plural son inversos para los nombres que ya terminan en s', () => {
    expect(pluralize(singularize('address'))).toBe('address');
  });
});
