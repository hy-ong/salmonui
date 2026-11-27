'use client';
import { useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { TreeView, type TreeViewKey } from '@salmonui/navigation/tree-view';

// Flat, self-referential rows as a database returns them: each row names its parent.
// `open`, `current` and `onboarded` are per-row state fields
// (expanded, selected, checked); the application turns them into id lists.
interface Person {
  id: string;
  name: string;
  managerId: string | null;
  open?: boolean;
  current?: boolean;
  onboarded?: boolean;
}

const people: Person[] = [
  { id: 'p1', name: 'Örjan Lind', managerId: null, open: true },
  { id: 'p2', name: 'Zoe Park', managerId: 'p1', open: true, onboarded: true },
  { id: 'p3', name: 'Åsa Berg', managerId: 'p1', open: true },
  { id: 'p4', name: 'Adam Ek', managerId: 'p1', onboarded: true },
  { id: 'p5', name: 'Ärla Holm', managerId: 'p2', current: true, onboarded: true },
  { id: 'p6', name: 'Bo Ström', managerId: 'p2' },
  { id: 'p7', name: 'Olle Nyberg', managerId: 'p3', onboarded: true },
  { id: 'p8', name: 'Ylva Sund', managerId: 'p3' },
];

const SORTS = [
  { value: 'asc', label: 'asc' },
  { value: 'desc', label: 'desc' },
  { value: 'none', label: 'data order' },
];
const LOCALES = [
  { value: 'en', label: 'English (en)' },
  { value: 'sv', label: 'Swedish (sv)' },
];

const ids = (pick: (p: Person) => boolean | undefined): TreeViewKey[] => people.filter(pick).map((p) => p.id);

export default function TreeViewFlatDataDemo() {
  const [expanded, setExpanded] = useState<readonly TreeViewKey[]>(() => ids((p) => p.open));
  const [selected, setSelected] = useState<readonly TreeViewKey[]>(() => ids((p) => p.current));
  const [checked, setChecked] = useState<readonly TreeViewKey[]>(() => ids((p) => p.onboarded));
  const [sort, setSort] = useState<'asc' | 'desc' | 'none'>('asc');
  const [locale, setLocale] = useState('en');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <label>
          Sort{' '}
          <Select aria-label="Sort" data={SORTS} value={sort} onValueChange={(value) => value != null && setSort(value as 'asc' | 'desc' | 'none')} />
        </label>
        <label>
          Locale{' '}
          <Select aria-label="Locale" data={LOCALES} value={locale} onValueChange={(value) => value != null && setLocale(String(value))} />
        </label>
      </div>
      <TreeView
        aria-label="Team"
        data={people}
        getItemId={(p) => p.id}
        getItemLabel={(p) => p.name}
        getParentId={(p) => p.managerId}
        sort={sort === 'none' ? null : sort}
        locale={locale}
        checkPropagation="none"
        checkable
        expanded={expanded}
        onExpandedChange={(e) => setExpanded(e.expanded)}
        selected={selected}
        onSelectedChange={(e) => setSelected(e.selected)}
        checked={checked}
        onCheckedChange={(e) => setChecked(e.checked)}
        height={300}
        style={{ maxInlineSize: 420 }}
      />
      <p style={{ margin: 0 }}>
        Expanded: <output>{expanded.join(', ') || 'none'}</output>
        <br />
        Selected: <output>{selected.join(', ') || 'none'}</output>
        <br />
        Onboarded (checked): <output>{checked.join(', ') || 'none'}</output>
      </p>
    </div>
  );
}
