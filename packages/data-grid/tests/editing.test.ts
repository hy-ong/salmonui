import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DATA_GRID_DEFAULT_LOCALE_TEXT, type DataGridColumn } from '@salmonui/data-grid';
import { formatLocaleText } from '@salmonui/data-grid/engine/locale';
import { count, personColumns, render, type Person } from './fixtures.ts';

// Editing on the server: the `editing` prop registers the edit module
// without changing the default markup, editors and dialogs never render on
// the server, command columns render their idle buttons deterministically,
// and the editing text joins the locale text.

const commands: DataGridColumn<Person> = { id: 'commands', header: 'Commands', width: 160, commands: [{ type: 'edit' }, { type: 'delete' }, { type: 'save' }, { type: 'cancel' }] };

describe('SSR: editing', () => {
  it('editing in every mode renders the same body markup as no editing, without editors or dialogs', () => {
    const plain = render({ rows: 30 });
    for (const mode of ['row', 'batch', 'dialog', 'cell'] as const) {
      const html = render({ rows: 30, editing: { mode } });
      assert.equal(count(html, /salmon-data-grid-editor/), 0, mode);
      assert.equal(count(html, /<dialog/), 0, mode);
      assert.equal(count(html, /salmon-data-grid-added-rows/), 0, mode);
      assert.equal(count(html, /data-dirty|data-invalid|data-new|data-deleted|data-editing/), 0, mode);
      // The `editing` render feature marks the gated root pending on the server; nothing else differs.
      assert.match(html, /role="grid"[^>]*data-salmon-pending=""/, mode);
      assert.equal(html.replace(' data-salmon-pending=""', ''), plain, `${mode}: identical markup`);
      assert.equal(render({ rows: 30, editing: { mode } }), html, `${mode}: deterministic`);
    }
  });

  it('a command column renders the idle Edit and Delete buttons per row (not focusable, utility column)', () => {
    const html = render({ rows: 10, editing: true, columns: [commands, ...personColumns] });
    assert.equal(count(html, /data-command="edit"/), 10);
    assert.equal(count(html, /data-command="delete"/), 10);
    assert.equal(count(html, /data-command="save"/), 0);
    assert.equal(count(html, /<button type="button" tabindex="-1"[^>]*data-command=/), 20);
    assert.equal(render({ rows: 10, editing: true, columns: [commands, ...personColumns] }), html);
  });

  it('editing text is part of the locale text and overridable', () => {
    assert.equal(DATA_GRID_DEFAULT_LOCALE_TEXT.unsavedChangesLost, 'Unsaved changes will be lost. Are you sure you want to continue?');
    assert.equal(formatLocaleText(DATA_GRID_DEFAULT_LOCALE_TEXT, 'confirmDelete', { count: 3 }), 'Delete 3 rows?');
    const html = render({ rows: 3, editing: true, columns: [commands, ...personColumns], localeText: { edit: 'Bearbeiten' } });
    assert.match(html, /data-command="edit"[^>]*>Bearbeiten</);
  });
});

describe('lazy editing chunk', () => {
  it('the at-rest stand-ins render the same markup as the loaded editing modules', async () => {
    const columns = [commands, ...personColumns];
    const modes = ['row', 'batch', 'dialog', 'cell'] as const;
    const before = modes.map((mode) => render({ rows: 20, editing: { mode, fillHandle: true }, columns }));
    // The server never loads the chunk; load it here to render with the real modules.
    const host = (await import(new URL('../dist/data-grid/editing/edit-host.js', import.meta.url).href)) as { loadEditChunk(): Promise<unknown> };
    await host.loadEditChunk();
    modes.forEach((mode, i) => assert.equal(render({ rows: 20, editing: { mode, fillHandle: true }, columns }), before[i], mode));
  });
});
