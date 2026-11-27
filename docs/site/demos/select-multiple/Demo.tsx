'use client';

import { useState } from 'react';
import { Select, type SelectValue } from '@salmonui/dropdowns/select';

const FRUITS = [
  { value: 'apple', label: 'Apple', group: 'Pome' },
  { value: 'pear', label: 'Pear', group: 'Pome' },
  { value: 'apricot', label: 'Apricot', group: 'Stone' },
  { value: 'cherry', label: 'Cherry', group: 'Stone' },
  { value: 'peach', label: 'Peach', group: 'Stone' },
  { value: 'lemon', label: 'Lemon', group: 'Citrus' },
  { value: 'lime', label: 'Lime', group: 'Citrus' },
  { value: 'orange', label: 'Orange', group: 'Citrus' },
];

const ITEMS = Array.from({ length: 10_000 }, (_, i) => ({ value: i, label: `Item ${i}` }));

// MultiSelect CheckBox mode with select all and group selection, a
// selection limit, and a count summary over 10,000 virtualized items.
export default function SelectMultipleDemo() {
  const [tags, setTags] = useState<readonly SelectValue[]>(['apple', 'lime']);
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-tags-label">Fruits (checkboxes)</span>
        <Select aria-labelledby="demo-tags-label" multiple indicator="checkbox" showSelectAll groupSelection data={FRUITS} value={tags} onValueChange={setTags} />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-limit-label">Up to two</span>
        <Select aria-labelledby="demo-limit-label" multiple maxSelected={2} data={FRUITS} valueSeparator=" · " />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-count-label">10,000 items</span>
        <Select aria-labelledby="demo-count-label" multiple indicator="checkbox" showSelectAll valueDisplay="count" searchable data={ITEMS} />
      </div>
    </div>
  );
}
