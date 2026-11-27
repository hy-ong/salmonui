'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Combobox, type ComboboxValue } from '@salmonui/dropdowns/combobox';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Tag {
  readonly value: string;
  readonly label: string;
  readonly locked?: boolean;
}

const TAGS: Tag[] = [
  { value: 'bug', label: 'bug' },
  { value: 'docs', label: 'docs' },
  { value: 'feature', label: 'feature' },
  { value: 'performance', label: 'performance' },
  { value: 'security', label: 'security', locked: true },
  { value: 'ux', label: 'ux' },
];

const MAX_TAG = 20;

// Created tags are lower-case words of at most 20 letters; anything else is rejected.
const createTag = (text: string): Tag | null => {
  const word = text.trim().toLowerCase();
  return /^[a-z-]+$/.test(word) && word.length <= MAX_TAG ? { value: word, label: word } : null;
};

export default function ComboboxTagsDemo() {
  const [log, push] = useEventLog();
  const [tags, setTags] = useState<readonly ComboboxValue[]>(['bug', 'security']);
  const [showTrigger, setShowTrigger] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <Checkbox checked={showTrigger} onCheckedChange={(checked) => setShowTrigger(checked)}>
        Show the dropdown button
      </Checkbox>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="combobox-tags-label">Labels</span>
        <Combobox<Tag>
          aria-labelledby="combobox-tags-label"
          multiple
          creatable
          data={TAGS}
          onCreateItem={(text) => {
            const tag = createTag(text);
            push(tag ? `onCreateItem "${text}" → ${tag.value}` : `onCreateItem "${text}" → rejected`);
            return tag;
          }}
          showTrigger={showTrigger}
          getChipProps={(tag) => (tag.locked ? { style: { fontWeight: 700, outline: '1px dashed currentColor' } } : undefined)}
          renderChip={({ item, label }) => (
            <>
              <span aria-hidden="true">#</span>
              {label}
              {item.locked ? <small> (locked)</small> : null}
            </>
          )}
          value={tags}
          onValueChange={(next, event) => {
            push(`onValueChange [${next.join(', ')}] (reason ${event.reason}, source ${event.source})`);
            // A controlled value vetoes: "security" cannot be removed, and at most five labels.
            if (event.reason !== 'clear' && tags.includes('security') && !next.includes('security')) {
              push('vetoed: "security" is locked');
              return;
            }
            if (next.length > 5) {
              push('vetoed: at most five labels');
              return;
            }
            setTags(next);
          }}
          placeholder="Add a label"
        />
      </div>
      <output>Value: [{tags.join(', ')}]</output>
      <EventLog entries={log} />
    </div>
  );
}
