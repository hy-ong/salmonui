'use client';

import type { CSSProperties } from 'react';
import { Badge, type BadgeTone } from '@salmonui/notifications/badge';

const TONES: BadgeTone[] = ['neutral', 'primary', 'info', 'success', 'warning', 'danger'];
const ORDERS: { id: string; customer: string; status: string; tone: BadgeTone }[] = [
  { id: 'ORD-1042', customer: 'Ada Lovelace', status: 'Paid', tone: 'success' },
  { id: 'ORD-1043', customer: 'Grace Hopper', status: 'Pending', tone: 'primary' },
  { id: 'ORD-1044', customer: 'Alan Turing', status: 'Refunded', tone: 'neutral' },
  { id: 'ORD-1045', customer: 'Katherine Johnson', status: 'Payment failed', tone: 'danger' },
  { id: 'ORD-1046', customer: 'Edsger Dijkstra', status: 'On hold', tone: 'warning' },
];
const cell = { padding: '8px 12px', borderBlockEnd: '1px solid var(--salmon-border-subtle)', textAlign: 'start' } as const;

// Status dots in every tone, then the same badges in an order table column.
export default function BadgeStatusDemo() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {TONES.map((tone) => (
          <Badge key={tone} variant="dot" tone={tone}>
            {tone}
          </Badge>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {['Web', 'iOS', 'Android', 'Partner'].map((channel) => (
          <Badge key={channel} style={{ '--salmon-badge-font-weight': 400 } as CSSProperties}>
            {channel}
          </Badge>
        ))}
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 14, maxInlineSize: 480 }}>
        <thead>
          <tr>
            <th style={cell}>Order</th>
            <th style={cell}>Customer</th>
            <th style={cell}>Status</th>
          </tr>
        </thead>
        <tbody>
          {ORDERS.map((order) => (
            <tr key={order.id}>
              <td style={cell}>{order.id}</td>
              <td style={cell}>{order.customer}</td>
              <td style={cell}>
                <Badge variant="dot" tone={order.tone}>
                  {order.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
