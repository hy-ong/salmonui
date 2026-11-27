// Batch confirm prompts without a DOM: `confirmSave` before a UI
// batch save, the batch-cancel
// discard prompt (`confirmDiscard`, default on) and `confirmDiscard: false`.
// The toolbar / menu Save and Cancel run the `edit.save` / `edit.cancel` UI
// commands; `api.save()` is the programmatic path and never prompts.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { loadEditChunk } from '../dist/data-grid/editing/edit-host.js';
import { people, type Person, newInstance } from './fixtures.ts';

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', primaryKey: true },
  { field: 'name', header: 'Name' },
  { field: 'age', header: 'Age', type: 'number' },
];

let seq = 0;
function make(editing: Record<string, unknown>, props: Partial<DataGridProps<Person>> = {}) {
  const instance = newInstance<Person>({ data: people(5), columns, 'aria-label': 'People', timeZone: 'UTC', editing: { mode: 'batch', ...editing }, ...props } as never, `:bc${seq++}:`);
  const unmount = instance.mount();
  return { instance, unmount, api: instance.api };
}

before(async () => {
  await loadEditChunk();
});

describe('batch save prompt', () => {
  it('confirmSave: a UI Save of pending changes asks first; OK saves, Cancel keeps the changes', async () => {
    const saves: string[] = [];
    const { instance, unmount, api } = make({ confirmSave: true }, { onSave: (e) => saves.push(e.status) });
    api.updateCell('p1', 'name', 'Changed');
    assert.equal(api.hasUnsavedChanges(), true);
    assert.equal(api.runCommand('edit.save'), true);
    const prompt = instance.editing.getPrompt();
    assert.equal(prompt?.kind, 'save');
    assert.equal(prompt?.message, 'Save all pending changes?');
    assert.equal(api.hasUnsavedChanges(), true, 'nothing is written while the prompt is open');
    prompt!.resolve(false);
    assert.equal(instance.editing.getPrompt(), null);
    assert.equal(api.hasUnsavedChanges(), true, 'Cancel keeps the batch');
    api.runCommand('edit.save');
    instance.editing.getPrompt()!.resolve(true);
    await api.whenEditSettled();
    assert.equal(api.hasUnsavedChanges(), false);
    assert.equal(api.getRow('p1')?.name, 'Changed');
    assert.deepEqual(saves, ['applied']);
    unmount();
  });

  it('confirmSave: no prompt without pending changes; api.save() never prompts', async () => {
    const { instance, unmount, api } = make({ confirmSave: true });
    api.runCommand('edit.save');
    assert.equal(instance.editing.getPrompt(), null);
    api.updateCell('p2', 'name', 'Direct');
    assert.equal(api.save().status, 'applied');
    assert.equal(instance.editing.getPrompt(), null);
    await api.whenEditSettled();
    assert.equal(api.getRow('p2')?.name, 'Direct');
    unmount();
  });

  it('confirmSave is on by default: a UI Save of pending changes asks first', async () => {
    const { instance, unmount, api } = make({});
    api.updateCell('p1', 'name', 'Asked');
    api.runCommand('edit.save');
    assert.equal(instance.editing.getPrompt()?.kind, 'save');
    instance.editing.getPrompt()!.resolve(true);
    await api.whenEditSettled();
    assert.equal(api.getRow('p1')?.name, 'Asked');
    unmount();
  });

  it('confirmSave: false: a UI Save writes at once', async () => {
    const { instance, unmount, api } = make({ confirmSave: false });
    api.updateCell('p1', 'name', 'Now');
    api.runCommand('edit.save');
    assert.equal(instance.editing.getPrompt(), null);
    await api.whenEditSettled();
    assert.equal(api.getRow('p1')?.name, 'Now');
    unmount();
  });

  it('the prompt text comes from localeText.confirmSave', () => {
    const { instance, unmount, api } = make({ confirmSave: true }, { localeText: { confirmSave: 'Speichern?' } } as never);
    api.updateCell('p1', 'name', 'X');
    api.runCommand('edit.save');
    assert.equal(instance.editing.getPrompt()?.message, 'Speichern?');
    unmount();
  });
});

describe('batch cancel discard prompt', () => {
  it('a UI Cancel of pending changes asks to discard by default; Cancel keeps, OK discards', () => {
    const { instance, unmount, api } = make({});
    api.updateCell('p1', 'name', 'Changed');
    assert.equal(api.runCommand('edit.cancel'), true);
    const prompt = instance.editing.getPrompt();
    assert.equal(prompt?.kind, 'discard');
    assert.equal(prompt?.message, 'Discard all unsaved changes?');
    prompt!.resolve(false);
    assert.equal(api.hasUnsavedChanges(), true);
    api.runCommand('edit.cancel');
    instance.editing.getPrompt()!.resolve(true);
    assert.equal(api.hasUnsavedChanges(), false);
    assert.equal(api.getRow('p1')?.name, 'Person 1');
    unmount();
  });

  it('confirmDiscard: false discards at once without a prompt', () => {
    const { instance, unmount, api } = make({ confirmDiscard: false });
    api.updateCell('p1', 'name', 'Changed');
    api.runCommand('edit.cancel');
    assert.equal(instance.editing.getPrompt(), null);
    assert.equal(api.hasUnsavedChanges(), false);
    unmount();
  });
});
