// `?kanban`: the Data Visualization page of the Vite SSR example, a Kanban
// board server rendered and hydrated (tests/browser/ssr-kanban.spec.ts).
// Swimlanes, WIP limits, column
// groups, card drag (lazy chunk after hydration) and the editor (lazy, opens
// only on the client) are on.
import { Kanban, type KanbanColumnDef } from '@salmonui/kanban';

interface Task {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly status: string;
  readonly owner: string;
}

const tasks: readonly Task[] = [
  { id: 'k1', title: 'Write spec', body: 'Outline the API', status: 'todo', owner: 'alice' },
  { id: 'k2', title: 'Set up CI', status: 'todo', owner: 'bob' },
  { id: 'k3', title: 'Build board', status: 'doing', owner: 'alice' },
  { id: 'k4', title: 'Fix login', status: 'doing', owner: 'alice' },
  { id: 'k5', title: 'Kickoff', status: 'done', owner: 'bob' },
];

const columns: readonly KanbanColumnDef[] = [
  { key: 'todo', header: 'To do', collapsible: true, addButton: true },
  { key: 'doing', header: 'In progress', max: 1 },
  { key: 'done', header: 'Done' },
];
const groups = [{ header: 'Active', columns: ['todo', 'doing'] }];
const swimlanes = { field: 'owner', lanes: [{ key: 'alice', label: 'Alice' }, { key: 'bob', label: 'Bob' }], draggable: true };
const card = { headerField: 'title', contentField: 'body' };
const getCardId = (t: Task) => t.id;

export function KanbanPage() {
  return (
    <main style={{ padding: 16 }}>
      <Kanban<Task>
        id="ssr-kanban"
        aria-label="Sprint board"
        data={tasks}
        getCardId={getCardId}
        columnField="status"
        columns={columns}
        columnGroups={groups}
        swimlanes={swimlanes}
        card={card}
        cardsDraggable
        columnsReorderable
        editor
        tooltip
        defaultSelectedCards={['k3']}
      />
    </main>
  );
}
