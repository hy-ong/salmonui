'use client';
import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { TreeView } from '@salmonui/navigation/tree-view';

interface Topic {
  id: string;
  title: string;
  children?: Topic[];
}

const topics: Topic[] = [
  {
    id: 'onboarding',
    title: 'Onboarding checklist for new team members joining in the first quarter',
    children: [
      { id: 'laptop', title: 'Request a laptop, a security key and access to the shared drives before the first day' },
      { id: 'buddy', title: 'Pick a buddy' },
    ],
  },
  {
    id: 'policies',
    title: 'Policies',
    children: [
      { id: 'travel', title: 'Travel and expenses, including per diem rates for international trips' },
      { id: 'leave', title: 'Leave' },
    ],
  },
  { id: 'contacts', title: 'Contacts' },
];

type ExpandOn = 'auto' | 'click' | 'doubleClick' | 'none';

const EXPAND_ON = [
  { value: 'auto', label: 'auto' },
  { value: 'click', label: 'click' },
  { value: 'doubleClick', label: 'doubleClick' },
  { value: 'none', label: 'none (twisty only)' },
];
const ROW_HIGHLIGHTS = ['full', 'label'];

export default function TreeViewInteractionDemo() {
  const [expandOn, setExpandOn] = useState<ExpandOn>('auto');
  const [rowHighlight, setRowHighlight] = useState<'full' | 'label'>('full');
  const [textWrap, setTextWrap] = useState(true);
  const [skipEnter, setSkipEnter] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  const add = (entry: string) => setLog((list) => [entry, ...list].slice(0, 6));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <label>
          Expand on{' '}
          <Select aria-label="Expand on" data={EXPAND_ON} value={expandOn} onValueChange={(value) => value != null && setExpandOn(value as ExpandOn)} />
        </label>
        <label>
          Row highlight{' '}
          <Select aria-label="Row highlight" data={ROW_HIGHLIGHTS} value={rowHighlight} onValueChange={(value) => value != null && setRowHighlight(value as 'full' | 'label')} />
        </label>
        <Checkbox checked={textWrap} onCheckedChange={(checked) => setTextWrap(checked)}>
          Wrap text
        </Checkbox>
        <Checkbox checked={skipEnter} onCheckedChange={(checked) => setSkipEnter(checked)}>
          Skip built-in Enter
        </Checkbox>
      </div>
      <TreeView
        aria-label="Handbook"
        data={topics}
        getItemId={(t) => t.id}
        getItemLabel={(t) => t.title}
        getChildren={(t) => t.children}
        expandOn={expandOn}
        rowHighlight={rowHighlight}
        textWrap={textWrap}
        onItemClick={(event) => add(`onItemClick ${event.id} (${event.source})`)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && skipEnter) {
            // preventDefault() skips the built-in Enter (select and activate).
            event.preventDefault();
            add('onKeyDown Enter: preventDefault(), built-in Enter skipped');
            return;
          }
          add(`onKeyDown ${event.key}`);
        }}
        height={260}
        style={{ maxInlineSize: 440 }}
      />
      <div className="demo-log" aria-live="polite" style={{ marginBlockStart: 0, maxInlineSize: 440, boxSizing: 'border-box' }}>
        {log.length === 0 ? (
          <span style={{ color: 'var(--salmon-text-secondary)' }}>No events yet.</span>
        ) : (
          <ol>
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
