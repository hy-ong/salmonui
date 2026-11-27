'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { TreeSelect, type TreeSelectValue } from '@salmonui/dropdowns/tree-select';

const PRODUCE = [
  {
    id: 'fruit',
    label: 'Fruit',
    children: [
      { id: 'apple', label: 'Apple' },
      { id: 'banana', label: 'Banana' },
      { id: 'cherry', label: 'Cherry' },
      { id: 'durian', label: 'Durian', disabled: true },
    ],
  },
  {
    id: 'vegetables',
    label: 'Vegetables',
    children: [
      { id: 'leafy', label: 'Leafy greens', children: [{ id: 'kale', label: 'Kale' }, { id: 'spinach', label: 'Spinach' }] },
      { id: 'carrot', label: 'Carrot' },
      { id: 'pepper', label: 'Pepper' },
    ],
  },
  { id: 'herbs', label: 'Herbs', children: [{ id: 'basil', label: 'Basil' }, { id: 'mint', label: 'Mint' }] },
];

type Display = 'text' | 'chips' | 'count';

// `multiple indicator="checkbox"`: tri-state checks with cascade or
// independent propagation, Select all, and the three value displays.
export default function TreeSelectCheckboxesDemo() {
  const [value, setValue] = useState<readonly TreeSelectValue[]>(['apple', 'kale']);
  const [cascade, setCascade] = useState(true);
  const [display, setDisplay] = useState<Display>('text');
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
      <RadioGroup label="Value display" name="tree-select-display" orientation="horizontal" value={display} onValueChange={(next) => setDisplay(next as Display)}>
        {(['text', 'chips', 'count'] as const).map((d) => (
          <Radio key={d} value={d}>
            {d}
          </Radio>
        ))}
      </RadioGroup>
      <Checkbox checked={cascade} onCheckedChange={(checked) => setCascade(checked)}>
        Checks: cascade (off: independent)
      </Checkbox>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-produce-label">Produce</span>
        <TreeSelect
          aria-labelledby="demo-produce-label"
          data={PRODUCE}
          multiple
          indicator="checkbox"
          checkPropagation={cascade ? 'cascade' : 'none'}
          showSelectAll
          valueDisplay={display}
          maxVisibleValues={3}
          defaultExpanded={['fruit', 'vegetables']}
          value={value}
          onValueChange={setValue}
          clearable
          placeholder="Pick produce"
        />
      </div>
      <output>Value: {value.join(', ') || 'none'}</output>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-produce-plain-label">Produce, without checkboxes</span>
        <TreeSelect aria-labelledby="demo-produce-plain-label" data={PRODUCE} multiple valueSeparator=" · " placeholder="Pick produce" />
      </div>
    </div>
  );
}
