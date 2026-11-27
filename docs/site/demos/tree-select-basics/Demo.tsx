'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { TreeSelect, type TreeSelectValue } from '@salmonui/dropdowns/tree-select';

interface Office {
  id: string;
  name: string;
  children?: Office[];
  closed?: boolean;
}

// Nested data: regions hold countries, countries hold offices.
const OFFICES: Office[] = [
  {
    id: 'emea',
    name: 'Europe',
    children: [
      { id: 'de', name: 'Germany', children: [{ id: 'ber', name: 'Berlin' }, { id: 'muc', name: 'Munich' }] },
      { id: 'fr', name: 'France', children: [{ id: 'par', name: 'Paris' }, { id: 'lyo', name: 'Lyon', closed: true }] },
    ],
  },
  {
    id: 'apac',
    name: 'Asia Pacific',
    children: [
      { id: 'jp', name: 'Japan', children: [{ id: 'tyo', name: 'Tokyo' }, { id: 'osa', name: 'Osaka' }] },
      { id: 'sg', name: 'Singapore', children: [{ id: 'sin', name: 'Singapore City' }] },
    ],
  },
  { id: 'amer', name: 'Americas', children: [{ id: 'us', name: 'United States', children: [{ id: 'nyc', name: 'New York' }, { id: 'sfo', name: 'San Francisco' }] }] },
];

interface Department {
  value: number;
  text: string;
  parent: number | null;
}

// Flat (self-referential) data: each row names its parent.
const DEPARTMENTS: Department[] = [
  { value: 1, text: 'Engineering', parent: null },
  { value: 2, text: 'Platform', parent: 1 },
  { value: 3, text: 'Developer tools', parent: 2 },
  { value: 4, text: 'Design systems', parent: 1 },
  { value: 5, text: 'Sales', parent: null },
  { value: 6, text: 'Partner sales', parent: 5 },
  { value: 7, text: 'Support', parent: null },
  { value: 8, text: 'Developer relations', parent: 7 },
];

const getOfficeValue = (o: Office) => o.id;
const getOfficeLabel = (o: Office) => o.name;
const isLeaf = (o: Office) => o.children === undefined;
const isClosed = (o: Office) => o.closed === true;
const getOfficeProps = (o: Office) => (o.closed ? { title: 'Closed for renovation', 'data-closed': '' } : undefined);
const getDepartmentParent = (d: Department) => d.parent;

// A single TreeSelect with leaf-only selection, a searchable flat-data
// TreeSelect, and a form field with a hidden native select.
export default function TreeSelectBasicsDemo() {
  const [office, setOffice] = useState<TreeSelectValue | null>('osa');
  const [lastKey, setLastKey] = useState('none');
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-office-label">Office</span>
        <TreeSelect
          aria-labelledby="demo-office-label"
          data={OFFICES}
          getItemValue={getOfficeValue}
          getItemLabel={getOfficeLabel}
          isItemSelectable={isLeaf}
          isItemDisabled={isClosed}
          getItemProps={getOfficeProps}
          value={office}
          onValueChange={setOffice}
          onKeyDown={(event) => setLastKey(event.key)}
          clearable
          placeholder="Pick an office"
        />
      </div>
      <output>
        Value: {String(office)} · last key: {lastKey}
      </output>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-department-label">Department</span>
        <TreeSelect
          aria-labelledby="demo-department-label"
          data={DEPARTMENTS}
          getParentId={getDepartmentParent}
          defaultExpanded={[1]}
          searchable
          searchOperator="contains"
          highlightMatches
          searchPlaceholder="Search departments"
          placeholder="Any department"
        />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          alert(JSON.stringify([...new FormData(event.currentTarget)]));
        }}
        style={{ display: 'grid', gap: 8 }}
      >
        <span id="demo-home-label">Home office (required)</span>
        <TreeSelect aria-labelledby="demo-home-label" name="office" required data={OFFICES} getItemValue={getOfficeValue} getItemLabel={getOfficeLabel} isItemSelectable={isLeaf} placeholder="Choose an office" />
        <Button type="submit" style={{ justifySelf: 'start' }}>
          Submit
        </Button>
      </form>
    </div>
  );
}
