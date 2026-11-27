'use client';
import { useMemo, useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Kanban, type KanbanColumnDef, type KanbanColumnGroup, type KanbanKey, type KanbanSort } from '@salmonui/kanban';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';

interface Task {
  id: string;
  title: string;
  summary: string;
  status: string;
  priority: number;
  tags: string;
  color: string;
}

const columnsFor = (hideBacklog: boolean): readonly KanbanColumnDef[] => [
  { key: 'backlog', header: 'Backlog', hidden: hideBacklog },
  { key: 'todo', header: 'To do', max: 4 },
  { keys: ['doing', 'review'], header: 'In progress', min: 1, max: 3 },
  { key: 'done', header: 'Done' },
];

const GROUPS: readonly KanbanColumnGroup[] = [
  { header: 'Planned', columns: ['backlog', 'todo'] },
  { header: 'Active', columns: ['doing', 'done'] },
];

const TASKS: readonly Task[] = [
  {
    id: 'T-1',
    title: 'Audit color tokens',
    summary: 'List every --salmon-* variable in use.',
    status: 'backlog',
    priority: 3,
    tags: 'theme',
    color: '#7c3aed',
  },
  {
    id: 'T-2',
    title: 'Keyboard drag spec',
    summary: 'Space lifts, arrows move, Space drops.',
    status: 'todo',
    priority: 1,
    tags: 'a11y,drag',
    color: '#dc2626',
  },
  {
    id: 'T-3',
    title: 'SSR snapshot tests',
    summary: 'Pin the server markup of every column.',
    status: 'todo',
    priority: 2,
    tags: 'ssr',
    color: '#2563eb',
  },
  {
    id: 'T-4',
    title: 'Card virtualization',
    summary: 'Measured heights per column.',
    status: 'doing',
    priority: 1,
    tags: 'perf',
    color: '#dc2626',
  },
  {
    id: 'T-5',
    title: 'WIP limit copy',
    summary: 'Announce over and under limits.',
    status: 'review',
    priority: 2,
    tags: 'a11y',
    color: '#2563eb',
  },
  {
    id: 'T-6',
    title: 'Release notes',
    summary: 'Summarize the board features.',
    status: 'done',
    priority: 3,
    tags: 'docs',
    color: '#16a34a',
  },
  {
    id: 'T-7',
    title: 'RTL pass',
    summary: 'Logical properties only.',
    status: 'backlog',
    priority: 2,
    tags: 'rtl',
    color: '#2563eb',
  },
];

const SORTS: Record<string, KanbanSort<Task>> = {
  data: { by: 'data' },
  priority: { by: 'field', field: 'priority', direction: 'asc' },
  title: { by: 'custom', comparator: (a, b) => a.title.localeCompare(b.title) },
};

const SORT_OPTIONS = [
  { value: 'data', label: 'Data order' },
  { value: 'priority', label: 'Priority field' },
  { value: 'title', label: 'Custom (title)' },
];

export default function KanbanBasicsDemo() {
  const [selected, setSelected] = useState<readonly KanbanKey[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('data');
  const [last, setLast] = useState('nothing yet');
  const [hideBacklog, setHideBacklog] = useState(false);
  const [rtl, setRtl] = useState(false);
  const columns = useMemo(() => columnsFor(hideBacklog), [hideBacklog]);
  const needle = search.trim().toLowerCase();

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
        <TextField type="search" label="Filter" value={search} onValueChange={(value) => setSearch(value)} placeholder="Title or tag" />
        <label>
          Sort{' '}
          <Select aria-label="Sort" data={SORT_OPTIONS} value={sort} onValueChange={(value) => value != null && setSort(String(value))} />
        </label>
        <Checkbox checked={hideBacklog} onCheckedChange={(checked) => setHideBacklog(checked)}>
          Hide Backlog
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'}>
        <Kanban
          aria-label="Sprint board"
          data={TASKS}
          getCardId={(t) => t.id}
          columnField="status"
          columns={columns}
          columnGroups={GROUPS}
          card={{
            headerField: 'title',
            contentField: 'summary',
            tagsField: 'tags',
            accentField: 'color',
          }}
          getCardProps={({ card }) => ({ 'data-priority': card.priority })}
          selection="multiple"
          selectedCards={selected}
          onSelectedCardsChange={(value) => setSelected(value)}
          sort={SORTS[sort]}
          filter={needle ? (t) => t.title.toLowerCase().includes(needle) || t.tags.includes(needle) : undefined}
          cardsDraggable
          onCardMove={(e) => setLast(`${e.cardIds.join(', ')} to ${String(e.to.columnKey)} at ${e.index} by ${e.source}`)}
          onCardClick={(e) => setLast(`clicked ${String(e.id)}`)}
          tooltip={{
            delay: 400,
            render: ({ card }) => `${card.title}: ${card.summary}`,
          }}
        />
      </div>
      <p>
        Selected: <output>{selected.length ? selected.join(', ') : 'none'}</output> · Last event: <output>{last}</output>
      </p>
    </div>
  );
}
