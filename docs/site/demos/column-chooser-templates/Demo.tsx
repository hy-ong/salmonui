'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridColumnChooser } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(1_000, 5);

const columns: DataGridColumn<Order>[] = [
  // Not listed in the chooser: the key column stays visible.
  { field: 'id', header: 'Order', primaryKey: true, width: 120, hideable: false },
  { field: 'customer', header: 'Client', width: 150 },
  {
    id: 'region',
    header: 'Région',
    columns: [
      { field: 'country', header: 'Pays', width: 120 },
      { field: 'city', header: 'Ville', width: 120 },
    ],
  },
  { field: 'product', header: 'Produit', width: 140 },
  { field: 'category', header: 'Catégorie', width: 120, hidden: true },
  { field: 'quantity', header: 'Quantité', type: 'number', align: 'end', width: 100 },
  { field: 'unitPrice', header: 'Prix unitaire', type: 'number', format: 'C2', align: 'end', width: 130, hidden: true },
  { field: 'amount', header: 'Montant', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'placed', header: 'Commandé', type: 'date', format: 'yMMMd', width: 130 },
  { field: 'note', header: 'Détails', width: 200, hidden: true },
];

// Search ignores accents ("categorie" finds "Catégorie") and waits 200 ms after typing; a header line
// and a footer with a "Show all" action next to the built-in OK / Cancel buttons. A constant: the
// options prop is reactive.
const chooser: DataGridColumnChooser<Order> = {
  searchable: true,
  ignoreAccents: true,
  debounce: 200,
  searchOperator: 'contains',
  renderHeader: ({ columns: items }) => (
    <p className="demo-chooser__summary" style={{ margin: '0 0 8px' }}>
      {items.filter((c) => !c.hidden).length} of {items.length} columns shown
    </p>
  ),
  renderFooter: ({ columns: items, setHidden, defaultContent }) => (
    <div className="demo-chooser__footer" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
      <button type="button" className="salmon-data-grid-button" onClick={() => setHidden(items.map((c) => c.field), false)}>
        Show all
      </button>
      {defaultContent}
    </div>
  ),
};

export default function ColumnChooserTemplatesDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.openColumnChooser({ x: 24, y: 24 })}>
          Open at the viewport corner
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with a templated column chooser"
        data={orders}
        columns={columns}
        toolbar={['columnChooser']}
        columnChooser={chooser}
        onBeforeColumnChooserOpen={(e) => push(`chooser opened: ${e.columns.length} columns`)}
        onColumnVisibilityChange={(e) => push(`shown: ${e.shown.join(', ') || '-'}; hidden: ${e.hidden.join(', ') || '-'}`)}
        height={360}
        locale="fr-FR"
        currency="EUR"
        timeZone="UTC"
        ref={api}
      />
      <EventLog entries={log} label="Column visibility" />
    </>
  );
}
