import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTotal, inventoryInput, saleInput } from './index';

test('calcula importes enteros sin redondeos de coma flotante', () => {
  assert.equal(calculateTotal([{ quantity: 3, unitPriceCents: 1999 }, { quantity: 1, unitPriceCents: 50 }]), 6047);
});
test('rechaza productos duplicados en una venta', () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(saleInput.safeParse({ customerName: 'Cliente', items: [{ productId: id, quantity: 1 }, { productId: id, quantity: 2 }] }).success, false);
});
test('rechaza movimientos sin cambio', () => {
  assert.equal(inventoryInput.safeParse({ delta: 0, note: 'Sin cambio' }).success, false);
});
