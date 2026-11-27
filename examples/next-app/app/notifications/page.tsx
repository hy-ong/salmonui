// Notifications as React Server Components: this page has no "use client" boundary of its own.
// Badge, Progress, Meter, Spinner and Skeleton are server components; Message
// is server code (its dismiss island is only used with `onDismiss`).
// tests/ssr/next-notifications.spec.ts asserts the server HTML and hydration.
import { Badge } from '@salmonui/notifications/badge';
import { Message } from '@salmonui/notifications/message';
import { Meter, Progress } from '@salmonui/notifications/progress';
import { Skeleton } from '@salmonui/notifications/skeleton';
import { Spinner } from '@salmonui/notifications/spinner';

export const metadata = { title: 'Salmon UI Notifications · Next.js App Router' };

export default function NotificationsPage() {
  return (
    <main style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 480 }}>
      <Message tone="success" title="Saved">
        Your changes were saved on the server.
      </Message>
      <p>
        Inbox <Badge tone="primary">New</Badge>
      </p>
      <Badge content={120} max={99} label="120 unread messages">
        <span>Messages</span>
      </Badge>
      <Progress aria-label="Upload" value={42} label />
      <Progress aria-label="Sync" shape="circular" value={null} />
      <Meter aria-label="Disk usage" value={85} tone={(v) => (v !== null && v > 80 ? 'danger' : 'success')} />
      <Spinner label="Loading orders" />
      <div aria-busy="true">
        <Skeleton shape="circle" />
        <Skeleton lines={3} />
      </div>
    </main>
  );
}
