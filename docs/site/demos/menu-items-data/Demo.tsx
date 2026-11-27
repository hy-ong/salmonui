'use client';

import { useState } from 'react';
import { MenuButton, type MenuItemData } from '@salmonui/buttons/menu';

const Icon = ({ d }: { readonly d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const PLUS = 'M8 3v10M3 8h10';
const COPY = 'M5 5h8v8H5zM3 11V3h8';
const TRASH = 'M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10';

const STATUS: MenuItemData[] = [
  { id: 'todo', label: 'To do', textValue: 'To do' },
  { id: 'doing', label: 'In progress', textValue: 'In progress' },
  { id: 'done', label: 'Done', textValue: 'Done' },
];

const COUNTS: Record<string, number> = { todo: 12, doing: 4, done: 31 };

// The data form with icons, a renderItem template, the trigger's tone /
// variant / size / iconStart, custom and hidden indicators and a wider popup.
export default function MenuItemsDataDemo() {
  const [last, setLast] = useState('nothing yet');
  const onAction = (event: { id: string; item: MenuItemData | undefined }) => setLast(`id "${event.id}"${event.item ? `, label "${String(event.item.label)}"` : ''}`);
  return (
    <div>
      <div className="demo-toolbar">
        <MenuButton
          tone="primary"
          size="sm"
          iconStart={<Icon d={PLUS} />}
          onAction={onAction}
          items={[
            { id: 'new-task', label: 'Task', icon: <Icon d={PLUS} /> },
            { id: 'duplicate', label: 'Duplicate selected', icon: <Icon d={COPY} /> },
            { type: 'separator' },
            { id: 'delete', label: 'Delete selected', icon: <Icon d={TRASH} />, disabled: true },
          ]}
        >
          New
        </MenuButton>
        <MenuButton
          variant="outline"
          size="sm"
          items={STATUS}
          onAction={onAction}
          styles={{ menu: { minInlineSize: 240 } }}
          renderItem={(item) => (
            <span style={{ display: 'flex', justifyContent: 'space-between', inlineSize: '100%', gap: 16 }}>
              <span>{item.label}</span>
              <span aria-hidden="true">{item.id ? COUNTS[item.id] : null}</span>
            </span>
          )}
          indicator={<span aria-hidden="true">▾</span>}
        >
          Status
        </MenuButton>
        <MenuButton variant="ghost" size="sm" tone="danger" indicator={false} items={[{ id: 'archive', label: 'Archive project' }, { id: 'remove', label: 'Remove project' }]} onAction={onAction}>
          Danger zone
        </MenuButton>
      </div>
      <p>
        Last action: <output>{last}</output>
      </p>
    </div>
  );
}
