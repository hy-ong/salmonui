'use client';

import { useState } from 'react';
import { Listbox, type ListboxKey } from '@salmonui/dropdowns/listbox';

interface Fruit {
  value: string;
  label: string;
  disabled?: boolean;
}

// Objects with `value` and `label` need no accessors; `disabled` items are
// skipped by the arrow keys and type-ahead.
const fruits: Fruit[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'cherry', label: 'Cherry', disabled: true },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
  { value: 'fig', label: 'Fig' },
  { value: 'grape', label: 'Grape' },
  { value: 'kiwi', label: 'Kiwi' },
  { value: 'lemon', label: 'Lemon' },
  { value: 'mango', label: 'Mango' },
];

export default function ListboxBasicDemo() {
  // Single selection, controlled: selection follows focus on the arrow keys.
  const [fruit, setFruit] = useState<ListboxKey | null>('banana');
  // Multiple selection, controlled, with checkboxes, select all and a limit.
  const [basket, setBasket] = useState<readonly ListboxKey[]>(['apple', 'kiwi']);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'start' }}>
      <div style={{ minWidth: 200 }}>
        <p id="listbox-basic-single">Favourite fruit</p>
        <Listbox data={fruits} aria-labelledby="listbox-basic-single" value={fruit} onValueChange={(value) => setFruit(value)} maxVisibleItems={6} />
        <p>
          Value: <output>{String(fruit)}</output>
        </p>
      </div>
      <div style={{ minWidth: 220 }}>
        <p id="listbox-basic-multiple">Basket (at most 5)</p>
        <Listbox
          data={fruits}
          multiple
          indicator="checkbox"
          showSelectAll
          maxSelected={5}
          aria-labelledby="listbox-basic-multiple"
          value={basket}
          onValueChange={(value) => setBasket(value)}
          maxVisibleItems={6}
        />
        <p>
          Value: <output>{basket.join(', ') || 'none'}</output>
        </p>
      </div>
    </div>
  );
}
