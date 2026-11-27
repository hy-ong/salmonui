'use client';

import { useState } from 'react';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { Select } from '@salmonui/dropdowns/select';

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'failed', label: 'Payment failed' },
];
const OWNERS = ['Olivia', 'Liam', 'Noah', 'Emma', 'Ava', 'Mia'];

// label / description / errorMessage on Select and Combobox, no wrapping Field needed.
export default function SelectLabelsDemo() {
  const [status, setStatus] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 16, maxInlineSize: 320 }}>
      <Select
        label="Status"
        description="Shown to the customer on the receipt."
        errorMessage="Choose a status."
        invalid={touched && status === null}
        required
        name="status"
        data={STATUSES}
        placeholder="Choose a status"
        value={status}
        onValueChange={(next) => setStatus(next as string | null)}
        onOpenChange={(open) => open || setTouched(true)}
        style={{ inlineSize: '100%' }}
      />
      <Combobox label="Owner" description="Type to filter the team." name="owner" data={OWNERS} defaultValue="Olivia" style={{ inlineSize: '100%' }} />
      <Select label="Channel" size="sm" data={['Web', 'Phone', 'Email', 'Partner']} defaultValue="Web" />
    </div>
  );
}
