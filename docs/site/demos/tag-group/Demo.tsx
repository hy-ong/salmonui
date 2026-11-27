'use client';

import { useState } from 'react';
import { Tag, TagGroup, moveTags } from '@salmonui/buttons/tag-group';
import { TextField } from '@salmonui/inputs/text-field';

type Setter = (update: (list: string[]) => string[]) => void;

// Removable labels with an add field, and two groups that exchange tags by drag and drop.
export default function TagGroupDemo() {
  const [labels, setLabels] = useState(['Design', 'Docs', 'Bug', 'Performance']);
  const [draft, setDraft] = useState('');
  const [todo, setTodo] = useState(['Write spec', 'Review', 'Ship']);
  const [done, setDone] = useState(['Kickoff']);
  const boards: [string, string[], Setter, Setter][] = [
    ['To do', todo, setTodo, setDone],
    ['Done', done, setDone, setTodo],
  ];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <form
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (text && !labels.includes(text)) setLabels((t) => [...t, text]);
          setDraft('');
        }}
      >
        <TagGroup
          aria-label="Labels"
          tone="primary"
          selectionMode="multiple"
          onRemove={(values) => setLabels((t) => t.filter((v) => !values.includes(v)))}
          reorderable
          onReorder={(e) => setLabels((t) => moveTags(t, e.values, e.toIndex))}
          empty="No labels"
        >
          {labels.map((label) => (
            <Tag key={label} value={label}>
              {label}
            </Tag>
          ))}
        </TagGroup>
        <TextField aria-label="New label" value={draft} placeholder="Add a label" onValueChange={setDraft} />
      </form>
      {boards.map(([name, list, setList, setOther]) => (
        <div key={name} style={{ display: 'grid', gap: 4 }}>
          <strong>{name}</strong>
          <TagGroup
            aria-label={name}
            reorderable
            dragGroup="board"
            empty="Drop tasks here"
            onReorder={(e) => setList((t) => moveTags(t, e.values, e.toIndex))}
            onTagDrop={(e) => {
              setOther((t) => t.filter((v) => !e.values.includes(v)));
              setList((t) => [...t.slice(0, e.toIndex), ...e.values, ...t.slice(e.toIndex)]);
            }}
          >
            {list.map((task) => (
              <Tag key={task} value={task}>
                {task}
              </Tag>
            ))}
          </TagGroup>
        </div>
      ))}
    </div>
  );
}
