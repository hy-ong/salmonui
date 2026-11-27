'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Mention } from '@salmonui/dropdowns/mention';
import { Select } from '@salmonui/dropdowns/select';
import { TextArea } from '@salmonui/inputs/text-field';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Person {
  readonly value: string;
  readonly label: string;
  readonly handle: string;
}

const PEOPLE: readonly Person[] = [
  { value: 'ana', label: 'Ana Lima', handle: 'ana.lima' },
  { value: 'ana-sofia', label: 'Ana Sofia Reyes', handle: 'asreyes' },
  { value: 'ben', label: 'Ben Okafor', handle: 'bokafor' },
  { value: 'chen', label: 'Chen Wei', handle: 'chenwei' },
  { value: 'mary', label: 'Mary Ann Lee', handle: 'maryann' },
  { value: 'yuki', label: 'Yuki Sato', handle: 'ysato' },
  { value: 'yuto', label: 'Yuto Sato', handle: 'yuto' },
];

// Inserts the handle ("@ana.lima") instead of the display name.
const insertHandle = (person: Person) => `@${person.handle}`;

export default function MentionOptionsDemo() {
  const [log, push] = useEventLog();
  const [requireLeadingSpace, setRequireLeadingSpace] = useState(true);
  const [multiWord, setMultiWord] = useState(true);
  const [minSearchLength, setMinSearchLength] = useState(1);
  const [text, setText] = useState('Mail ana@example.com or ');
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <div role="group" aria-label="Options" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <Checkbox checked={requireLeadingSpace} onCheckedChange={setRequireLeadingSpace}>
          <code>requireLeadingSpace</code>
        </Checkbox>
        <Checkbox checked={multiWord} onCheckedChange={setMultiWord}>
          <code>multiWord</code>
        </Checkbox>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <code id="mention-options-min">minSearchLength</code>
          <Select aria-labelledby="mention-options-min" data={[0, 1, 2]} value={minSearchLength} onValueChange={(value) => setMinSearchLength(Number(value))} />
        </span>
      </div>
      <Mention<Person>
        data={PEOPLE}
        requireLeadingSpace={requireLeadingSpace}
        multiWord={multiWord}
        minSearchLength={minSearchLength}
        getInsertText={insertHandle}
        triggers={[{ char: '@', suffix: ' ' }]}
        renderItem={({ item, label }) => (
          <span>
            {label} <small>@{item.handle}</small>
          </span>
        )}
        onSearchChange={(event) => push(`search "${event.text}"`)}
        onInsert={(event) => push(`insert ${JSON.stringify(event.text)} (${event.source})`)}
      >
        <TextArea id="mention-options-note" label="Note (a controlled textarea)" rows={4} value={text} onValueChange={setText} style={{ inlineSize: '100%' }} />
      </Mention>
      <p>
        Characters: <output>{text.length}</output>
      </p>
      <EventLog entries={log} />
    </div>
  );
}
