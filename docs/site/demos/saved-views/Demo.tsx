'use client';

import { useEffect, useRef, useState } from 'react';
import { createMemoryStore, type KeyValueStore } from '@salmonui/data';
import { createSavedViews, type SavedView, type SavedViews } from '@salmonui/data/views';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridState } from '@salmonui/data-grid';
import { TextField } from '@salmonui/inputs/text-field';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(1_000, 23);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

/** localStorage when the browser allows it, else memory. Called in an effect only (never on the server). */
function browserStore(): KeyValueStore {
  try {
    const storage = globalThis.localStorage;
    if (storage) return storage;
  } catch {
    // Private mode or blocked storage.
  }
  return createMemoryStore();
}

export default function SavedViewsDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [views, setViews] = useState<SavedViews<DataGridState> | null>(null);
  const [list, setList] = useState<readonly SavedView<DataGridState>[]>([]);
  const [name, setName] = useState('My view');
  const [status, setStatus] = useState('Sort, filter, group or resize, then save the layout as a named view.');

  useEffect(() => {
    const store = createSavedViews<DataGridState>(browserStore(), { gridId: 'docs-saved-views' });
    setViews(store);
    const off = store.subscribe(setList);
    void store.list().then(setList);
    return off;
  }, []);

  return (
    <>
      <div className="demo-toolbar">
        <label>
          View name{' '}
          <TextField value={name} onValueChange={setName} aria-label="View name" />
        </label>
        <Button
          variant="outline"
          disabled={!views || name.trim() === ''}
          onClick={async () => {
            const state = api.current?.getState({ exclude: ['selection', 'scroll'] });
            if (!views || !state) return;
            const existing = list.find((v) => v.name === name.trim());
            const view = await views.save({ ...(existing ? { id: existing.id } : {}), name: name.trim(), state });
            setStatus(`${existing ? 'Updated' : 'Saved'} view "${view.name}".`);
          }}
        >
          Save view
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (!api.current) return;
            api.current.resetState();
            setStatus('Back to the default layout.');
          }}
        >
          Default layout
        </Button>
      </div>
      <div className="demo-toolbar" role="group" aria-label="Saved views">
        {list.length === 0 ? <span>No saved views yet.</span> : null}
        {list.map((view) => (
          <span key={view.id}>
            <Button
              variant="outline"
              onClick={() => {
                const result = api.current?.restoreState(view.state);
                if (result) setStatus(`Applied "${view.name}": ${result.status}.`);
              }}
            >
              {view.name}
            </Button>{' '}
            <Button
              variant="outline"
              aria-label={`Delete view ${view.name}`}
              onClick={async () => {
                await views?.remove(view.id);
                setStatus(`Deleted "${view.name}".`);
              }}
            >
              Delete
            </Button>
          </span>
        ))}
      </div>
      <DataGrid<Order>
        id="docs-saved-views"
        aria-label="Orders with named saved views"
        data={orders}
        columns={columns}
        sorting={{ multiple: true }}
        filtering
        grouping
        paging={{ pageSize: 10 }}
        resizable
        reorderable
        height={360}
        locale="en-US"
        currency="USD"
        ref={api}
      />
      <p className="demo-status" aria-live="polite">
        {status}
      </p>
    </>
  );
}
