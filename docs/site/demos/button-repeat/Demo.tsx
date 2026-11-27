'use client';

import { useState } from 'react';
import { Button, ButtonGroup } from '@salmonui/buttons/button';

const Icon = ({ d }: { readonly d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

// Press and hold: the first activation is onClick, every repeat is onRepeat.
export default function ButtonRepeatDemo() {
  const [value, setValue] = useState(10);
  const step = (delta: number) => setValue((v) => Math.max(0, Math.min(100, v + delta)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <ButtonGroup aria-label="Quantity" variant="outline">
        <Button aria-label="Decrease" iconOnly iconStart={<Icon d="M3 8h10" />} repeat onClick={() => step(-1)} onRepeat={() => step(-1)} />
        <Button aria-label="Increase" iconOnly iconStart={<Icon d="M8 3v10M3 8h10" />} repeat={{ delay: 300, interval: 60 }} onClick={() => step(1)} onRepeat={() => step(1)} />
      </ButtonGroup>
      <output aria-live="polite">Quantity: {value}</output>
    </div>
  );
}
