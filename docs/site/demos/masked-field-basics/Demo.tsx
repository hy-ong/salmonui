'use client';

import { useState } from 'react';
import { MaskedField } from '@salmonui/inputs/masked-field';

// A phone mask with raw and masked values, a case-shifted code and custom tokens.
export default function MaskedFieldBasicsDemo() {
  const [raw, setRaw] = useState('');
  const [masked, setMasked] = useState('');
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
      <MaskedField
        label="Phone"
        mask="(000) 000-0000"
        description="For example (555) 123-4567"
        value={raw}
        onValueChange={(value, details) => {
          setRaw(value);
          setMasked(details.masked);
        }}
        clearable
      />
      <output>
        Raw: {JSON.stringify(raw)} · Masked: {JSON.stringify(masked)}
      </output>
      <MaskedField label="Product code" mask=">LL-0000" placeholder="AB-1234" />
      <MaskedField label="Time" mask="[0-2]0:[0-5]0" placeholderChar="•" description="24-hour clock, for example 09:30" />
    </div>
  );
}
