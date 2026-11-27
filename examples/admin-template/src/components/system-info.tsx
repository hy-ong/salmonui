import { formatDateTime } from '../lib/order-display';
import { Descriptions, Section } from './section';

export function SystemInfo({ createdAt, updatedAt }: { readonly createdAt?: string; readonly updatedAt?: string }) {
  return (
    <Section title="系統資訊">
      <Descriptions
        columns={2}
        items={[
          { key: 'createdAt', label: '建立時間', children: createdAt ? formatDateTime(createdAt) : '—' },
          { key: 'updatedAt', label: '更新時間', children: updatedAt ? formatDateTime(updatedAt) : '—' },
        ]}
      />
    </Section>
  );
}
