'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { TreeSelect, type TreeSelectValue } from '@salmonui/dropdowns/tree-select';

interface Dir {
  id: string;
  name: string;
  lazy?: boolean;
}

const ROOTS: Dir[] = [
  { id: 'home', name: 'home', lazy: true },
  { id: 'mnt', name: 'mnt (flaky network share)', lazy: true },
  { id: 'readme', name: 'README' },
];

// Every loaded folder holds the same three subfolders; the last has no children.
const FOLDERS = ['projects', 'photos', 'archive'];

const getDirValue = (d: Dir) => d.id;
const getDirLabel = (d: Dir) => d.name;
const hasChildren = (d: Dir) => d.lazy === true;

// Load on demand: `hasChildren` shows a twisty before the children are
// known, `loadChildren` fetches them (aborted through `signal` when stale).
export default function TreeSelectLazyDemo() {
  const [failures] = useState(() => new Set(['mnt']));
  const [value, setValue] = useState<TreeSelectValue | null>(null);
  const [log, setLog] = useState<string[]>([]);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-folder-label">Folder</span>
        <TreeSelect
          aria-labelledby="demo-folder-label"
          data={ROOTS}
          getItemValue={getDirValue}
          getItemLabel={getDirLabel}
          hasChildren={hasChildren}
          loadChildren={(dir, { signal }) =>
            new Promise<Dir[]>((resolve, reject) => {
              const timer = setTimeout(() => {
                if (failures.delete(dir.id)) reject(new Error('Network share unavailable'));
                else resolve(FOLDERS.map((name, i) => ({ id: `${dir.id}/${name}`, name, lazy: i < 2 })));
              }, 700);
              signal.addEventListener('abort', () => clearTimeout(timer));
            })
          }
          onLoadError={(error, dir) => setLog((l) => [...l, `${dir.name}: ${(error as Error).message}`])}
          renderItem={({ label, level }) => (
            <span>
              <span aria-hidden="true">{level === 1 ? '🗄 ' : '📁 '}</span>
              {label}
            </span>
          )}
          renderLoading={() => <em>Loading folders…</em>}
          renderError={({ error, retry }) => (
            <span>
              {(error as Error).message}{' '}
              <Button
                variant="outline"
                tabIndex={-1}
                // Keep focus on the trigger, and keep the click off the row (it would select the share).
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  retry();
                }}
              >
                Retry
              </Button>
            </span>
          )}
          popupHeader={<strong>Choose a folder</strong>}
          popupFooter={<small>Folders load on first expand.</small>}
          value={value}
          onValueChange={setValue}
          clearable
          placeholder="Pick a folder"
        />
      </div>
      <output>Value: {String(value)}</output>
      <p>
        Errors: <output>{log.join('; ') || 'none'}</output>
      </p>
    </div>
  );
}
