'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridSelection } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(2_000, 5);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 100 },
];

interface Settings {
  multiple: boolean;
  // Adds the `type: 'selection'` checkbox column.
  checkboxColumn: boolean;
  checkboxOnly: boolean;
  replaceOnRowClick: boolean;
  toggle: boolean;
  additive: boolean;
  persistent: boolean;
}

const initial: Settings = { multiple: true, checkboxColumn: true, checkboxOnly: false, replaceOnRowClick: false, toggle: true, additive: false, persistent: true };

const selectionColumn: DataGridColumn<Order> = { type: 'selection' };
const withCheckbox = [selectionColumn, ...columns];
const MULTIPLE = [
  { value: 'single', label: 'single' },
  { value: 'multiple', label: 'multiple' },
];

function toSelection(s: Settings, rowIds: readonly string[]): DataGridSelection {
  return {
    multiple: s.multiple,
    mode: 'row',
    checkboxOnly: s.checkboxOnly,
    checkboxRowClick: s.replaceOnRowClick ? 'replace' : 'add',
    toggle: s.toggle,
    additive: s.additive,
    persistent: s.persistent,
    rowIds,
  };
}

export default function SelectionRowsDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [settings, setSettings] = useState<Settings>(initial);
  const [selected, setSelected] = useState<readonly string[]>(['ORD-10001', 'ORD-10003']);
  const [lockFirst, setLockFirst] = useState(false);
  const [log, push] = useEventLog();
  const flag = (key: keyof Settings) => (
    <Checkbox checked={Boolean(settings[key])} onCheckedChange={(checked) => setSettings({ ...settings, [key]: checked })}>
      {key}
    </Checkbox>
  );
  return (
    <>
      <div className="demo-toolbar">
        <label>
          multiple
          <Select aria-label="multiple" data={MULTIPLE} value={settings.multiple ? 'multiple' : 'single'} onValueChange={(value) => value != null && setSettings({ ...settings, multiple: value === 'multiple' })} />
        </label>
        {flag('checkboxColumn')}
        {flag('checkboxOnly')}
        {flag('replaceOnRowClick')}
        {flag('toggle')}
        {flag('additive')}
        {flag('persistent')}
        <Checkbox checked={lockFirst} onCheckedChange={(checked) => setLockFirst(checked)}>
          Cancel changes that touch ORD-10000
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.selectRows(['ORD-10005', 'ORD-10006'])}>
          Select 10005, 10006
        </Button>
        <Button variant="outline" onClick={() => api.current?.selectRowRange('ORD-10010', 'ORD-10020', { mode: 'add' })}>
          Add range 10010–10020
        </Button>
        <Button variant="outline" onClick={() => api.current?.selectAll({ scope: 'filtered' })}>
          Select all (filtered)
        </Button>
        <Button variant="outline" onClick={() => api.current?.filterColumn('country', 'equal', 'Japan')}>
          Filter: Japan
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearFiltering()}>
          Clear filter
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearSelection()}>
          Clear selection
        </Button>
        <Button variant="outline" onClick={() => push(`getSelectedRows(): ${api.current?.getSelectedRows().length ?? 0} rows; scope ${api.current?.getSelection()?.scope ?? '-'}`)}>
          Read selection
        </Button>
      </div>
      <DataGrid<Order>
        key={JSON.stringify(settings)}
        aria-label="Orders with row selection"
        data={orders}
        columns={settings.checkboxColumn ? withCheckbox : columns}
        sorting
        filtering
        height={360}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        selection={toSelection(settings, selected)}
        onBeforeSelectionChange={(event) => {
          if (lockFirst && (event.added.includes('ORD-10000') || event.removed.includes('ORD-10000'))) {
            push('cancelled: ORD-10000 is locked');
            event.preventDefault();
          }
        }}
        onSelectionChange={(event) => {
          setSelected(event.rowIds);
          push(`${event.source}: +${event.added.length} −${event.removed.length} → ${event.scope === 'allFiltered' ? `all filtered except ${event.excludedRowIds.length}` : `${event.rowIds.length} selected`}`);
        }}
      />
      <EventLog entries={log} />
    </>
  );
}
