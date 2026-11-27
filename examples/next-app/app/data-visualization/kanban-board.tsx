'use client';

// A Kanban board with swimlanes, WIP limits, card drag and the editor; the
// drag and editor chunks load on the client only.
import { Kanban, type KanbanColumnDef } from '@salmonui/kanban';
import { ThemeProvider } from '@salmonui/core/theme';
import { theme } from '../theme';

interface Task {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly owner: string;
}

const tasks: readonly Task[] = [
  { id: 'k1', title: 'Write spec', status: 'todo', owner: 'alice' },
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
const swimlanes = { field: 'owner', lanes: [{ key: 'alice', label: 'Alice' }, { key: 'bob', label: 'Bob' }], draggable: true };
const card = { headerField: 'title' };
const getCardId = (t: Task) => t.id;

export function KanbanBoard() {
  return (
    <ThemeProvider theme={theme}>
      <Kanban<Task>
        id="next-kanban"
        aria-label="Sprint board"
        data={tasks}
        getCardId={getCardId}
        columnField="status"
        columns={columns}
        swimlanes={swimlanes}
        card={card}
        cardsDraggable
        columnsReorderable
        editor
        tooltip
        defaultSelectedCards={['k3']}
      />
    </ThemeProvider>
  );
}
