'use client';
import { useState } from 'react';
import { TreeView } from '@salmonui/navigation/tree-view';

interface Dir {
  id: string;
  name: string;
  lazy?: boolean;
}

const roots: Dir[] = [
  { id: 'home', name: 'home', lazy: true },
  { id: 'mnt', name: 'mnt (flaky network share)', lazy: true },
  { id: 'readme', name: 'README' },
];

export default function TreeViewLazyDemo() {
  const [log, setLog] = useState<string[]>([]);
  const [failures] = useState(() => new Set(['mnt']));
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <TreeView
        aria-label="File system"
        data={roots}
        getItemId={(d) => d.id}
        getItemLabel={(d) => d.name}
        hasChildren={(d) => d.lazy === true}
        loadChildren={(dir, { signal }) =>
          new Promise<Dir[]>((resolve, reject) => {
            const timer = setTimeout(() => {
              if (failures.delete(dir.id)) reject(new Error('Network share unavailable'));
              else resolve([1, 2, 3].map((i) => ({ id: `${dir.id}/${i}`, name: `folder ${i}`, lazy: i < 3 })));
            }, 700);
            signal.addEventListener('abort', () => clearTimeout(timer));
          })
        }
        onLoadError={(error, item) => setLog((l) => [...l, `${item.name}: ${(error as Error).message}`])}
        height={240}
      />
      <p>
        Errors: <output>{log.join('; ') || 'none'}</output>
      </p>
    </div>
  );
}
