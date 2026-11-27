'use client';
import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { ContextMenu, Menu, MenuItem, MenuSeparator, Submenu, type MenuSubmenuOpen } from '@salmonui/buttons/menu';
import { Select } from '@salmonui/dropdowns/select';

const SUBMENU_OPEN = [
  { value: 'hover', label: 'hover' },
  { value: 'click', label: 'click' },
];
const HOVER_DELAYS = [
  { value: 0, label: '0 ms' },
  { value: 200, label: '200 ms' },
  { value: 800, label: '800 ms' },
];

const symbols = Array.from({ length: 60 }, (_, index) => String.fromCodePoint(0x2190 + index));

const KBD = { marginInlineStart: 'auto', font: 'inherit', fontSize: 'var(--salmon-font-size-sm)', color: 'var(--salmon-text-secondary)' } as const;

function Entry(props: { label: string; hint: string; shortcut?: string }) {
  return (
    <span style={{ display: 'flex', gap: 16, alignItems: 'baseline', inlineSize: '100%' }}>
      <span style={{ display: 'grid' }}>
        <span>{props.label}</span>
        <small style={{ color: 'var(--salmon-text-secondary)' }}>{props.hint}</small>
      </span>
      {props.shortcut ? <kbd style={KBD}>{props.shortcut}</kbd> : null}
    </span>
  );
}

export default function ContextMenuEventsDemo() {
  const [submenuOpen, setSubmenuOpen] = useState<MenuSubmenuOpen>('hover');
  const [hoverDelay, setHoverDelay] = useState(200);
  const [keepOpen, setKeepOpen] = useState(false);
  const [selection, setSelection] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  const add = (entry: string) => setLog((list) => [entry, ...list].slice(0, 6));
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Submenus open on{' '}
          <Select aria-label="Submenus open on" data={SUBMENU_OPEN} value={submenuOpen} onValueChange={(value) => value != null && setSubmenuOpen(value as MenuSubmenuOpen)} />
        </label>
        <label>
          Hover delay{' '}
          <Select aria-label="Hover delay" data={HOVER_DELAYS} value={hoverDelay} onValueChange={(value) => value != null && setHoverDelay(Number(value))} disabled={submenuOpen === 'click'} />
        </label>
        <Checkbox checked={selection} onCheckedChange={(checked) => setSelection(checked)}>
          Text selected
        </Checkbox>
        <Checkbox checked={keepOpen} onCheckedChange={(checked) => setKeepOpen(checked)}>
          Refuse outside close
        </Checkbox>
      </div>
      <ContextMenu
        tabIndex={0}
        role="group"
        aria-label="Document"
        style={{ padding: 16, minBlockSize: 120, border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
        submenuOpen={submenuOpen}
        hoverDelay={hoverDelay}
        onOpenChange={(open, event) => add(`${open ? 'opened' : 'closed'} (reason ${event.reason}, ${event.source})`)}
        onBeforeClose={(event) => {
          if (keepOpen && event.reason === 'outside') {
            event.preventDefault();
            add('onBeforeClose refused an outside press');
          }
        }}
        onAction={(event) => add(`action ${event.id}`)}
        menu={
          <Menu aria-label="Document actions">
            {/* The application decides which entries render (no beforeItemRender). */}
            {selection ? (
              <MenuItem id="cut" textValue="Cut">
                <Entry label="Cut" hint="Move the selection to the clipboard" shortcut="Ctrl+X" />
              </MenuItem>
            ) : null}
            {selection ? (
              <MenuItem id="copy" textValue="Copy">
                <Entry label="Copy" hint="Copy the selection" shortcut="Ctrl+C" />
              </MenuItem>
            ) : null}
            <MenuItem id="paste" textValue="Paste">
              <Entry label="Paste" hint="Insert the clipboard" shortcut="Ctrl+V" />
            </MenuItem>
            <MenuSeparator />
            <Submenu label="Format">
              <MenuItem id="bold">Bold</MenuItem>
              <MenuItem id="italic">Italic</MenuItem>
              <Submenu label="Case">
                <MenuItem id="upper">UPPERCASE</MenuItem>
                <MenuItem id="lower">lowercase</MenuItem>
              </Submenu>
            </Submenu>
            <Submenu label="Insert symbol">
              {symbols.map((symbol) => (
                <MenuItem key={symbol} id={`symbol-${symbol}`} textValue={`U+${symbol.codePointAt(0)!.toString(16).toUpperCase()}`}>
                  {symbol} U+{symbol.codePointAt(0)!.toString(16).toUpperCase()}
                </MenuItem>
              ))}
            </Submenu>
          </Menu>
        }
      >
        Right-click here, long-press on touch, or focus this box and press Shift+F10.
      </ContextMenu>
      <div className="demo-log" aria-live="polite">
        {log.length ? (
          <ol>
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
        ) : (
          'Events appear here.'
        )}
      </div>
    </div>
  );
}
