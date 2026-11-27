'use client';
import { useRef, useState } from 'react';
import { Kanban, KanbanColumn, type KanbanDropTarget, type KanbanKey, type KanbanSwimlanes } from '@salmonui/kanban';

interface Issue {
  id: number;
  title: string;
  state: string;
  owner?: string;
  ownerName?: string;
}

const ISSUES: readonly Issue[] = [
  {
    id: 1,
    title: 'Login rate limit',
    state: 'open',
    owner: 'ana',
    ownerName: 'Ana',
  },
  {
    id: 2,
    title: 'Export to CSV',
    state: 'doing',
    owner: 'ana',
    ownerName: 'Ana',
  },
  {
    id: 3,
    title: 'Session timeout banner',
    state: 'doing',
    owner: 'ana',
    ownerName: 'Ana',
  },
  {
    id: 4,
    title: 'Dark mode chart colors',
    state: 'open',
    owner: 'ben',
    ownerName: 'Ben',
  },
  {
    id: 5,
    title: 'Upgrade build tooling',
    state: 'doing',
    owner: 'ben',
    ownerName: 'Ben',
  },
  {
    id: 6,
    title: 'Invoice PDF layout',
    state: 'done',
    owner: 'ben',
    ownerName: 'Ben',
  },
  { id: 7, title: 'Triage new reports', state: 'open' },
];

const LANES: KanbanSwimlanes = {
  field: 'owner',
  labelField: 'ownerName',
  lanes: [
    { key: 'ana', label: 'Ana' },
    { key: 'ben', label: 'Ben' },
    { key: 'chen', label: 'Chen' },
  ],
  showEmpty: true,
  sticky: true,
  draggable: true,
};

export default function KanbanSwimlanesDemo() {
  const archive = useRef<HTMLDivElement>(null);
  const [archived, setArchived] = useState<readonly string[]>([]);
  const [order, setOrder] = useState<readonly KanbanKey[]>(['open', 'doing', 'done']);
  const [collapsed, setCollapsed] = useState<readonly KanbanKey[]>([]);

  const targets: readonly KanbanDropTarget<Issue>[] = [
    {
      ref: archive,
      accept: (cards) => cards.every((c) => c.state === 'done'),
      onDrop: (e) => setArchived((list) => [...list, ...e.cards.map((c) => c.title)]),
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Kanban
        aria-label="Issues by owner"
        data={ISSUES}
        getCardId={(i) => i.id}
        columnField="state"
        card={{ headerField: 'title' }}
        swimlanes={LANES}
        limitScope="swimlane"
        cardsDraggable
        dropTargets={targets}
        columnsReorderable
        columnOrder={order}
        onColumnOrderChange={(value) => setOrder(value)}
        collapsedColumns={collapsed}
        onCollapsedColumnsChange={(value) => setCollapsed(value)}
        height={460}
      >
        <KanbanColumn columnKey="open" header="Open" collapsible />
        <KanbanColumn columnKey="doing" header="Doing" max={1} collapsible />
        <KanbanColumn columnKey="done" header="Done" collapsible allowedTargets={['done']} />
      </Kanban>
      <div
        ref={archive}
        style={{
          padding: 12,
          border: '1px dashed var(--salmon-border-default)',
          borderRadius: 'var(--salmon-radius-lg)',
        }}
        aria-label="Archive"
        role="region"
      >
        <strong>Archive</strong> (drop Done cards here): <output>{archived.length ? archived.join(', ') : 'empty'}</output>
      </div>
      <p>
        Column order: <output>{order.join(' → ')}</output>
      </p>
    </div>
  );
}
