'use client';
import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { TreeView, type TreeViewKey } from '@salmonui/navigation/tree-view';

interface Folder {
  id: string;
  name: string;
  children?: Folder[];
  locked?: boolean;
}

const folders: Folder[] = [
  {
    id: 'src',
    name: 'src',
    children: [
      { id: 'components', name: 'components', children: [{ id: 'button', name: 'Button.tsx' }, { id: 'tree', name: 'TreeView.tsx' }] },
      { id: 'index', name: 'index.ts' },
    ],
  },
  { id: 'docs', name: 'docs', children: [{ id: 'readme', name: 'README.md' }, { id: 'guide', name: 'guide.md' }] },
  { id: 'secrets', name: 'secrets', locked: true, children: [{ id: 'env', name: '.env' }] },
  { id: 'package', name: 'package.json' },
];

const getItemId = (f: Folder) => f.id;
const getItemLabel = (f: Folder) => f.name;
const getChildren = (f: Folder) => f.children;
const isItemDisabled = (f: Folder) => f.locked === true;

export default function TreeViewBasicsDemo() {
  const [expanded, setExpanded] = useState<readonly TreeViewKey[]>(['src']);
  const [selected, setSelected] = useState<readonly TreeViewKey[]>([]);
  const [multiple, setMultiple] = useState(true);
  const [last, setLast] = useState('nothing yet');
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <Checkbox checked={multiple} onCheckedChange={(checked) => setMultiple(checked)}>
        Multiple selection
      </Checkbox>
      <TreeView
        aria-label="Project files"
        data={folders}
        getItemId={getItemId}
        getItemLabel={getItemLabel}
        getChildren={getChildren}
        isItemDisabled={isItemDisabled}
        selection={multiple ? 'multiple' : 'single'}
        expanded={expanded}
        onExpandedChange={(e) => {
          setExpanded(e.expanded);
          setLast(`${e.id ?? 'several'} ${e.expanded.includes(e.id ?? '') ? 'expanded' : 'collapsed'} (${e.source})`);
        }}
        selected={selected}
        onSelectedChange={(e) => {
          setSelected(e.selected);
          setLast(`selected ${e.selected.join(', ') || 'nothing'} (${e.source})`);
        }}
        height={280}
      />
      <p>
        Last change: <output>{last}</output>
      </p>
    </div>
  );
}
