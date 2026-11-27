'use client';
import { useState } from 'react';
import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator, Menubar, MenubarItem, MenubarMenu, Submenu } from '@salmonui/buttons/menu';
import { Select } from '@salmonui/dropdowns/select';

const HOVER_DELAYS = [
  { value: 0, label: '0 ms' },
  { value: 200, label: '200 ms' },
  { value: 800, label: '800 ms' },
];

const FILE_ICON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M4 1.5h5l3 3v10H4z" />
  </svg>
);

/** A label with its shortcut hint at the item's inline end. */
function Shortcut(props: { label: string; keys: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 24, inlineSize: '100%' }}>
      {props.label}
      <kbd style={{ marginInlineStart: 'auto', font: 'inherit', fontSize: 'var(--salmon-font-size-sm)', color: 'var(--salmon-text-secondary)' }}>{props.keys}</kbd>
    </span>
  );
}

export default function MenubarBasics() {
  const [open, setOpen] = useState<string | null>(null);
  const [last, setLast] = useState('nothing yet');
  const [hoverDelay, setHoverDelay] = useState(200);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="demo-toolbar">
        <label>
          Submenu hover delay{' '}
          <Select aria-label="Submenu hover delay" data={HOVER_DELAYS} value={hoverDelay} onValueChange={(value) => value != null && setHoverDelay(Number(value))} />
        </label>
      </div>
      <Menubar aria-label="Editor" value={open} onValueChange={setOpen} hoverDelay={hoverDelay} onAction={(event) => setLast(`${event.id} (${event.source})`)}>
        <MenubarMenu value="file" label="File" icon={FILE_ICON}>
          <Menu>
            <MenuItem id="new">New</MenuItem>
            <MenuItem id="open">Open…</MenuItem>
            <Submenu label="Open recent">
              <MenuItem id="recent-report">report.md</MenuItem>
              <MenuItem id="recent-notes">notes.txt</MenuItem>
            </Submenu>
            <MenuSeparator />
            <MenuItem id="close">Close</MenuItem>
          </Menu>
        </MenubarMenu>
        <MenubarMenu value="edit" label="Edit">
          <Menu>
            <MenuItem id="undo" textValue="Undo">
              <Shortcut label="Undo" keys="Ctrl+Z" />
            </MenuItem>
            <MenuItem id="redo" textValue="Redo">
              <Shortcut label="Redo" keys="Ctrl+Y" />
            </MenuItem>
          </Menu>
        </MenubarMenu>
        <MenubarMenu value="view" label="View">
          <Menu>
            <MenuCheckboxItem id="wrap" defaultChecked>
              Word wrap
            </MenuCheckboxItem>
          </Menu>
        </MenubarMenu>
        <MenubarItem id="save">Save</MenubarItem>
      </Menubar>
      <p style={{ margin: 0 }}>
        Open menu: {open ?? 'none'} · Last action: {last}
      </p>
      <div style={{ inlineSize: 240 }}>
        <Menubar aria-label="Scrolling" overflow="scroll">
          {['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map((label) => (
            <MenubarMenu key={label} label={label}>
              <MenuItem id={label.toLowerCase()}>{label} item</MenuItem>
            </MenubarMenu>
          ))}
        </Menubar>
      </div>
    </div>
  );
}
