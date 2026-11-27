// Development warning for a grid without an accessible name: the
// mount-time dev check warns once on the console (warnOnce, not `onWarning`)
// when neither `aria-label` nor `aria-labelledby` is set.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { people, personColumns, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function mountCapturing(props: Partial<DataGridProps<Person>>): string[] {
  const messages: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    messages.push(args.map(String).join(' '));
  };
  try {
    const id = `a11y-label-${seq++}`;
    const instance = newInstance<Person>({ id, data: people(3), columns: personColumns as DataGridColumn<Person>[], ...props } as never, `:a${seq}:`);
    const unmount = instance.mount();
    unmount();
    // A second mount of the same grid id does not warn again (warnOnce).
    const again = newInstance<Person>({ id, data: people(3), columns: personColumns as DataGridColumn<Person>[], ...props } as never, `:a${seq}b:`);
    again.mount()();
  } finally {
    console.warn = original;
  }
  return messages.filter((m) => m.includes('aria-label or aria-labelledby'));
}

describe('accessible name dev warning', () => {
  it('warns once on the console when both aria-label and aria-labelledby are missing', () => {
    const warnings = mountCapturing({});
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /^\[salmonui\] DataGrid "a11y-label-\d+": set aria-label or aria-labelledby/);
  });

  it('does not warn with aria-label or with aria-labelledby', () => {
    assert.deepEqual(mountCapturing({ 'aria-label': 'People' }), []);
    assert.deepEqual(mountCapturing({ 'aria-labelledby': 'people-heading' }), []);
  });

  it('the warning goes to the console, not to onWarning', () => {
    const received: string[] = [];
    const warnings = mountCapturing({ onWarning: (w) => received.push(w.message) });
    assert.equal(warnings.length, 1);
    assert.equal(received.filter((m) => m.includes('aria-label')).length, 0);
  });
});
