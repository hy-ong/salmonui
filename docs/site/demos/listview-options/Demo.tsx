'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Listbox, type ListboxKey } from '@salmonui/dropdowns/listbox';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Folder {
  value: string;
  label: string;
  unread: number;
}

const FOLDERS: Folder[] = [
  { value: 'inbox', label: 'Inbox', unread: 12 },
  { value: 'drafts', label: 'Drafts', unread: 0 },
  { value: 'sent', label: 'Sent', unread: 0 },
  { value: 'archive', label: 'Archive', unread: 0 },
  { value: 'spam', label: 'Spam', unread: 3 },
  { value: 'trash', label: 'Trash', unread: 0 },
  { value: 'receipts', label: 'Receipts', unread: 1 },
  { value: 'travel', label: 'Travel', unread: 0 },
];

// 16 px outline icons (paths in a 16 x 16 box), drawn in the item's text color.
const ICONS: Record<string, string> = {
  inbox: 'M2 9.5h3.5l1 1.5h3l1-1.5H14M3.5 3h9L14 9.5V13H2V9.5z',
  drafts: 'M10.5 2.5l3 3L6 13H3v-3z M9 4l3 3',
  sent: 'M2 8l12-5.5L10.5 14 8 9z M8 9l6-6.5',
  archive: 'M2 3h12v3H2z M3 6v7h10V6 M6.5 8.5h3',
  spam: 'M8 2a6 6 0 1 0 0 12A6 6 0 1 0 8 2z M3.8 3.8l8.4 8.4',
  trash: 'M2.5 4h11 M6 4V2.5h4V4 M4 4l.7 9.5h6.6L12 4',
  receipts: 'M3.5 2h9v12l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z M6 5.5h4 M6 8h4',
  travel: 'M14 8l-5.5-1.5L6.5 2H5l1 4.5-3 .5-1-1.5H1L2 8l-1 2.5h1l1-1.5 3 .5-1 4.5h1.5l2-4.5z',
};

// Module-scope accessors stay stable across renders.
const icon = (f: Folder) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round">
    <path d={ICONS[f.value]} />
  </svg>
);
const itemProps = (f: Folder) => (f.unread > 0 ? { className: 'demo-listbox-unread', 'data-unread': f.unread, title: `${f.unread} unread` } : undefined);

// A Listbox with item icons, per-item attributes, single selection and
// a fixed height; the controls switch `disabled` and RTL.
export default function ListViewOptionsDemo() {
  const [folder, setFolder] = useState<ListboxKey | null>('inbox');
  const [disabled, setDisabled] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [log, push] = useEventLog(6);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="demo-toolbar">
        <Checkbox checked={disabled} onCheckedChange={(checked) => setDisabled(checked)}>
          Disabled
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'grid', gap: 8 }}>
        <p id="listview-options-label" className="salmon-field-label" style={{ margin: 0 }}>
          Folders
        </p>
        <Listbox<Folder>
          aria-labelledby="listview-options-label"
          data={FOLDERS}
          getItemIcon={icon}
          getItemProps={itemProps}
          maxVisibleItems={5}
          style={{ inlineSize: 240 }}
          disabled={disabled}
          name="folder"
          value={folder}
          onValueChange={(value, event) => {
            setFolder(value);
            push(`${event.reason} ${String(value)} (${event.source}); item: ${event.items[0]?.label ?? 'none'}`);
          }}
        />
        <p style={{ margin: 0 }}>
          Folder: <output>{String(folder)}</output>
        </p>
      </div>
      <EventLog entries={log} label="Selection events" />
    </div>
  );
}
