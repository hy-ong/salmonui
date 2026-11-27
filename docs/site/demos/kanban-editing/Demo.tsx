'use client';
import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Kanban, type KanbanApi, type KanbanColumnDef, type KanbanDataSource, type KanbanEditorField } from '@salmonui/kanban';

interface Ticket {
  id: string;
  title: string;
  notes: string;
  status: string;
  points: number;
}

const COLUMNS: readonly KanbanColumnDef[] = [
  { key: 'todo', header: 'To do', addButton: true },
  { key: 'doing', header: 'Doing', addButton: true, max: 3 },
  { key: 'done', header: 'Done' },
];

const FIELDS: readonly KanbanEditorField<Ticket>[] = [
  { field: 'title', label: 'Title', kind: 'text', required: true },
  { field: 'notes', label: 'Notes', kind: 'textarea' },
  {
    field: 'status',
    label: 'Status',
    kind: 'select',
    options: [
      { value: 'todo', label: 'To do' },
      { value: 'doing', label: 'Doing' },
      { value: 'done', label: 'Done' },
    ],
  },
  {
    field: 'points',
    label: 'Points',
    kind: 'number',
    validate: (value) => (typeof value === 'number' && value >= 0 && value <= 13 ? null : 'Points must be between 0 and 13'),
  },
];

const SEED: readonly Ticket[] = [
  {
    id: 'K-1',
    title: 'Write onboarding guide',
    notes: 'Cover install and theming.',
    status: 'todo',
    points: 3,
  },
  {
    id: 'K-2',
    title: 'Fix focus ring in dark mode',
    notes: '',
    status: 'doing',
    points: 1,
  },
  {
    id: 'K-3',
    title: 'Benchmark card drag',
    notes: 'Record p95 frame time.',
    status: 'doing',
    points: 5,
  },
  {
    id: 'K-4',
    title: 'Publish 1.0 notes',
    notes: '',
    status: 'done',
    points: 2,
  },
];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** An in-memory backend with latency; writes fail while `failing` is set. */
function createTicketSource(failing: { current: boolean }): KanbanDataSource<Ticket> {
  let rows = [...SEED];
  return {
    async read(request) {
      await delay(600);
      return { version: request.version, rows };
    },
    async write(request) {
      await delay(400);
      if (failing.current) return { version: request.version, status: 'rejected' };
      const deleted = new Set(request.deleted.map((d) => d.rowId));
      const changed = new Map(request.changed.map((c) => [c.rowId, c.row]));
      rows = [...rows.filter((r) => !deleted.has(r.id)).map((r) => changed.get(r.id) ?? r), ...request.added.map((a) => a.row)];
      return { version: request.version, status: 'applied' };
    },
  };
}

export default function KanbanEditingDemo() {
  const api = useRef<KanbanApi>(null);
  const failing = useRef(false);
  const [nextId, setNextId] = useState(SEED.length + 1);
  const [source] = useState(() => createTicketSource(failing));
  const [fail, setFail] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  const note = (line: string) => setLog((list) => [line, ...list].slice(0, 4));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <Button variant="outline" onClick={() => api.current?.openEditor('new', { columnKey: 'todo' })}>
          New ticket
        </Button>
        <Checkbox
          checked={fail}
          onCheckedChange={(checked) => {
            failing.current = checked;
            setFail(checked);
          }}
        >
          Reject writes
        </Checkbox>
      </div>
      <Kanban
        ref={api}
        aria-label="Tickets"
        data={source}
        getCardId={(t) => t.id}
        columnField="status"
        columns={COLUMNS}
        card={{ headerField: 'title', contentField: 'notes' }}
        renderCard={({ card }) => (
          <>
            <strong>{card.title}</strong>
            {card.notes ? <p style={{ margin: '4px 0 0' }}>{card.notes}</p> : null}
            <small style={{ display: 'block', marginTop: 4, color: 'var(--salmon-text-secondary)' }}>
              {card.points} {card.points === 1 ? 'point' : 'points'}
            </small>
          </>
        )}
        cardsDraggable
        editor={{ fields: FIELDS }}
        // Pure: called while the editor renders; the id advances once the add is committed.
        newCard={(at) => ({
          id: `K-${nextId}`,
          title: '',
          notes: '',
          status: String(at.columnKey),
          points: 1,
        })}
        onCardChange={(e) => {
          if (e.kind === 'add') setNextId((n) => n + 1);
          note(`${e.kind} ${e.card.id} (${e.source})`);
        }}
        onDataError={(_, kind) => note(`${kind} failed: the change was reverted`)}
      />
      <ul aria-label="Change log" style={{ margin: 0 }}>
        {log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>No changes yet</li>}
      </ul>
    </div>
  );
}
