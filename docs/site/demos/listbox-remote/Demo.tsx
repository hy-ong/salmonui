'use client';

import { useMemo, useRef, useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Listbox, type ListboxKey, type ListboxQuery } from '@salmonui/dropdowns/listbox';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createDemoListSource } from '../../lib/demo-list-source';

interface Customer {
  readonly value: number;
  readonly label: string;
  readonly email: string;
  readonly active: boolean;
}

const FIRST = ['Ana', 'Ben', 'Chloé', 'Dario', 'Eva', 'Femi', 'Grace', 'Hugo', 'Ines', 'Jonas', 'Kofi', 'Lena', 'Marco', 'Nadia', 'Omar', 'Priya'];
const LAST = ['Álvarez', 'Berg', 'Costa', 'Dubois', 'Engel', 'Fischer', 'García', 'Holm', 'Ito', 'Jensen', 'Kim', 'López', 'Müller', 'Novak', 'Okafor', 'Peña'];

// 5,000 customers on the "server"; every third one is inactive.
const CUSTOMERS: Customer[] = Array.from({ length: 5_000 }, (_, i) => {
  const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
  return { value: i + 1, label: `${name} ${i + 1}`, email: `customer${i + 1}@example.com`, active: i % 3 !== 0 };
});

const ACTIVE_ONLY: ListboxQuery = { filters: [{ columnId: 'active', operator: 'equal', value: true, predicate: 'and', source: 'api' }], sorting: [{ columnId: 'label', direction: 'asc' }] };
const EVERYONE: ListboxQuery = { sorting: [{ columnId: 'label', direction: 'asc' }] };

export default function ListboxRemoteDemo() {
  const [log, push] = useEventLog();
  const failNext = useRef(false);
  const [failChecked, setFailChecked] = useState(false);
  // Created once: a new source per render would restart every read.
  const [source] = useState(() =>
    createDemoListSource<Customer>({
      rows: CUSTOMERS,
      log: push,
      shouldFail: () => {
        const fail = failNext.current;
        failNext.current = false;
        if (fail) setFailChecked(false);
        return fail;
      },
    }),
  );
  const [activeOnly, setActiveOnly] = useState(true);
  const [matchCase, setMatchCase] = useState(false);
  const [value, setValue] = useState<ListboxKey | null>(null);
  const query = useMemo(() => (activeOnly ? ACTIVE_ONLY : EVERYONE), [activeOnly]);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <div role="group" aria-label="Request options" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <Checkbox checked={activeOnly} onCheckedChange={(checked) => setActiveOnly(checked)}>
          Active customers only (<code>query</code>)
        </Checkbox>
        <Checkbox checked={matchCase} onCheckedChange={(checked) => setMatchCase(checked)}>
          Match case
        </Checkbox>
        <Checkbox
          checked={failChecked}
          onCheckedChange={(checked) => {
            failNext.current = checked;
            setFailChecked(checked);
          }}
        >
          Fail the next read
        </Checkbox>
      </div>
      <span id="listbox-remote-label">Customer (5,000 on the server)</span>
      <Listbox<Customer>
        data={source}
        searchable
        searchOperator="contains"
        searchFields={['label', 'email']}
        searchPlaceholder="Search name or e-mail (2+ characters)"
        minSearchLength={2}
        debounce={300}
        matchCase={matchCase}
        query={query}
        maxVisibleItems={7}
        aria-labelledby="listbox-remote-label"
        value={value}
        onValueChange={(next) => setValue(next)}
        onLoadError={(error) => push(`onLoadError: ${error instanceof Error ? error.message : String(error)}`)}
      />
      <p>
        Value: <output>{String(value)}</output>
      </p>
      <EventLog entries={log} label="Requests" />
    </div>
  );
}
