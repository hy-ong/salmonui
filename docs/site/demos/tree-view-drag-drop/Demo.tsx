'use client';
import { useState } from 'react';
import { moveTreeItems, TreeView, type TreeViewKey, type TreeViewMoveEvent } from '@salmonui/navigation/tree-view';

interface Task {
  id: string;
  name: string;
  children?: Task[];
}

const options = {
  getItemId: (t: Task) => t.id,
  getChildren: (t: Task) => t.children,
  withChildren: (t: Task, children: readonly Task[]) => ({ ...t, children: [...children] }),
};

const rename = (list: readonly Task[], id: TreeViewKey, name: string): Task[] =>
  list.map((t) => (t.id === id ? { ...t, name } : t.children ? { ...t, children: rename(t.children, id, name) } : t));

// `expanded` is reactive (applied when the array identity changes): keep one array.
const EXPANDED = ['launch'];
const listStyle = { border: '1px solid var(--salmon-border-subtle)', borderRadius: 'var(--salmon-radius-lg)' } as const;

export default function TreeViewDragDropDemo() {
  const [todo, setTodo] = useState<Task[]>([
    { id: 'launch', name: 'Launch', children: [{ id: 'copy', name: 'Write copy' }, { id: 'assets', name: 'Export assets' }] },
    { id: 'qa', name: 'QA pass' },
    { id: 'ship', name: 'Ship it' },
  ]);
  const [done, setDone] = useState<Task[]>([{ id: 'plan', name: 'Plan' }]);
  const [last, setLast] = useState('nothing yet');

  const into = (setTarget: typeof setTodo, setSource: typeof setTodo) => (e: TreeViewMoveEvent<Task>) => {
    setLast(`${e.ids.join(', ')} ${e.position} ${e.targetId}${e.sourceTreeId ? ' (from the other list)' : ''} by ${e.source}`);
    if (e.sourceTreeId) setSource((d) => moveTreeItems(d, { ids: e.ids, targetId: '', position: 'after' }, options));
    setTarget((d) => moveTreeItems(d, { ...e, items: e.items }, options));
  };

  const common = {
    getItemId: options.getItemId,
    getItemLabel: (t: Task) => t.name,
    getChildren: options.getChildren,
    draggable: true,
    dragGroup: 'tasks',
    renamable: true,
    selection: 'multiple' as const,
    height: 220,
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, maxWidth: 640 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <strong id="todo-label">To do</strong>
          <TreeView
            {...common}
            id="todo"
            aria-labelledby="todo-label"
            data={todo}
            expanded={EXPANDED}
            onMove={into(setTodo, setDone)}
            onRename={(e) => setTodo((d) => rename(d, e.id, e.label))}
            style={listStyle}
          />
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <strong id="done-label">Done</strong>
          <TreeView {...common} id="done" aria-labelledby="done-label" data={done} onMove={into(setDone, setTodo)} onRename={(e) => setDone((d) => rename(d, e.id, e.label))} style={listStyle} />
        </div>
      </div>
      <p style={{ margin: 0 }}>
        Last move: <output>{last}</output>
      </p>
    </div>
  );
}
