'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Spinner } from '@salmonui/notifications/spinner';
import { TextField } from '@salmonui/inputs/text-field';

const dots = (
  <svg viewBox="0 0 24 24" width="24" height="24">
    {[4, 12, 20].map((cx, i) => (
      <circle key={cx} cx={cx} cy="12" r="3" fill="currentColor" opacity="0.3">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="0.9s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
      </circle>
    ))}
  </svg>
);

// Spinners: labelled sizes, a form covered while it saves, an overlay on a
// positioned panel, and a custom indicator.
export default function SpinnerOverlayDemo() {
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rate, setRate] = useState(1.08);
  const save = () => {
    setSaving(true);
    setTimeout(() => setSaving(false), 1500);
  };
  return (
    <div style={{ display: 'grid', gap: 20, maxInlineSize: 480 }}>
      <div className="demo-toolbar">
        <Spinner size="sm" label="Loading, small" />
        <Spinner label="Loading, medium" />
        <Spinner size="lg" label="Loading, large" />
        <Spinner size={48} label="Loading, 48 pixels" style={{ color: 'var(--salmon-color-success)' }} />
        <Spinner indicator={dots} label="Loading with a custom indicator" />
      </div>
      <Spinner loading={saving} label="Saving the customer" style={{ border: '1px solid var(--salmon-border-subtle)', borderRadius: 'var(--salmon-radius-lg)' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          style={{ display: 'grid', gap: 8, padding: 12 }}
        >
          <TextField name="customer" label="Customer" defaultValue="Ada Lovelace" />
          <Button type="submit" tone="primary" style={{ justifySelf: 'start' }}>
            Save
          </Button>
        </form>
      </Spinner>
      <div style={{ position: 'relative', padding: 12, border: '1px solid var(--salmon-border-subtle)', borderRadius: 'var(--salmon-radius-lg)' }} aria-busy={refreshing}>
        <p style={{ marginBlockStart: 0 }}>Exchange rate: 1 EUR = {rate.toFixed(2)} USD</p>
        <Button
          variant="outline"
          onClick={() => {
            setRefreshing(true);
            setTimeout(() => {
              setRefreshing(false);
              setRate((r) => (r >= 1.1 ? 1.07 : r + 0.01));
            }, 1500);
          }}
        >
          Refresh
        </Button>
        {refreshing ? <Spinner overlay label="Refreshing rates" /> : null}
      </div>
    </div>
  );
}
