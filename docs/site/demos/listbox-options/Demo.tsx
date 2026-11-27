'use client';

import { useState } from 'react';
import { Listbox, type ListboxKey } from '@salmonui/dropdowns/listbox';

interface Office {
  readonly office: { readonly code: string; readonly city: string; readonly state: string };
  readonly closed: boolean;
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

// Two offices share the city name "Springfield": the label may repeat, the value (the code) may not.
const OFFICES: Office[] = [
  { office: { code: 'BOS', city: 'Boston', state: 'MA' }, closed: false },
  { office: { code: 'CHI', city: 'Chicago', state: 'IL' }, closed: false },
  { office: { code: 'DEN', city: 'Denver', state: 'CO' }, closed: true },
  { office: { code: 'SPI', city: 'Springfield', state: 'IL' }, closed: false },
  { office: { code: 'SGF', city: 'Springfield', state: 'MO' }, closed: false },
  { office: { code: 'SEA', city: 'Seattle', state: 'WA' }, closed: false },
  { office: { code: 'AUS', city: 'Austin', state: 'TX' }, closed: true },
];

// Accessors at module scope stay stable, so the list never re-indexes on render.
const officeValue = (item: Office) => item.office.code;
const officeLabel = (item: Office) => `${item.office.city}, ${item.office.state}`;
const officeProps = (item: Office) => (item.closed ? { title: 'Closed for renovation', 'data-closed': true } : { title: `Office code ${item.office.code}` });

export default function ListboxOptionsDemo() {
  const [size, setSize] = useState<ListboxKey | null>('M');
  const [offices, setOffices] = useState<readonly ListboxKey[]>(['SPI']);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'start' }}>
      <div style={{ minWidth: 160 }}>
        <p id="listbox-options-size">Size</p>
        <Listbox data={SIZES} aria-labelledby="listbox-options-size" value={size} onValueChange={(next) => setSize(next)} />
        <p>
          Value: <output>{String(size)}</output>
        </p>
      </div>
      <div style={{ minWidth: 240 }}>
        <p id="listbox-options-offices">Offices</p>
        <Listbox
          data={OFFICES}
          multiple
          getItemValue={officeValue}
          getItemLabel={officeLabel}
          getItemProps={officeProps}
          indicator="checkbox"
          indicatorPosition="end"
          maxVisibleItems={4}
          aria-labelledby="listbox-options-offices"
          value={offices}
          onValueChange={(next) => setOffices(next)}
        />
        <p>
          Values: <output>{offices.join(', ') || '(none)'}</output>
        </p>
      </div>
    </div>
  );
}
