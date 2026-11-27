'use client';
import { useState } from 'react';
import { MenuButton, MenuGroup, MenuItem, MenuSeparator, Submenu, type MenuItemData } from '@salmonui/buttons/menu';

const editItems: MenuItemData[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'copy', label: 'Copy' },
  { id: 'paste', label: 'Paste', disabled: true },
  { type: 'separator' },
  { id: 'find', label: 'Find', items: [{ id: 'find-next', label: 'Find next' }, { id: 'replace', label: 'Replace…' }] },
];

export default function MenuButtonDemo() {
  const [last, setLast] = useState('nothing yet');
  return (
    <div>
      <div className="demo-toolbar">
        <MenuButton
          tone="primary"
          onAction={(event) => setLast(`${event.id} (${event.source})`)}
          menu={
            <>
              <MenuItem id="new">New file</MenuItem>
              <MenuItem id="open">Open…</MenuItem>
              <MenuItem id="docs" href="#menu-button">
                Documentation
              </MenuItem>
              <MenuSeparator />
              <Submenu label="Export">
                <MenuItem id="pdf">PDF</MenuItem>
                <MenuItem id="csv">CSV</MenuItem>
              </Submenu>
              <MenuSeparator />
              <MenuGroup label="Recent">
                <MenuItem id="report">report.xlsx</MenuItem>
                <MenuItem id="notes">notes.md</MenuItem>
              </MenuGroup>
            </>
          }
        >
          File
        </MenuButton>
        <MenuButton variant="outline" items={editItems} placement="bottom-end" onAction={(event) => setLast(`${event.id} (${event.source})`)}>
          Edit
        </MenuButton>
      </div>
      <p>
        Last action: <output>{last}</output>
      </p>
    </div>
  );
}
