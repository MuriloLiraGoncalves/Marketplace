import { OrderStatus } from '@prisma/client';

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDENTE: [OrderStatus.CONFIRMADO, OrderStatus.CANCELADO],
  CONFIRMADO: [OrderStatus.ENVIADO, OrderStatus.CANCELADO],
  ENVIADO: [OrderStatus.ENTREGUE],
  ENTREGUE: [],
  CANCELADO: [],
};

export function canTransitionOrder(current: OrderStatus, next: OrderStatus): boolean {
  return transitions[current].includes(next);
}

export function lineSubtotal(unitPriceCents: number, quantity: number): number {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) throw new Error('Preço inválido');
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantidade inválida');
  const subtotal = unitPriceCents * quantity;
  if (!Number.isSafeInteger(subtotal)) throw new Error('Subtotal fora do limite');
  return subtotal;
}
