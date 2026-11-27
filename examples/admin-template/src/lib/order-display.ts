import type { OrderAuditChange, OrderEditValues, OrderRecord, OrderStatus } from '../api/types';

export const statusMeta: Record<OrderStatus, { label: string; tone: 'success' | 'primary' | 'neutral' | 'danger' }> = {
  paid: { label: '已付款', tone: 'success' },
  pending: { label: '待處理', tone: 'primary' },
  refunded: { label: '已退款', tone: 'neutral' },
  failed: { label: '付款失敗', tone: 'danger' },
};

export const statusOptions = (Object.keys(statusMeta) as OrderStatus[]).map((value) => ({ value, label: statusMeta[value].label }));
export const channelOptions = (['Web', 'iOS', 'Android', 'Partner'] as const).map((value) => ({ value, label: value }));

export const currencyFormatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

const dateTimeParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** `YYYY-MM-DD HH:mm:ss` in Asia/Taipei. */
export function formatDateTime(value: number | string | Date): string {
  const parts = Object.fromEntries(dateTimeParts.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts['year']}-${parts['month']}-${parts['day']} ${parts['hour']}:${parts['minute']}:${parts['second']}`;
}

/** `YYYY-MM-DD` of `value` in Asia/Taipei (the date filter compares calendar days). */
export const taipeiDay = (value: string): string => formatDateTime(value).slice(0, 10);

export const editableOrderFields: ReadonlyArray<{ key: keyof OrderEditValues; label: string }> = [
  { key: 'customer', label: '客戶' },
  { key: 'email', label: 'Email' },
  { key: 'product', label: '方案' },
  { key: 'channel', label: '來源' },
  { key: 'amount', label: '金額' },
  { key: 'status', label: '狀態' },
  { key: 'owner', label: '負責人' },
];

export const orderToEditValues = (order: OrderRecord): OrderEditValues => ({
  customer: order.customer,
  email: order.email,
  product: order.product,
  channel: order.channel,
  amount: order.amount,
  status: order.status,
  owner: order.owner,
});

export const formatEditValue = (key: keyof OrderEditValues, value: OrderEditValues[keyof OrderEditValues]): string => {
  if (value === '') return '空白';
  if (key === 'status') return statusMeta[value as OrderStatus].label;
  if (key === 'amount') return currencyFormatter.format(value as number);
  return String(value);
};

export const summarizeAuditChanges = (changes: OrderAuditChange[]): string => {
  if (changes.length === 0) return '無欄位變更';
  const visibleFields = changes
    .slice(0, 3)
    .map((change) => change.field)
    .join('、');
  return `${visibleFields}${changes.length > 3 ? `等 ${changes.length} 個欄位` : ''}`;
};
