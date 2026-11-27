import { useQuery } from '../lib/query';
import { mockOrdersApi } from './mock';
import type { OrdersApi } from './types';

export const ordersApi: OrdersApi = mockOrdersApi;

export const orderKeys = {
  all: ['orders'] as const,
  list: ['orders', 'list'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  history: (id: string) => ['orders', 'history', id] as const,
};

export const useOrders = () => useQuery(orderKeys.list, () => ordersApi.list());
export const useOrder = (id: string) => useQuery(orderKeys.detail(id), () => ordersApi.get(id));
export const useOrderHistory = (id: string) => useQuery(orderKeys.history(id), () => ordersApi.history(id));
