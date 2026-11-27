'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Listbox, type ListboxDataSource, type ListboxKey, type ListboxQuery } from '@salmonui/dropdowns/listbox';
import { Spinner } from '@salmonui/notifications/spinner';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Ticket {
  id: number;
  label: string;
  status: 'open' | 'closed';
}

// Base query merged into every read.
const OPEN_ONLY: ListboxQuery = { filters: [{ columnId: 'status', operator: 'equal', value: 'open', predicate: 'and', source: 'api' }] };

const ALL: ListboxQuery = {};

// Accessors stay stable at module scope.
const ticketId = (t: Ticket) => t.id;

const TICKETS: Ticket[] = Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, label: `Ticket #${String(i + 1).padStart(4, '0')}`, status: i % 3 === 0 ? 'closed' : 'open' }));

// A fake remote endpoint with 400 ms of latency:
// it answers the requested `range`, applies the base `query` filter, and fails
// on demand so the error state and Retry can be tried.
function createTickets(push: (entry: string) => void, failNext: { current: boolean }): ListboxDataSource<Ticket> {
  return {
    read(request) {
      const status = request.query.filters?.find((f) => f.kind !== 'group' && f.columnId === 'status');
      const wanted = status && status.kind !== 'group' ? String(status.value) : null;
      const start = request.range?.start ?? 0;
      const end = request.range?.end ?? 50;
      push(`read ${start}–${end}${wanted ? ` (status = ${wanted})` : ''}`);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (failNext.current) {
            failNext.current = false;
            push('read failed');
            reject(new Error('The ticket service did not answer'));
            return;
          }
          const rows = wanted ? TICKETS.filter((t) => t.status === wanted) : TICKETS;
          resolve({ version: request.version, rows: rows.slice(start, end), totalRowCount: rows.length });
        }, 400);
        request.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    },
  };
}

export default function ListViewRemoteDemo() {
  const [log, push] = useEventLog(8);
  const [failNext] = useState(() => ({ current: false }));
  // Created once: a new source per render would restart the reads.
  const [tickets] = useState(() => createTickets(push, failNext));
  const [openOnly, setOpenOnly] = useState(false);
  const [value, setValue] = useState<ListboxKey | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12, maxInlineSize: 420 }}>
      <div className="demo-toolbar">
        <Checkbox checked={openOnly} onCheckedChange={(checked) => setOpenOnly(checked)}>
          Open tickets only
        </Checkbox>
        <Button variant="outline" onClick={() => (failNext.current = true)}>
          Fail the next read
        </Button>
      </div>
      <p id="listview-remote-label" className="salmon-field-label" style={{ margin: 0 }}>
        Tickets (2,000 on the server)
      </p>
      <Listbox<Ticket>
        key={openOnly ? 'open' : 'all'}
        aria-labelledby="listview-remote-label"
        data={tickets}
        query={openOnly ? OPEN_ONLY : ALL}
        getItemValue={ticketId}
        virtualization
        maxVisibleItems={7}
        value={value}
        onValueChange={(v) => setValue(v)}
        renderLoading={() => <Spinner size="sm" label="Loading tickets" />}
        renderError={({ error, retry }) => (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {error instanceof Error ? error.message : 'Failed to load'}
            <Button onClick={retry}>
              Retry
            </Button>
          </span>
        )}
        onLoadError={(error) => push(`onLoadError: ${error instanceof Error ? error.message : String(error)}`)}
      />
      <p style={{ margin: 0 }}>
        Selected: <output>{value === null ? 'none' : `#${String(value)}`}</output>
      </p>
      <EventLog entries={log} label="Remote reads" />
    </div>
  );
}
