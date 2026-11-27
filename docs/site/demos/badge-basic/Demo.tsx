'use client';

import { useState } from 'react';
import { Badge, type BadgeTone, type BadgeVariant } from '@salmonui/notifications/badge';
import { Button } from '@salmonui/buttons/button';

const TONES: BadgeTone[] = ['neutral', 'primary', 'info', 'success', 'warning', 'danger'];
const VARIANTS: BadgeVariant[] = ['soft', 'solid', 'outline'];
const avatar = { display: 'inline-grid', placeItems: 'center', inlineSize: 40, blockSize: 40, borderRadius: '50%', background: 'var(--salmon-surface-sunken)', fontSize: 14 } as const;

// Inline tones x variants and shapes, a link badge, and overlay counts and dots.
export default function BadgeBasicDemo() {
  const [unread, setUnread] = useState(120);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {VARIANTS.map((variant) => (
        <div key={variant} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone} variant={variant}>
              {tone}
            </Badge>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Badge shape="pill" tone="primary">
          Pill
        </Badge>
        <Badge shape="circle" tone="danger" variant="solid">
          3
        </Badge>
        <Badge tone="info" render={(props) => <a {...props} href="#demo-badge-basic-title" />}>
          Link
        </Badge>
        <Button variant="outline">
          Drafts <Badge>4</Badge>
        </Button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 32, padding: 8 }}>
        <Badge content={unread} max={99} label={`${unread} unread messages`} tone="danger" invisible={unread === 0}>
          <Button onClick={() => setUnread(0)}>Inbox</Button>
        </Badge>
        <Badge dot label="Online" tone="success" overlap="circular" placement="bottomEnd">
          <span style={avatar}>AL</span>
        </Badge>
        <Badge content="new" placement="topStart" tone="primary">
          <span style={{ ...avatar, borderRadius: 'var(--salmon-radius-md)' }}>JS</span>
        </Badge>
      </div>
    </div>
  );
}
