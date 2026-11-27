'use client';

import { useState } from 'react';
import { Avatar } from '@salmonui/layout/avatar';
import { Badge } from '@salmonui/notifications/badge';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Skeleton, type SkeletonAnimation } from '@salmonui/notifications/skeleton';

const ANIMATIONS = [
  { value: 'wave', label: 'wave' },
  { value: 'pulse', label: 'pulse' },
  { value: 'false', label: 'none' },
];

// A profile card that loads: placeholder shapes while loading, then the same
// card sized from its content. The controls pick the animation and direction.
export default function SkeletonCardDemo() {
  const [loading, setLoading] = useState(true);
  const [animation, setAnimation] = useState<SkeletonAnimation>('wave');
  const [rtl, setRtl] = useState(false);
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'grid', gap: 16, maxInlineSize: 420 }}>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => setLoading(!loading)}>
          {loading ? 'Finish loading' : 'Load again'}
        </Button>
        <label>
          Animation
          <Select aria-label="Animation" data={ANIMATIONS} value={String(animation)} onValueChange={(value) => value != null && setAnimation(value === 'false' ? false : (value as 'wave' | 'pulse'))} />
        </label>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <section aria-label="Profile" aria-busy={loading} style={{ display: 'grid', gap: 12, padding: 12, border: '1px solid var(--salmon-border-subtle)', borderRadius: 'var(--salmon-radius-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {loading ? <Skeleton shape="circle" animation={animation} /> : <Avatar name="Grace Hopper" shape="circle" />}
          <div style={{ flex: 1, display: 'grid', gap: 4 }}>
            {loading ? <Skeleton width="60%" animation={animation} /> : <strong>Grace Hopper</strong>}
            {loading ? <Skeleton width={120} height={12} animation={animation} /> : <small>Rear admiral</small>}
          </div>
        </div>
        {loading ? <Skeleton shape="rect" width="100%" height={120} animation={animation} /> : <div style={{ blockSize: 120, borderRadius: 'var(--salmon-radius-sm)', background: 'var(--salmon-color-primary-subtle)' }} />}
        {loading ? <Skeleton lines={3} animation={animation} /> : <p style={{ margin: 0 }}>Invented the first compiler and popularized machine-independent programming languages.</p>}
        {/* Sized from the button it stands in for, with the button's own corner radius. */}
        <div>
          <Skeleton loading={loading} animation={animation} style={{ borderRadius: 'var(--salmon-radius-md)' }}>
            <Button tone="primary">
              Follow
            </Button>
          </Skeleton>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {loading ? (
            <>
              <Skeleton shape="rect" width={64} height={20} animation={animation} />
              <Skeleton shape="rect" width={64} height={20} animation={animation} />
            </>
          ) : (
            <>
              <Badge>Navy</Badge>
              <Badge>COBOL</Badge>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
