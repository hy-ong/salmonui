'use client';

// Lazy chunk of `overflow="menu"`: the hidden tabs as a Buttons `Menu`
// (public `@salmonui/buttons/menu` entry, a composition edge) in a positioned,
// dismissable overlay. Loaded on the first open of the "More tabs" menu.

import type { ReactElement, RefObject } from 'react';
import { Overlay } from '@salmonui/core/internal/overlay';
import { Menu, MenuItem } from '@salmonui/buttons/menu';
import type { TabsOverflowEntry, TabsSource } from './types.js';

export interface TabsOverflowMenuProps {
  readonly id: string;
  readonly label: string;
  readonly anchorRef: RefObject<HTMLButtonElement | null>;
  readonly entries: readonly TabsOverflowEntry[];
  readonly onSelect: (value: string, source: TabsSource) => void;
  readonly onClose: () => void;
}

export default function TabsOverflowMenu(props: TabsOverflowMenuProps): ReactElement {
  const { id, label, anchorRef, entries, onSelect, onClose } = props;
  return (
    <Overlay anchor={anchorRef} placement="bottom-end" className="salmon-tabs-menu-layer" insideRefs={[anchorRef]} onDismiss={onClose} focus={{ onTab: onClose }}>
      <Menu
        id={id}
        aria-label={label}
        onAction={(event) => onSelect(event.id, event.source)}
      >
        {entries.map((entry) => (
          <MenuItem key={entry.value} id={entry.value} disabled={entry.disabled}>
            {entry.label}
          </MenuItem>
        ))}
      </Menu>
    </Overlay>
  );
}
