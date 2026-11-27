'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { TextField } from '@salmonui/inputs/text-field';

interface Person {
  readonly id: number;
  readonly name: string;
  readonly city: string;
}

const people: Person[] = [
  { id: 1, name: 'Renée Dubois', city: 'Besançon' },
  { id: 2, name: 'Rene Martin', city: 'Lyon' },
  { id: 3, name: 'José Álvarez', city: 'Málaga' },
  { id: 4, name: 'Jose Silva', city: 'Porto' },
  { id: 5, name: 'Zoë Müller', city: 'Zürich' },
  { id: 6, name: 'ZOE Novak', city: 'Brno' },
  { id: 7, name: 'Åsa Lindqvist', city: 'Göteborg' },
];

const columns: DataGridColumn<Person>[] = [
  { field: 'id', header: 'Id', type: 'number', primaryKey: true, width: 70 },
  { field: 'name', header: 'Name', width: 180 },
  { field: 'city', header: 'City', width: 150 },
];

export default function TextMatchingDemo() {
  const [text, setText] = useState('rene');
  const [matchCase, setMatchCase] = useState(false);
  const [ignoreAccents, setIgnoreAccents] = useState(true);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Search{' '}
          <TextField type="search" value={text} onValueChange={(value) => setText(value)} aria-label="Search text" />
        </label>
        <Checkbox checked={matchCase} onCheckedChange={(checked) => setMatchCase(checked)}>
          matchCase
        </Checkbox>
        <Checkbox checked={ignoreAccents} onCheckedChange={(checked) => setIgnoreAccents(checked)}>
          ignoreAccents
        </Checkbox>
      </div>
      {/* `search` and `filtering` are reactive: the options re-apply when they change. */}
      <DataGrid<Person>
        aria-label="People matched with accent and case options"
        data={people}
        columns={columns}
        height="auto"
        selection={false}
        locale="en-US"
        search={{ text, matchCase, ignoreAccents }}
        filtering={{ ui: 'row', matchCase, ignoreAccents }}
      />
    </>
  );
}
