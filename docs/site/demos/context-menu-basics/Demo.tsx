'use client';
import { useState } from 'react';
import { ContextMenu, Menu, MenuItem, MenuSeparator, Submenu } from '@salmonui/buttons/menu';

const SHAPE = {
  display: 'grid',
  placeItems: 'center',
  inlineSize: 72,
  blockSize: 72,
  fontSize: 'var(--salmon-font-size-sm)',
  color: 'var(--salmon-color-primary-text)',
  background: 'var(--salmon-color-primary-subtle)',
  border: '1px solid var(--salmon-color-primary-border)',
} as const;

export default function ContextMenuBasics() {
  const [shape, setShape] = useState<string | null>(null);
  const [last, setLast] = useState('nothing yet');
  return (
    <div>
      <ContextMenu
        tabIndex={0}
        role="group"
        aria-label="Canvas"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: 16, minBlockSize: 140, boxSizing: 'border-box', border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
        onBeforeOpen={(event) => {
          if (event.target.closest('[data-native]')) {
            event.preventDefault();
            return;
          }
          setShape(event.target.closest('[data-shape]')?.getAttribute('data-shape') ?? null);
        }}
        onAction={(event) => setLast(`${event.id} (${event.source})`)}
        menu={
          <Menu aria-label="Canvas actions">
            {shape ? <MenuItem id={`delete-${shape}`}>Delete {shape}</MenuItem> : null}
            <MenuItem id="cut">Cut</MenuItem>
            <MenuItem id="copy">Copy</MenuItem>
            <MenuItem id="paste" disabled>
              Paste
            </MenuItem>
            <MenuSeparator />
            <Submenu label="Arrange">
              <MenuItem id="front">Bring to front</MenuItem>
              <MenuItem id="back">Send to back</MenuItem>
            </Submenu>
          </Menu>
        }
      >
        <span data-shape="circle" style={{ ...SHAPE, borderRadius: '50%' }}>
          Circle
        </span>
        <span data-shape="square" style={{ ...SHAPE, borderRadius: 'var(--salmon-radius-sm)' }}>
          Square
        </span>
        <span data-native="" style={{ padding: '8px 12px', border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-md)', color: 'var(--salmon-text-secondary)' }}>
          Right-click here for the browser menu
        </span>
      </ContextMenu>
      <p className="demo-status">Right-click a shape or the empty canvas. Last action: {last}</p>
    </div>
  );
}
