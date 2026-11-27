'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { ColorPicker, type SwatchRenderContext } from '@salmonui/inputs/color-picker';
import { Select } from '@salmonui/dropdowns/select';

const COLUMNS = ['3', '4', '6', '12'];

const LABELS = [
  { value: '#e03131', label: 'Bug' },
  { value: '#f08c00', label: 'Urgent' },
  { value: '#f5c400', label: 'Review' },
  { value: '#2f9e44', label: 'Done' },
  { value: '#0ca678', label: 'Design' },
  { value: '#1971c2', label: 'Feature' },
  { value: '#5f3dc4', label: 'Research' },
  { value: '#c2255c', label: 'Blocked' },
  { value: '#495057', label: 'Chore' },
  { value: '#868e96', label: 'Later' },
  { value: '#a61e4d', label: 'Security' },
  { value: '#087f5b', label: 'Docs' },
];

// A filled chip with a check mark on the selected swatch; the picker draws the selection ring.
function chip({ value, label, selected }: SwatchRenderContext) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'grid',
        placeItems: 'center',
        inlineSize: 20,
        blockSize: 20,
        borderRadius: 'var(--salmon-radius-sm)',
        background: value ?? 'transparent',
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
      }}
      title={label}
    >
      {selected ? '✓' : ''}
    </span>
  );
}

// An inline palette: columns and renderSwatch.
export default function ColorPickerSwatchesDemo() {
  const [columns, setColumns] = useState(6);
  const [custom, setCustom] = useState(true);
  const [value, setValue] = useState<string | null>('#1971c2');
  const name = LABELS.find((l) => l.value === value)?.label;
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <div className="demo-toolbar">
        <label>
          Columns
          <Select aria-label="Columns" data={COLUMNS} value={String(columns)} onValueChange={(value) => value != null && setColumns(Number(value))} />
        </label>
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          Custom swatches
        </Checkbox>
      </div>
      <ColorPicker
        label="Label color"
        inline
        defaultMode="swatches"
        showModeSwitch={false}
        commitBehavior="immediate"
        valueFormat="hex"
        colors={LABELS}
        columns={columns}
        renderSwatch={custom ? chip : undefined}
        value={value}
        onValueChange={setValue}
      />
      <output>
        {value ?? 'no color'} {name ? `(${name})` : ''}
      </output>
    </div>
  );
}
