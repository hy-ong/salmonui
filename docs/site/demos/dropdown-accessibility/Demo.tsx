'use client';

import { useState } from 'react';
import { Combobox, type ComboboxValue } from '@salmonui/dropdowns/combobox';
import { Listbox, type ListboxKey } from '@salmonui/dropdowns/listbox';
import { Select, type SelectValue } from '@salmonui/dropdowns/select';

const COLORS = [
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Yellow', disabled: true },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
];

// One of each dropdown with selected, active and disabled options, for keyboard,
// screen reader, forced-colors and touch checks.
export default function DropdownAccessibilityDemo() {
  const [color, setColor] = useState<SelectValue | null>('green');
  const [colors, setColors] = useState<readonly ComboboxValue[]>(['red', 'blue']);
  const [listed, setListed] = useState<readonly ListboxKey[]>(['orange']);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 4, minInlineSize: 200 }}>
        <label htmlFor="dd-a11y-select">Favourite color</label>
        <Select id="dd-a11y-select" data={COLORS} value={color} onValueChange={setColor} clearable />
      </div>
      <div style={{ display: 'grid', gap: 4, minInlineSize: 240 }}>
        <span id="dd-a11y-combobox">Palette</span>
        <Combobox aria-labelledby="dd-a11y-combobox" multiple data={COLORS} value={colors} onValueChange={(next) => setColors(next)} />
      </div>
      <div style={{ display: 'grid', gap: 4, minInlineSize: 200 }}>
        <span id="dd-a11y-listbox">Accent colors</span>
        <Listbox aria-labelledby="dd-a11y-listbox" multiple indicator="checkbox" data={COLORS} value={listed} onValueChange={(next) => setListed(next)} />
      </div>
    </div>
  );
}
