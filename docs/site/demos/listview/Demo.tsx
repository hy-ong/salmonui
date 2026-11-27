'use client';

import { useState } from 'react';
import { Avatar } from '@salmonui/layout/avatar';
import { Listbox, type ListboxKey } from '@salmonui/dropdowns/listbox';

interface Contact {
  id: number;
  name: string;
  team: string;
  email: string;
  away?: boolean;
}

// A Listbox with groups, an item template, tooltips and checkboxes:
// accessors read the item fields, `renderItem` renders each item.
const contacts: Contact[] = [
  { id: 1, name: 'Ada Lovelace', team: 'Engineering', email: 'ada@example.com' },
  { id: 2, name: 'Alan Turing', team: 'Engineering', email: 'alan@example.com' },
  { id: 3, name: 'Edsger Dijkstra', team: 'Engineering', email: 'edsger@example.com', away: true },
  { id: 4, name: 'Grace Hopper', team: 'Operations', email: 'grace@example.com' },
  { id: 5, name: 'Barbara Liskov', team: 'Operations', email: 'barbara@example.com' },
];

export default function ListViewDemo() {
  const [checked, setChecked] = useState<readonly ListboxKey[]>([1, 4]);
  return (
    <div style={{ display: 'grid', gap: 12, maxInlineSize: 360 }}>
      <Listbox
        aria-label="Contacts"
        data={contacts}
        getItemValue={(c) => c.id}
        getItemLabel={(c) => c.name}
        getItemGroup={(c) => c.team}
        isItemDisabled={(c) => c.away === true}
        getItemProps={(c) => ({ title: c.email })}
        renderItem={({ label }) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Avatar name={label} size="xs" shape="circle" />
            {label}
          </span>
        )}
        multiple
        indicator="checkbox"
        showSelectAll
        value={checked}
        onValueChange={setChecked}
      />
      <p style={{ margin: 0 }}>Checked: {checked.length}</p>
    </div>
  );
}
