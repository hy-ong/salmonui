import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { people, render, type Person, newInstance } from './fixtures.ts';

// The React `currency` prop: `C` number formats in the server
// HTML follow `currency` and `locale` (USD by default), and a runtime
// `currency` change recompiles the column formatters in the engine.

const moneyColumns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 80 },
  { field: 'age', header: 'Fee', type: 'number', format: 'C2', width: 120 },
];

describe('currency prop in server HTML', () => {
  it('C2 cells render euros with currency="EUR" and locale="de-DE"', () => {
    const html = render({ rows: 3, columns: moneyColumns, currency: 'EUR', locale: 'de-DE' });
    // people(): ages 20, 21, 22; de-DE puts the symbol after a no-break space.
    for (const age of [20, 21, 22]) assert.match(html, new RegExp(`>${age},00 €<`), `${age} €`);
    assert.doesNotMatch(html, /\$\d/);
  });

  it('C2 cells default to US dollars without the currency prop', () => {
    const html = render({ rows: 3, columns: moneyColumns });
    for (const age of [20, 21, 22]) assert.match(html, new RegExp(`>\\$${age}\\.00<`), `$${age}`);
    assert.doesNotMatch(html, /€/);
  });

  it('currency="JPY" with the default locale renders yen', () => {
    const html = render({ rows: 1, columns: [{ field: 'age', header: 'Fee', type: 'number', format: 'C0' }], currency: 'JPY' });
    assert.match(html, />¥20</);
  });
});

describe('runtime currency switch', () => {
  let seq = 0;
  function make(props: Partial<DataGridProps<Person>>) {
    let current = { data: people(3), columns: moneyColumns, ...props } as DataGridProps<Person>;
    const instance = newInstance<Person>(current as never, `:cur${seq++}:`);
    const update = (next: Partial<DataGridProps<Person>>) => {
      current = { ...current, ...next } as DataGridProps<Person>;
      instance.syncProps(current as never);
    };
    const drop = (key: keyof DataGridProps<Person>) => {
      const next: Partial<DataGridProps<Person>> = { ...current };
      delete next[key];
      current = next as DataGridProps<Person>;
      instance.syncProps(current as never);
    };
    const fee = (row: Person = people(1)[0] as Person) => {
      const column = instance.engine.getSnapshot().columns.byId.get('age');
      assert.ok(column);
      return column.formatter(row.age, row);
    };
    return { instance, update, drop, fee };
  }

  it('switching currency from USD to JPY recompiles the C formatter', () => {
    const m = make({ currency: 'USD' });
    assert.equal(m.fee(), '$20.00');
    m.update({ currency: 'JPY' });
    assert.equal(m.fee(), '¥20.00');
    // Removing the prop falls back to USD.
    m.drop('currency');
    assert.equal(m.fee(), '$20.00');
  });

  it('a currency switch keeps the locale; a locale switch keeps the currency', () => {
    const m = make({ currency: 'EUR', locale: 'de-DE' });
    assert.equal(m.fee(), '20,00 €');
    m.update({ currency: 'USD' });
    assert.equal(m.fee(), '20,00 $');
    m.update({ locale: 'en-US' });
    assert.equal(m.fee(), '$20.00');
  });
});
