// Touch multi-sort popup state without a DOM: header taps
// (click events whose pointerType is 'touch') drive `DataGridInstance`'s
// delegated header click handler through minimal element stand-ins; the
// popup state is `chrome.touchSort`, rendered by the lazy overlay chunk.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { people, personColumns, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}) {
  const instance = newInstance<Person>({ data: people(6), columns: personColumns as DataGridColumn<Person>[], 'aria-label': 'People', ...props } as never, `:ts${seq++}:`);
  const unmount = instance.mount();
  return { instance, unmount };
}

function tap(instance: DataGridInstance<Person>, columnId: string, pointerType = 'touch', mods: { ctrlKey?: boolean } = {}): void {
  const cell = { dataset: { columnId } };
  const target = { closest: (selector: string) => (selector === '[data-column-id]' ? cell : null) };
  instance.onHeaderClick({ target, ctrlKey: mods.ctrlKey ?? false, metaKey: false, shiftKey: false, detail: 1, nativeEvent: { pointerType } } as never);
}

const sorting = (instance: DataGridInstance<Person>) => instance.engine.getSnapshot().query.sorting.map((s) => `${s.columnId}:${s.direction}`);

describe('touch multi-sort popup', () => {
  it('a touch tap sorts and opens the popup; with the toggle on, taps add to the sort', () => {
    const { instance, unmount } = make({ sorting: { multiple: true } });
    const chrome = instance.chrome;
    tap(instance, 'name');
    assert.deepEqual(sorting(instance), ['name:asc']);
    assert.deepEqual(chrome.touchSort, { columnId: 'name', multi: false });
    // Toggle off: a tap replaces the sort (like a plain click) and moves the popup.
    tap(instance, 'age');
    assert.deepEqual(sorting(instance), ['age:asc']);
    assert.deepEqual(chrome.touchSort, { columnId: 'age', multi: false });
    // Toggle on: taps add (like Ctrl+click) and cycle a sorted column in place.
    chrome.setTouchSort({ columnId: 'age', multi: true });
    tap(instance, 'name');
    assert.deepEqual(sorting(instance), ['age:asc', 'name:asc']);
    assert.deepEqual(chrome.touchSort, { columnId: 'name', multi: true });
    tap(instance, 'age');
    assert.deepEqual(sorting(instance), ['age:desc', 'name:asc']);
    // Hiding turns the toggle off: the next tap replaces again.
    chrome.setTouchSort(null);
    tap(instance, 'joined');
    assert.deepEqual(sorting(instance), ['joined:asc']);
    unmount();
  });

  it('mouse clicks never open the popup and ignore the toggle', () => {
    const { instance, unmount } = make({ sorting: { multiple: true } });
    tap(instance, 'name', 'mouse');
    assert.equal(instance.chrome.touchSort, null);
    instance.chrome.setTouchSort({ columnId: 'name', multi: true });
    tap(instance, 'age', 'mouse');
    assert.deepEqual(sorting(instance), ['age:asc'], 'plain click replaces');
    tap(instance, 'name', 'mouse', { ctrlKey: true });
    assert.deepEqual(sorting(instance), ['age:asc', 'name:asc'], 'Ctrl+click still adds');
    unmount();
  });

  it('single-column sorting shows no popup', () => {
    const { instance, unmount } = make({ sorting: true });
    tap(instance, 'name');
    assert.deepEqual(sorting(instance), ['name:asc']);
    assert.equal(instance.chrome.touchSort, null);
    unmount();
  });
});
