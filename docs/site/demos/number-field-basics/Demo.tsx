'use client';

import { useState } from 'react';
import { NumberField } from '@salmonui/inputs/number-field';

// A controlled quantity with a range, a German currency field and a percent preset.
export default function NumberFieldBasicsDemo() {
  const [qty, setQty] = useState<number | null>(3);
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <NumberField label="Quantity" value={qty} onValueChange={setQty} min={0} max={20} description="0 to 20; Page keys step by 10" />
      <output>Value: {String(qty)}</output>
      <NumberField label="Preis" locale="de-DE" currency="EUR" defaultValue={1234.5} step={0.5} />
      <NumberField label="Discount" format="P1" defaultValue={0.125} step={0.005} />
    </div>
  );
}
