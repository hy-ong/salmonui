export type OrderStatus = 'paid' | 'pending' | 'refunded' | 'failed';
export type OrderChannel = 'Web' | 'iOS' | 'Android' | 'Partner';

export interface OrderRecord {
  id: string;
  customer: string;
  email: string;
  product: string;
  channel: OrderChannel;
  amount: number;
  status: OrderStatus;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderEditValues = Omit<OrderRecord, 'id' | 'createdAt' | 'updatedAt'>;

export interface OrderAuditChange {
  key: string;
  field: string;
  before: string;
  after: string;
}

export interface OrderAuditEvent {
  id: string;
  occurredAt: string;
  action: 'create' | 'update';
  actor: string;
  changes: OrderAuditChange[];
}

export interface OrdersApi {
  list(): Promise<OrderRecord[]>;
  get(id: string): Promise<OrderRecord | null>;
  create(values: OrderEditValues): Promise<OrderRecord>;
  update(id: string, values: OrderEditValues): Promise<OrderRecord>;
  remove(id: string): Promise<void>;
  history(id: string): Promise<OrderAuditEvent[]>;
}
