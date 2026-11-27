'use client';
import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { TreeView, type TreeViewApi } from '@salmonui/navigation/tree-view';

interface Perm {
  id: string;
  name: string;
  children?: Perm[];
  locked?: boolean;
}

const permissions: Perm[] = [
  {
    id: 'orders',
    name: 'Orders',
    children: [
      { id: 'orders.read', name: 'View orders' },
      { id: 'orders.edit', name: 'Edit orders' },
      { id: 'orders.refund', name: 'Issue refunds', locked: true },
    ],
  },
  {
    id: 'catalog',
    name: 'Catalog',
    children: [
      { id: 'catalog.read', name: 'View products' },
      { id: 'catalog.publish', name: 'Publish products' },
    ],
  },
  { id: 'reports', name: 'Reports' },
];

// `expanded` is reactive (applied when the array identity changes): keep one array.
const EXPANDED = ['orders', 'catalog'];

export default function TreeViewCheckboxesDemo() {
  const [cascade, setCascade] = useState(true);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [checkedIds, setCheckedIds] = useState('not read yet');
  const api = useRef<TreeViewApi<Perm>>(null);
  return (
    <form
      style={{ display: 'grid', gap: 12, maxWidth: 420 }}
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(new FormData(event.currentTarget).getAll('permissions').map(String));
      }}
    >
      <Checkbox checked={cascade} onCheckedChange={(checked) => setCascade(checked)}>
        Cascade
      </Checkbox>
      <TreeView
        ref={api}
        aria-label="Permissions"
        data={permissions}
        getItemId={(p) => p.id}
        getItemLabel={(p) => p.name}
        getChildren={(p) => p.children}
        isItemDisabled={(p) => p.locked === true}
        checkable
        checkPropagation={cascade ? 'cascade' : 'none'}
        cascadeToDisabled={false}
        checkOnClick
        selection="none"
        name="permissions"
        defaultChecked={['orders.read']}
        expanded={EXPANDED}
        height={260}
      />
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <Button type="submit" tone="primary">
          Save
        </Button>
        <Button type="reset" variant="outline">
          Reset
        </Button>
        <Button variant="outline" onClick={() => api.current?.checkAll()}>
          Check all
        </Button>
        <Button variant="outline" onClick={() => api.current?.uncheckAll()}>
          Uncheck all
        </Button>
        <Button variant="outline" onClick={() => api.current?.checkAll(['catalog'])}>
          Check Catalog
        </Button>
        <Button variant="outline" onClick={() => setCheckedIds(api.current?.getCheckedIds().join(', ') || 'none')}>
          Read checked ids
        </Button>
      </div>
      <p style={{ margin: 0 }}>
        api.getCheckedIds(): <output>{checkedIds}</output>
        <br />
        Submitted: <output>{submitted.join(', ') || 'nothing yet'}</output>
      </p>
    </form>
  );
}
