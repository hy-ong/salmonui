'use client';

import { useState } from 'react';
import { Listbox, type ListboxKey } from '@salmonui/dropdowns/listbox';

interface Place {
  value: number;
  label: string;
  group: string;
}

const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const NAMES = ['Ångström', 'Café', 'Zürich', 'Øresund', 'Crème', 'Naïve', 'Señor', 'Straße', 'Łódź', 'São Paulo', 'Kraków', 'Málaga'];

// 10,000 items in five contiguous groups (items of one group must be adjacent).
const places: Place[] = Array.from({ length: 10_000 }, (_, i) => ({
  value: i,
  label: `${NAMES[i % NAMES.length]} ${i}`,
  group: REGIONS[Math.floor(i / 2_000)] as string,
}));

export default function ListboxSearchDemo() {
  const [value, setValue] = useState<readonly ListboxKey[]>([]);
  const [text, setText] = useState('');
  return (
    <div style={{ maxWidth: 360 }}>
      <p id="listbox-search-label">Places (10,000, grouped by region)</p>
      <Listbox
        data={places}
        multiple
        searchable
        searchOperator="contains"
        ignoreAccents
        highlightMatches
        searchPlaceholder="Search places"
        onSearchChange={(event) => setText(event.text)}
        aria-labelledby="listbox-search-label"
        value={value}
        onValueChange={(next) => setValue(next)}
        maxVisibleItems={8}
      />
      <p>
        Search: <output>{text === '' ? '(empty)' : text}</output> · Selected: <output>{value.length}</output>
      </p>
    </div>
  );
}
