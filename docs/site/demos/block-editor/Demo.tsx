'use client';

import { useState } from 'react';
import { BlockEditor, type Block } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

const initial: Block[] = [
  { id: 'title', type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Launch plan' }] },
  {
    id: 'intro',
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Type ' },
      { type: 'text', text: '/', marks: [{ type: 'code' }] },
      { type: 'text', text: ' for blocks, select text for the toolbar, or drag the handle to reorder.' },
    ],
  },
  { id: 'goals', type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Tasks' }] },
  { id: 't1', type: 'checklistItem', props: { checked: true }, content: [{ type: 'text', text: 'Write the announcement' }] },
  { id: 't2', type: 'checklistItem', props: { checked: false }, content: [{ type: 'text', text: 'Review with ' }, { type: 'mention', id: 'ana', label: 'Ana Lima', trigger: '@' }] },
  { id: 'note', type: 'callout', props: { tone: 'warning' }, content: [{ type: 'text', text: 'Ship after the docs are live.' }] },
  {
    id: 'steps',
    type: 'numberedListItem',
    content: [{ type: 'text', text: 'Freeze the release branch' }],
    children: [{ id: 'steps-a', type: 'bulletListItem', content: [{ type: 'text', text: 'Tag ' }, { type: 'label', id: 'release', label: 'release', trigger: '#', tone: 'info' }] }],
  },
  { id: 'steps2', type: 'numberedListItem', content: [{ type: 'text', text: 'Publish the packages' }] },
  { id: 'code', type: 'code', props: { language: 'ts' }, content: [{ type: 'text', text: "import { BlockEditor } from '@salmonui/rich-text';" }] },
];

const people = [
  { value: 'ana', label: 'Ana Lima' },
  { value: 'ben', label: 'Ben Okafor' },
  { value: 'chen', label: 'Chen Wei' },
];
const labels = [
  { value: 'release', label: 'release', tone: 'info' },
  { value: 'bug', label: 'bug', tone: 'danger' },
];

export default function BlockEditorDemo() {
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [log, push] = useEventLog();
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
      <BlockEditor
        aria-label="Launch plan"
        value={blocks}
        onChange={setBlocks}
        onBlockChange={(event) => push(`${event.type}: ${event.block.id} (${event.block.type})`)}
        onBlockMove={(event) => push(`move (${event.source}): ${event.block.id}`)}
        mentions={{ items: people }}
        labels={{ items: labels }}
        codeLanguages={[
          { value: 'ts', label: 'TypeScript' },
          { value: 'css', label: 'CSS' },
        ]}
        placeholder="Type / for blocks"
      />
      <details>
        <summary>Value ({blocks.length} top-level blocks)</summary>
        <pre style={{ maxBlockSize: 240, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(blocks, null, 2)}</pre>
      </details>
      <EventLog entries={log} />
    </div>
  );
}
