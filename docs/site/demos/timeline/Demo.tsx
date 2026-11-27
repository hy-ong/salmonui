import { Timeline, type TimelineItemData } from '@salmonui/layout/timeline';

const check = (
  <svg viewBox="0 0 16 16" width="16" height="16">
    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// Newest first: `reverse` flips the DOM order, so screen readers read what is shown.
const HISTORY: TimelineItemData[] = [
  { key: 'v1', content: 'v1.0 released', opposite: 'March', marker: check, tone: 'success' },
  { key: 'v11', content: 'v1.1 adds export', opposite: 'May', marker: check, tone: 'success' },
  { key: 'v2', content: 'v2.0 in review', opposite: 'July', tone: 'warning', className: 'demo-timeline-current' },
];

export default function TimelineDemo() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <Timeline
        aria-label="Order status"
        align="alternate"
        items={[
          { content: 'Ordered', opposite: '09:00', tone: 'primary' },
          { content: 'Packed', opposite: '10:30', tone: 'info' },
          { content: 'Shipped', opposite: '12:00', tone: 'success' },
          { content: 'Delivered', opposite: 'pending', disabled: true },
        ]}
      />
      <Timeline
        aria-label="Release history, newest first"
        reverse
        items={HISTORY}
        renderItem={(item, { first, last }) => (
          <span>
            <strong>{item.content}</strong>
            {last ? ' (latest)' : first ? ' (first release)' : null}
          </span>
        )}
      />
      <div dir="rtl" lang="ar">
        <Timeline aria-label="حالة الطلب" items={[{ content: 'تم الطلب', opposite: '09:00', tone: 'primary' }, { content: 'تم الشحن', opposite: '12:00', tone: 'success' }]} />
      </div>
      <Timeline aria-label="Release" orientation="horizontal" items={[{ content: 'Design', tone: 'success' }, { content: 'Build', tone: 'primary' }, { content: 'Ship' }]} />
    </div>
  );
}
