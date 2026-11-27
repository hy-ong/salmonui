'use client';

// Lazy chunk of MarkdownEditor: the heading menu and the toolbar overflow
// menu (APG Menu Button). Composes the public Menu of `@salmonui/buttons/menu`
// in the shared overlay primitive; loaded on first open, never on the server.

import type { ReactElement, RefObject } from 'react';
import { Menu, type MenuItemData } from '@salmonui/buttons/menu';
import { Overlay } from '@salmonui/core/internal/overlay';

export interface ToolbarMenuProps {
  readonly id: string;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly label: string;
  readonly items: readonly MenuItemData[];
  readonly container: Element | null;
  readonly dir: string;
  readonly onAction: (id: string, source: 'pointer' | 'keyboard' | 'touch' | 'api') => void;
  readonly onClose: () => void;
}

export default function ToolbarMenu(props: ToolbarMenuProps): ReactElement {
  return (
    <Overlay
      anchor={props.anchor}
      container={props.container}
      dir={props.dir}
      className="salmon-markdown-editor-menu"
      placement="bottom-start"
      offset={4}
      insideRefs={[props.anchor]}
      onDismiss={() => props.onClose()}
      // Escape returns focus to the menu's toolbar button (APG Menu Button), even after a pointer open.
      focus={{ autoFocus: 'first', restoreFocus: props.anchor }}
    >
      <Menu
        id={props.id}
        items={props.items}
        aria-label={props.label}
        onAction={(event) => {
          props.onAction(event.id, event.source);
          props.onClose();
        }}
      />
    </Overlay>
  );
}
