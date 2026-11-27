'use client';

import { Button } from '@salmonui/buttons/button';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { Select } from '@salmonui/dropdowns/select';
import { TimePicker } from '@salmonui/calendars/time-picker';
import { TreeSelect } from '@salmonui/dropdowns/tree-select';

const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'kiwi', label: 'Kiwi' },
  { value: 'mango', label: 'Mango' },
];

interface Folder {
  id: string;
  label: string;
  children?: Folder[];
}

const FOLDERS: Folder[] = [{ id: 'docs', label: 'Documents', children: [{ id: 'cv', label: 'CV.pdf' }, { id: 'notes', label: 'Notes.txt' }] }];

const SIZES = [
  { size: 'sm', name: 'Small' },
  { size: 'md', name: 'Medium' },
  { size: 'lg', name: 'Large' },
] as const;

// One row per size: every control takes the same `size` as the Button.
export default function ControlSizesDemo() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {SIZES.map(({ size, name }) => (
        <div key={size} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Button size={size}>{name}</Button>
          <Select size={size} aria-label={`${name} select`} data={FRUITS} defaultValue="kiwi" />
          <Combobox size={size} aria-label={`${name} combobox`} multiple data={FRUITS} defaultValue={['apple']} />
          <TreeSelect<Folder> size={size} aria-label={`${name} tree select`} data={FOLDERS} getItemValue={(f) => f.id} getItemLabel={(f) => f.label} getChildren={(f) => f.children} defaultValue="cv" />
          <DatePicker size={size} aria-label={`${name} date`} defaultValue="2026-11-24" />
          <TimePicker size={size} aria-label={`${name} time`} defaultValue="09:30" />
        </div>
      ))}
    </div>
  );
}
