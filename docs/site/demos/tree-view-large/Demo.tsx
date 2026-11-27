'use client';
import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { TreeView, type TreeViewApi } from '@salmonui/navigation/tree-view';

interface Node {
  id: string;
  name: string;
  children?: Node[];
}

/** 10 regions × 100 stores × 99 products: 100,010 nodes. */
function generate(): Node[] {
  const roots: Node[] = [];
  for (let r = 0; r < 10; r++) {
    const stores: Node[] = [];
    for (let s = 0; s < 100; s++) {
      const products: Node[] = [];
      for (let p = 0; p < 99; p++) products.push({ id: `${r}.${s}.${p}`, name: `Product ${r}.${s}.${p}` });
      stores.push({ id: `${r}.${s}`, name: `Store ${r}.${s}`, children: products });
    }
    roots.push({ id: `${r}`, name: `Region ${r}`, children: stores });
  }
  return roots;
}

const getItemId = (n: Node) => n.id;
const getItemLabel = (n: Node) => n.name;
const getChildren = (n: Node) => n.children;

export default function TreeViewLargeDemo() {
  const [data] = useState(generate);
  const tree = useRef<TreeViewApi<Node>>(null);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => tree.current?.expandAll()}>
          Expand all
        </Button>
        <Button variant="outline" onClick={() => tree.current?.collapseAll()}>
          Collapse all
        </Button>
        <Button variant="outline" onClick={() => tree.current?.focusItem('7.42.77')}>
          Go to Product 7.42.77
        </Button>
      </div>
      <TreeView ref={tree} aria-label="Catalog" data={data} getItemId={getItemId} getItemLabel={getItemLabel} getChildren={getChildren} selection="multiple" checkable height={360} />
    </div>
  );
}
