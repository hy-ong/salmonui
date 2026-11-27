'use client';

import { useState } from 'react';
import { TextArea, TextField } from '@salmonui/inputs/text-field';

// A controlled clearable search field, adornments, sizes and an auto-growing textarea.
export default function TextFieldBasicsDemo() {
  const [query, setQuery] = useState('salmon');
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
      <TextField label="Search" type="search" clearable value={query} onValueChange={setQuery} description="Escape clears the field" />
      <output>Value: {JSON.stringify(query)}</output>
      <TextField label="Price" startAdornment="$" endAdornment="USD" inputMode="decimal" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, alignItems: 'end' }}>
        <TextField label="Small" size="sm" placeholder="sm" style={{ minInlineSize: 0 }} />
        <TextField label="Medium" placeholder="md" style={{ minInlineSize: 0 }} />
        <TextField label="Large" size="lg" placeholder="lg" style={{ minInlineSize: 0 }} />
      </div>
      <TextArea label="Notes" rows={2} autoResize resize="vertical" placeholder="Grows while you type" />
    </div>
  );
}
