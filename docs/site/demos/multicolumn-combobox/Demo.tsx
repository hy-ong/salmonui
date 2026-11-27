'use client';

import { Combobox, type ComboboxColumn } from '@salmonui/dropdowns/combobox';

interface Person {
  readonly id: number;
  readonly name: string;
  readonly city: string;
  readonly age: number;
  readonly active: boolean;
}

const CITIES = ['Zürich', 'São Paulo', 'Kraków', 'Reykjavík', 'Montréal', 'Málaga', 'Lyon', 'Bern'];
const FIRST = ['Ana', 'Ben', 'Chloé', 'Dmitri', 'Elif', 'Farah', 'Gustav', 'Hana', 'Ivan', 'Jun', 'Kofi', 'Lucía', 'Mateus', 'Nora', 'Oskar', 'Priya', 'Quentin', 'Rosa', 'Søren', 'Tomás'];
const LAST = ['Novak', 'Okafor', 'Dubois', 'Petrov', 'Şahin', 'Haddad', 'Lindqvist', 'Sato', 'Horvat', 'Kim', 'Mensah', 'García', 'Costa', 'Berg', 'Nowak', 'Iyer', 'Moreau', 'Ortega', 'Jensen', 'Ruiz', 'Fischer', 'Rossi', 'Tanaka'];
// Deterministic names: 20 first names x 23 last names, so neighbouring ids differ in both.
const PEOPLE: Person[] = Array.from({ length: 5_000 }, (_, i) => ({ id: i + 1, name: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`, city: CITIES[i % CITIES.length] as string, age: 20 + (i % 50), active: i % 3 !== 0 }));

const COLUMNS: ComboboxColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 60, align: 'end' },
  { field: 'name', header: 'Name', width: '30%' },
  { field: 'city', header: 'City' },
  { field: 'age', header: 'Age', width: 70, align: 'end', format: { maximumFractionDigits: 0 } },
  { field: 'active', header: 'Active', width: 80, align: 'center', displayAsCheckbox: true },
];

// MultiColumn ComboBox: a grid popup with sortable headers over 5,000 rows,
// searching the name and city columns.
export default function MulticolumnComboboxDemo() {
  return (
    <div style={{ display: 'grid', gap: 4, maxWidth: 520 }}>
      <span id="demo-people-label">Person</span>
      <Combobox
        aria-labelledby="demo-people-label"
        data={PEOPLE}
        columns={COLUMNS}
        getItemValue={(p) => p.id}
        getItemLabel={(p) => p.name}
        searchFields={['name', 'city']}
        searchOperator="contains"
        ignoreAccents
        striped
        gridLines="horizontal"
        sorting={{ multiple: true }}
      />
    </div>
  );
}
