'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { Select } from '@salmonui/dropdowns/select';
import { createDemoListSource } from '../../lib/demo-list-source';

interface Person {
  readonly value: string;
  readonly label: string;
  readonly role: string;
  readonly team: string;
}

// Sorted by team: items of one group must be contiguous.
const PEOPLE: Person[] = [
  { value: 'ana', label: 'Ana Lima', role: 'Designer', team: 'Design' },
  { value: 'ben', label: 'Ben Okafor', role: 'Researcher', team: 'Design' },
  { value: 'chen', label: 'Chen Wei', role: 'Frontend engineer', team: 'Engineering' },
  { value: 'dara', label: 'Dara Holm', role: 'Backend engineer', team: 'Engineering' },
  { value: 'emil', label: 'Emil Novak', role: 'Site reliability', team: 'Engineering' },
  { value: 'fay', label: 'Fay Ito', role: 'Product manager', team: 'Product' },
];

function initials(label: string): string {
  return label
    .split(' ')
    .map((part) => part[0])
    .join('');
}

function Highlight({ text, ranges }: { text: string; ranges: readonly (readonly [number, number])[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts = [];
  let at = 0;
  for (const [start, end] of ranges) {
    parts.push(text.slice(at, start), <mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

export default function DropdownTemplatesDemo() {
  const failNext = useRef(false);
  // A slow remote source (1.5 s) whose reads can be made to fail.
  const [slow] = useState(() =>
    createDemoListSource<Person>({
      rows: PEOPLE,
      latency: 1500,
      shouldFail: () => failNext.current,
    }),
  );
  const [fail, setFail] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="dd-tpl-owner">Owner</span>
        <Select<Person>
          aria-labelledby="dd-tpl-owner"
          data={PEOPLE}
          defaultValue="chen"
          getItemGroup={(person) => person.team}
          renderGroupHeader={({ group }) => <strong>{group} team</strong>}
          renderItem={({ item, selected }) => (
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBlock: 4 }}>
              <span aria-hidden="true" style={{ inlineSize: 24, blockSize: 24, borderRadius: 'var(--salmon-radius-full)', display: 'grid', placeItems: 'center', fontSize: 11, background: 'var(--salmon-surface-sunken)' }}>
                {initials(item.label)}
              </span>
              <span>
                {item.label}
                {selected ? ' (owner)' : ''}
                <br />
                <small>{item.role}</small>
              </span>
            </span>
          )}
          renderValue={({ items }) => (items[0] ? <span>{items[0].label} · <small>{items[0].role}</small></span> : null)}
          popupHeader={<small style={{ display: 'block' }}>Pick the person accountable for this task</small>}
          popupFooter={<small style={{ display: 'block' }}>{PEOPLE.length} people in 3 teams</small>}
        />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="dd-tpl-search">Reviewer (type something nobody is called, such as "zz")</span>
        <Combobox<Person>
          aria-labelledby="dd-tpl-search"
          data={PEOPLE}
          searchOperator="contains"
          renderItem={({ label, matches }) => <Highlight text={label} ranges={matches} />}
          renderEmpty={({ reason }) => <em>{reason === 'noMatch' ? 'Nobody by that name' : 'No people yet'}</em>}
        />
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <Checkbox
          checked={fail}
          onCheckedChange={(checked) => {
            failNext.current = checked;
            setFail(checked);
          }}
        >
          Make reads fail
        </Checkbox>
        <div style={{ display: 'grid', gap: 4 }}>
          <span id="dd-tpl-remote">Assignee (remote, 1.5 s)</span>
          <Select<Person>
            aria-labelledby="dd-tpl-remote"
            data={slow}
            placeholder="Open to load people"
            renderLoading={() => <span role="status">Fetching the team directory…</span>}
            renderError={({ retry }) => (
              <span role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                The directory is unavailable.
                <Button variant="outline" onClick={retry}>
                  Try again
                </Button>
              </span>
            )}
          />
        </div>
      </div>
    </div>
  );
}
