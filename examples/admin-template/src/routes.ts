import type { RouteDef } from './lib/router';
import { NewOrderPage } from './pages/new-order';
import { NotFoundPage } from './pages/not-found';
import { OrderDetailPage } from './pages/order-detail';
import { OrdersPage } from './pages/orders';

export const routes: readonly RouteDef[] = [
  { id: 'index', path: '/', redirect: '/workspace/orders' },
  {
    id: 'orders',
    path: '/workspace/orders',
    component: OrdersPage,
    meta: { title: '訂單管理', breadcrumbs: ['工作區', '訂單管理'] },
    children: [
      { id: 'new-order', path: 'new', component: NewOrderPage, meta: { title: '新增訂單', breadcrumbs: ['工作區', '訂單管理', '新增訂單'] } },
      { id: 'order-detail', path: ':orderId', component: OrderDetailPage, meta: { title: '訂單明細', breadcrumbs: ['工作區', '訂單管理', '訂單明細'] } },
    ],
  },
  { id: 'not-found', path: '*', component: NotFoundPage, meta: { title: '找不到頁面', breadcrumbs: ['找不到頁面'] } },
];
