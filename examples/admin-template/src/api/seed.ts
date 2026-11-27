import type { OrderChannel, OrderRecord, OrderStatus } from './types';

const customers = [
  ['王小安', 'an.wang@example.com'],
  ['林怡君', 'yijun.lin@example.com'],
  ['陳柏宇', 'boyu.chen@example.com'],
  ['張語晴', 'yuqing.zhang@example.com'],
  ['李承翰', 'chenghan.li@example.com'],
  ['許庭瑄', 'tingxuan.hsu@example.com'],
  ['吳品妤', 'pinyu.wu@example.com'],
  ['周昱廷', 'yuting.chou@example.com'],
] as const;

const products = ['Growth 年繳方案', 'Scale 月繳方案', 'Starter 年繳方案', 'Enterprise 加購'];
const channels: OrderChannel[] = ['Web', 'iOS', 'Android', 'Partner'];
const statuses: OrderStatus[] = ['paid', 'pending', 'paid', 'paid', 'refunded', 'failed'];
const owners = ['Joyce', 'Marcus', 'Nina', 'Oscar', 'Sam'];

export const orderData: OrderRecord[] = Array.from({ length: 96 }, (_, index) => {
  const customer = customers[index % customers.length]!;
  const updatedAt = new Date(Date.UTC(2026, 6, 28 - (index % 46), 9, 30));
  const createdAt = new Date(updatedAt);
  createdAt.setUTCDate(createdAt.getUTCDate() - 2 - (index % 21));
  createdAt.setUTCHours(9, 0, 0, 0);

  return {
    id: `ORD-${String(2680 - index).padStart(5, '0')}`,
    customer: customer[0],
    email: customer[1],
    product: products[index % products.length]!,
    channel: channels[index % channels.length]!,
    amount: 680 + ((index * 137) % 15800),
    status: statuses[index % statuses.length]!,
    owner: owners[index % owners.length]!,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
});
