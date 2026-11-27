'use client';

import { useState } from 'react';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createDemoListSource } from '../../lib/demo-list-source';

interface Status {
  readonly value: string;
  readonly label: string;
  readonly color: string;
}

const STATUSES: Status[] = [
  { value: 'todo', label: 'To do', color: 'var(--salmon-color-info)' },
  { value: 'doing', label: 'In progress', color: 'var(--salmon-color-warning)' },
  { value: 'review', label: 'In review', color: 'var(--salmon-color-primary)' },
  { value: 'done', label: 'Done', color: 'var(--salmon-color-success)' },
  { value: 'blocked', label: 'Blocked', color: 'var(--salmon-color-danger)' },
];
const statusIcon = (status: Status) => <span aria-hidden="true" style={{ display: 'inline-block', inlineSize: 10, blockSize: 10, borderRadius: '50%', background: status.color }} />;

const WORDS = ['Amber', 'Birch', 'Cedar', 'Dune', 'Ember', 'Fjord', 'Glade', 'Harbor', 'Iris', 'Juniper', 'Kestrel', 'Lagoon', 'Meadow', 'Nectar', 'Orchid', 'Prairie', 'Quartz', 'Ridge', 'Sierra', 'Tundra', 'Umber', 'Valley', 'Willow', 'Xenon', 'Yarrow', 'Zephyr'];
// 10,010 labels in alphabetical order: "Willow 001" sits near the end of the virtual list.
const CODES = WORDS.flatMap((word) => Array.from({ length: 385 }, (_, i) => `${word} ${String(i + 1).padStart(3, '0')}`));

interface Country {
  readonly value: string;
  readonly label: string;
}
const COUNTRIES: Country[] = [
  ['AR', 'Argentina'], ['BR', 'Brazil'], ['CA', 'Canada'], ['DE', 'Germany'], ['EG', 'Egypt'], ['ES', 'Spain'], ['FR', 'France'], ['GH', 'Ghana'],
  ['IN', 'India'], ['IS', 'Iceland'], ['JP', 'Japan'], ['KE', 'Kenya'], ['MX', 'Mexico'], ['NO', 'Norway'], ['NZ', 'New Zealand'], ['PE', 'Peru'],
  ['PL', 'Poland'], ['SE', 'Sweden'], ['TR', 'Türkiye'], ['VN', 'Viet Nam'],
].map(([value, label]) => ({ value: value as string, label: label as string }));

export default function DropdownPopupDemo() {
  const [log, push] = useEventLog();
  // Created once; the "server" answers after 600 ms.
  const [countries] = useState(() => createDemoListSource<Country>({ rows: COUNTRIES, latency: 600, log: push }));
  const logOpen = (name: string) => (open: boolean, event: { readonly reason: string; readonly source: string }) => push(`${name}: ${open ? 'open' : 'close'} (reason ${event.reason}, source ${event.source})`);
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="dd-popup-status">Status (icons, 3 rows tall, a wider popup)</span>
        <Select
          aria-labelledby="dd-popup-status"
          style={{ maxInlineSize: 220 }}
          data={STATUSES}
          getItemIcon={statusIcon}
          defaultValue="doing"
          maxVisibleItems={3}
          styles={{ popup: { minInlineSize: 320 } }}
          onOpenChange={logOpen('Status')}
        />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="dd-popup-code">Code (10,010 items; type a letter on the closed Select)</span>
        <Select aria-labelledby="dd-popup-code" style={{ maxInlineSize: 260 }} data={CODES} placeholder="Type W, then i" onOpenChange={logOpen('Code')} />
      </div>
      <div style={{ display: 'grid', gap: 4, maxWidth: 260 }}>
        <span id="dd-popup-word">Word (typing filters)</span>
        <Combobox aria-labelledby="dd-popup-word" data={WORDS} placeholder="Type to filter" onOpenChange={logOpen('Word')} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'grid', gap: 4, minInlineSize: 200 }}>
          <span id="dd-popup-remote-known">Country (remote, label from selectedItems)</span>
          <Select aria-labelledby="dd-popup-remote-known" data={countries} defaultValue="JP" selectedItems={[{ value: 'JP', label: 'Japan' }]} />
        </div>
        <div style={{ display: 'grid', gap: 4, minInlineSize: 200 }}>
          <span id="dd-popup-remote-read">Country (remote, label read after mount)</span>
          <Select aria-labelledby="dd-popup-remote-read" data={countries} defaultValue="IS" />
        </div>
      </div>
      <div dir="rtl" lang="ar" style={{ display: 'grid', gap: 4, maxWidth: 260 }}>
        <span id="dd-popup-rtl">الحالة (right to left)</span>
        <Select aria-labelledby="dd-popup-rtl" data={STATUSES} getItemIcon={statusIcon} defaultValue="todo" onOpenChange={logOpen('RTL status')} />
      </div>
      <EventLog entries={log} />
    </div>
  );
}
