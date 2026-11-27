'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { MenuButton, MenuItem, MenuSeparator, type MenuOpenChangeEvent } from '@salmonui/buttons/menu';

const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blackberry', 'Blueberry', 'Cherry'];

interface Readout {
  readonly expanded: string;
  readonly controls: string;
  readonly dataOpen: string;
  readonly popup: string;
  readonly roles: string;
  readonly menus: number;
}

// The readout as a two-column label / value list.
const DL: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 16px', margin: 0 };
const DT: CSSProperties = { color: 'var(--salmon-text-secondary)' };
const DD: CSSProperties = { margin: 0, overflowWrap: 'anywhere' };

const INITIAL: Readout = { expanded: 'false', controls: '(absent)', dataOpen: '(absent)', popup: '(none)', roles: '(none)', menus: 0 };

// A controlled menu with a veto, an onOpenChange log, and a readout of the
// rendered ARIA read from the DOM after each change (not echoed from state).
export default function MenuOpenStateDemo() {
  const [open, setOpen] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  const [chosen, setChosen] = useState('nothing yet');
  const [readout, setReadout] = useState<Readout>(INITIAL);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const onOpenChange = (next: boolean, event: MenuOpenChangeEvent) => {
    const vetoed = !next && keepOpen && event.reason === 'outside';
    setLog((entries) => [`${next ? 'open' : 'close'}: reason ${event.reason}, source ${event.source}${vetoed ? ' (vetoed)' : ''}`, ...entries].slice(0, 6));
    if (!vetoed) setOpen(next);
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const controls = trigger.getAttribute('aria-controls');
      const popup = controls ? document.getElementById(controls) : null;
      const roles = popup ? [...new Set([...popup.querySelectorAll('[role]')].map((el) => el.getAttribute('role')))].join(', ') : '(none)';
      setReadout({
        expanded: trigger.getAttribute('aria-expanded') ?? '(absent)',
        controls: controls ? 'the popup id' : '(absent)',
        dataOpen: trigger.hasAttribute('data-open') ? 'present' : '(absent)',
        popup: popup ? `role="${popup.getAttribute('role')}", labelled by the trigger: ${String(popup.getAttribute('aria-labelledby') === trigger.id)}` : '(none)',
        roles,
        menus: document.querySelectorAll(`[role="menu"][aria-labelledby="${CSS.escape(trigger.id)}"]`).length,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div>
      <div className="demo-toolbar">
        <MenuButton
          ref={triggerRef}
          open={open}
          onOpenChange={onOpenChange}
          onAction={(event) => setChosen(event.id)}
          menu={
            <>
              {FRUITS.map((fruit) => (
                <MenuItem key={fruit} id={fruit.toLowerCase()}>
                  {fruit}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem id="durian" disabled>
                Durian
              </MenuItem>
              <MenuItem id="elderberry">Elderberry</MenuItem>
            </>
          }
        >
          Fruit
        </MenuButton>
        <Checkbox checked={keepOpen} onCheckedChange={(checked) => setKeepOpen(checked)}>
          Keep open on outside press
        </Checkbox>
      </div>
      <p>
        Chosen: <output>{chosen}</output>
      </p>
      <dl style={DL}>
        <dt style={DT}>Trigger aria-expanded</dt>
        <dd style={DD}>{readout.expanded}</dd>
        <dt style={DT}>Trigger aria-controls</dt>
        <dd style={DD}>{readout.controls}</dd>
        <dt style={DT}>Trigger data-open</dt>
        <dd style={DD}>{readout.dataOpen}</dd>
        <dt style={DT}>Popup</dt>
        <dd style={DD}>{readout.popup}</dd>
        <dt style={DT}>Roles inside the popup</dt>
        <dd style={DD}>{readout.roles}</dd>
        <dt style={DT}>Menus for this trigger in the page</dt>
        <dd style={DD}>{readout.menus}</dd>
      </dl>
      <div className="demo-log">
        <ol aria-label="onOpenChange log (newest first)">
          {log.map((entry, index) => (
            <li key={log.length - index}>{entry}</li>
          ))}
        </ol>
        {log.length === 0 ? 'Open or close the menu to log onOpenChange.' : null}
      </div>
    </div>
  );
}
