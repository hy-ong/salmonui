'use client';

import { useState } from 'react';
import { Combobox, type ComboboxColumn, type ComboboxValue } from '@salmonui/dropdowns/combobox';
import { Select, type SelectValue } from '@salmonui/dropdowns/select';

interface Part {
  readonly value: number;
  readonly label: string;
  readonly bin: string;
  readonly qty: number;
}

const PREFIXES = ['Axle', 'Bolt', 'Cable', 'Diode', 'Fuse', 'Gear', 'Hinge', 'Lens', 'Motor', 'Nut', 'Pulley', 'Relay', 'Spring', 'Valve', 'Washer'];
// 100,000 parts, built once at module scope and shared by every dropdown below.
const PARTS: Part[] = Array.from({ length: 100_000 }, (_, i) => ({
  value: i + 1,
  label: `${PREFIXES[i % PREFIXES.length]} ${String(i + 1).padStart(6, '0')}`,
  bin: `Bin ${String.fromCharCode(65 + (i % 26))}-${(i % 97) + 1}`,
  qty: (i * 7) % 500,
}));

const COLUMNS: ComboboxColumn<Part>[] = [
  { field: 'value', header: 'No.', width: 80, align: 'end' },
  { field: 'label', header: 'Part' },
  { field: 'bin', header: 'Bin', width: 90 },
  { field: 'qty', header: 'Qty', width: 70, align: 'end' },
  { field: 'value', header: 'Ref', width: 70, align: 'end', sortable: false, format: (value) => `R${String(value)}` },
];

const CLOSED = Array.from({ length: 20 }, (_, i) => i);

export default function DropdownLargeListsDemo() {
  const [part, setPart] = useState<SelectValue | null>(null);
  const [many, setMany] = useState<readonly SelectValue[]>([]);
  const [row, setRow] = useState<ComboboxValue | null>(null);
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 600 }}>
      <div style={{ display: 'grid', gap: 4, maxWidth: 280 }}>
        <span id="dd-large-select">Part (Select, 100,000 options)</span>
        <Select aria-labelledby="dd-large-select" data={PARTS} value={part} onValueChange={setPart} searchable searchOperator="contains" placeholder="Open, scroll or search" />
      </div>
      <div style={{ display: 'grid', gap: 4, maxWidth: 280 }}>
        <span id="dd-large-combobox">Part (Combobox, type to filter 100,000)</span>
        <Combobox aria-labelledby="dd-large-combobox" data={PARTS} searchOperator="contains" placeholder="Type a part number, such as 4242" />
      </div>
      <div style={{ display: 'grid', gap: 4, maxWidth: 280 }}>
        <span id="dd-large-multiple">Parts to reorder (select all 100,000)</span>
        <Select aria-labelledby="dd-large-multiple" multiple indicator="checkbox" showSelectAll data={PARTS} value={many} onValueChange={(next) => setMany(next)} valueDisplay="count" />
        <output>{many.length.toLocaleString('en-US')} selected</output>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="dd-large-columns">Part (Combobox columns, 100,000 rows, 5 columns)</span>
        <Combobox<Part> aria-labelledby="dd-large-columns" data={PARTS} columns={COLUMNS} searchFields={['label', 'bin']} searchOperator="contains" value={row} onValueChange={(next) => setRow(next)} />
      </div>
      <details>
        <summary>Twenty closed Selects over the same 100,000 items</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBlockStart: 8 }}>
          {CLOSED.map((i) => (
            <Select key={i} aria-label={`Spare part ${i + 1}`} data={PARTS} defaultValue={(i + 1) * 4_999} />
          ))}
        </div>
      </details>
    </div>
  );
}
