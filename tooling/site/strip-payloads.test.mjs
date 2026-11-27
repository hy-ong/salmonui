import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { isDocumentOnlyPath } from '../../docs/site/lib/document-only.mjs';
import { listFiles } from './check-out.mjs';
import { stripDocumentOnlyPayloads } from './strip-payloads.mjs';

const temp = mkdtempSync(join(tmpdir(), 'salmon-strip-payloads-'));
after(() => rmSync(temp, { recursive: true, force: true }));

test('isDocumentOnlyPath: reference pages below the package level', () => {
  assert.equal(isDocumentOnlyPath('/docs/reference'), false);
  assert.equal(isDocumentOnlyPath('/docs/reference/react'), false);
  assert.equal(isDocumentOnlyPath('/docs/reference/react/'), false);
  assert.equal(isDocumentOnlyPath('/docs/reference/react/data-grid'), true);
  assert.equal(isDocumentOnlyPath('/docs/reference/data-grid-core/Store'), true);
  assert.equal(isDocumentOnlyPath('/docs/reference/react/data-grid/DataGrid#props'), true);
  assert.equal(isDocumentOnlyPath('/docs/reference/react?x=1'), false);
  assert.equal(isDocumentOnlyPath('/docs/data-grid/sorting'), false);
  assert.equal(isDocumentOnlyPath('/demos/data-grid/x'), false);
});

test('stripDocumentOnlyPayloads removes only document-only payloads', () => {
  const out = join(temp, 'out');
  const files = [
    'docs/reference.html',
    'docs/reference.txt',
    'docs/reference/__next._tree.txt',
    'docs/reference/react.html',
    'docs/reference/react.md',
    'docs/reference/react.txt',
    'docs/reference/react/__next._tree.txt',
    'docs/reference/react/data-grid.html',
    'docs/reference/react/data-grid.md',
    'docs/reference/react/data-grid.txt',
    'docs/reference/react/data-grid/__next._full.txt',
    'docs/reference/react/data-grid/DataGrid.html',
    'docs/reference/react/data-grid/DataGrid.md',
    'docs/reference/react/data-grid/DataGrid.txt',
    'docs/reference/react/data-grid/DataGrid/__next._tree.txt',
    'docs/reference/react/data-grid/DataGrid/__next.!KGRvY3Mp.txt',
    'docs/sorting.html',
    'docs/sorting.txt',
    'docs/sorting/__next._tree.txt',
  ];
  for (const file of files) {
    mkdirSync(dirname(join(out, file)), { recursive: true });
    writeFileSync(join(out, file), 'x');
  }
  assert.deepEqual(stripDocumentOnlyPayloads(out), { pages: 2, files: 5 });
  assert.deepEqual(listFiles(out), [
    'docs/reference.html',
    'docs/reference.txt',
    'docs/reference/__next._tree.txt',
    'docs/reference/react.html',
    'docs/reference/react.md',
    'docs/reference/react.txt',
    'docs/reference/react/__next._tree.txt',
    'docs/reference/react/data-grid.html',
    'docs/reference/react/data-grid.md',
    'docs/reference/react/data-grid/DataGrid.html',
    'docs/reference/react/data-grid/DataGrid.md',
    'docs/sorting.html',
    'docs/sorting.txt',
    'docs/sorting/__next._tree.txt',
  ]);
  assert.equal(existsSync(join(out, 'docs/reference/react/data-grid/DataGrid')), false);
});
