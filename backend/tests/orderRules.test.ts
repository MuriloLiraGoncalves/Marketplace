import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus } from '@prisma/client';
import { canTransitionOrder, lineSubtotal } from '../src/services/orderRules.js';

test('allows the normal order status flow', () => {
  assert.equal(canTransitionOrder(OrderStatus.PENDENTE, OrderStatus.CONFIRMADO), true);
  assert.equal(canTransitionOrder(OrderStatus.CONFIRMADO, OrderStatus.ENVIADO), true);
  assert.equal(canTransitionOrder(OrderStatus.ENVIADO, OrderStatus.ENTREGUE), true);
});

test('rejects skipping and reopening terminal statuses', () => {
  assert.equal(canTransitionOrder(OrderStatus.PENDENTE, OrderStatus.ENVIADO), false);
  assert.equal(canTransitionOrder(OrderStatus.ENTREGUE, OrderStatus.CANCELADO), false);
  assert.equal(canTransitionOrder(OrderStatus.CANCELADO, OrderStatus.CONFIRMADO), false);
});

test('calculates exact cent-based subtotals', () => {
  assert.equal(lineSubtotal(33570, 3), 100710);
  assert.throws(() => lineSubtotal(-1, 1), /Preço inválido/);
  assert.throws(() => lineSubtotal(100, 0), /Quantidade inválida/);
});
