import { orderData } from './seed';
import type { OrderAuditEvent, OrderEditValues, OrderRecord, OrdersApi } from './types';
import { editableOrderFields, formatEditValue } from '../lib/order-display';

// The demo data lives in memory only; a real backend replaces the adapter in index.ts.
const orders = new Map(orderData.map((order) => [order.id, structuredClone(order)]));
let nextOrderNumber = Math.max(...orderData.map((order) => Number(order.id.slice(4)))) + 1;
const histories = new Map<string, OrderAuditEvent[]>(
  orderData.map((order) => [
    order.id,
    [
      {
        id: crypto.randomUUID(),
        occurredAt: order.updatedAt,
        action: 'update',
        actor: order.owner,
        changes: [
          { key: 'status', field: '狀態', before: order.status === 'pending' ? '已付款' : '待處理', after: formatEditValue('status', order.status) },
          { key: 'owner', field: '負責人', before: '未指派', after: order.owner },
        ],
      },
      createEvent(order, '系統'),
    ],
  ]),
);

function createEvent(order: OrderRecord, actor: string): OrderAuditEvent {
  return {
    id: crypto.randomUUID(),
    occurredAt: order.createdAt,
    action: 'create',
    actor,
    changes: editableOrderFields.map(({ key, label }) => ({ key, field: label, before: '空白', after: formatEditValue(key, order[key]) })),
  };
}

function findOrder(id: string): OrderRecord {
  const order = orders.get(id);
  if (!order) throw new Error('找不到訂單');
  return order;
}

/** A short network-like delay, so loading states are visible. */
const latency = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 120));

export const mockOrdersApi: OrdersApi = {
  async list() {
    await latency();
    return structuredClone([...orders.values()].sort((a, b) => b.id.localeCompare(a.id)));
  },
  async get(id) {
    await latency();
    return structuredClone(orders.get(id) ?? null);
  },
  async create(values) {
    await latency();
    const now = new Date().toISOString();
    const order: OrderRecord = { ...values, id: `ORD-${String(nextOrderNumber++).padStart(5, '0')}`, createdAt: now, updatedAt: now };
    orders.set(order.id, order);
    histories.set(order.id, [createEvent(order, 'Olivia')]);
    return structuredClone(order);
  },
  async update(id, values: OrderEditValues) {
    await latency();
    const previous = findOrder(id);
    const order = { ...previous, ...values, updatedAt: new Date().toISOString() };
    const changes = editableOrderFields.flatMap(({ key, label }) => {
      const before = formatEditValue(key, previous[key]);
      const after = formatEditValue(key, order[key]);
      return before === after ? [] : [{ key, field: label, before, after }];
    });
    orders.set(id, order);
    histories.set(id, [{ id: crypto.randomUUID(), occurredAt: order.updatedAt, action: 'update', actor: 'Olivia', changes }, ...(histories.get(id) ?? [])]);
    return structuredClone(order);
  },
  async remove(id) {
    await latency();
    findOrder(id);
    orders.delete(id);
    histories.delete(id);
  },
  async history(id) {
    await latency();
    findOrder(id);
    return structuredClone(histories.get(id) ?? []);
  },
};
