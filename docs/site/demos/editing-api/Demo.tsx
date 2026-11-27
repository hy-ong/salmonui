'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridActionResult, type DataGridApi, type DataGridColumn, type DataGridEditing } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(200, 21);

const columns: DataGridColumn<Order>[] = [
  // The primary key identifies rows for every edit; it is read-only on existing rows.
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  // Read-only column.
  { field: 'country', header: 'Country (read-only)', width: 180, editable: false },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80, defaultValue: 1 },
  { field: 'unitPrice', header: 'Price', type: 'number', format: 'C2', align: 'end', width: 100, defaultValue: 10 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 90 },
  { field: 'priority', header: 'Priority', width: 110, editor: 'select', editorProps: { options: ['Low', 'Normal', 'High'] }, defaultValue: 'Normal' },
];

type Mode = 'row' | 'batch' | 'cell';
const MODES = [
  { value: 'row', label: 'row' },
  { value: 'batch', label: 'batch' },
  { value: 'cell', label: 'cell' },
];
const POSITIONS = [
  { value: 'top', label: 'top' },
  { value: 'bottom', label: 'bottom' },
];
let nextId = 30_000;

export default function EditingApiDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [mode, setMode] = useState<Mode>('batch');
  const [flags, setFlags] = useState({ edit: true, add: true, delete: true, tabToNextRow: true, lockShipped: true, blockFirstRow: false });
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const [log, push] = useEventLog(40);
  const toggle = (key: keyof typeof flags) => setFlags((f) => ({ ...f, [key]: !f[key] }));
  const editing: DataGridEditing<Order> = {
    mode,
    edit: flags.edit,
    add: flags.add,
    delete: flags.delete,
    newRowPosition: position,
    tabToNextRow: flags.tabToNextRow,
    confirmDiscard: false,
    guardUnsaved: false,
    // Per-cell policy: shipped orders keep their quantity.
    isCellEditable: (ctx) => !(flags.lockShipped && ctx.columnId === 'quantity' && ctx.row.shipped),
    newRow: () => ({ id: `ORD-${nextId++}` }),
  };
  const report = (label: string, result: DataGridActionResult | undefined) =>
    push(`${label}: ${result?.status ?? 'no grid'}${result?.status === 'rejected' ? ` (${result.reason})` : ''}`);
  const first = () => api.current?.getViewRows()[0]?.id;
  return (
    <>
      <div className="demo-toolbar">
        <label>
          mode
          <Select aria-label="mode" data={MODES} value={mode} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
        <label>
          newRowPosition
          <Select aria-label="newRowPosition" data={POSITIONS} value={position} onValueChange={(value) => value != null && setPosition(value as 'top' | 'bottom')} />
        </label>
        {(['edit', 'add', 'delete', 'tabToNextRow'] as const).map((key) => (
          <Checkbox key={key} checked={flags[key]} onCheckedChange={() => toggle(key)}>
            {key}
          </Checkbox>
        ))}
        <Checkbox checked={flags.lockShipped} onCheckedChange={() => toggle('lockShipped')}>
          isCellEditable: lock shipped Qty
        </Checkbox>
        <Checkbox checked={flags.blockFirstRow} onCheckedChange={() => toggle('blockFirstRow')}>
          onBeforeEditStart: block the first row
        </Checkbox>
      </div>
      <div className="demo-toolbar" aria-label="Edit methods">
        <Button variant="outline" onClick={() => report('startEdit', api.current?.startEdit(first(), 'customer'))}>
          startEdit(first row)
        </Button>
        <Button variant="outline" onClick={() => report('addRow', api.current?.addRow({ customer: 'Added by API' }))}>
          addRow()
        </Button>
        <Button variant="outline" onClick={() => report('deleteRows', api.current?.deleteRows())}>
          deleteRows(selected)
        </Button>
        <Button variant="outline" onClick={() => report('updateRow', api.current?.updateRow(first() ?? '', { customer: 'Updated row', quantity: 7 }))}>
          updateRow(first row)
        </Button>
        <Button variant="outline" onClick={() => report('updateCell', api.current?.updateCell(first() ?? '', 'priority', 'High'))}>
          updateCell(first row, priority)
        </Button>
        <Button variant="outline" onClick={() => report('save', api.current?.save())}>
          save()
        </Button>
        <Button variant="outline" onClick={() => report('cancelEdit', api.current?.cancelEdit())}>
          cancelEdit()
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const changes = api.current?.getPendingChanges();
            push(`getPendingChanges: added ${changes?.addedRecords.length ?? 0}, changed ${changes?.changedRecords.length ?? 0}, deleted ${changes?.deletedRecords.length ?? 0}`);
          }}
        >
          getPendingChanges()
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const rows = api.current?.getViewRows().slice(0, 5) ?? [];
            report('applyChanges', api.current?.applyChanges({ changed: rows.map((row) => ({ ...row, priority: 'Low' as const })) }));
          }}
        >
          applyChanges(5 rows → Low)
        </Button>
      </div>
      <DataGrid<Order>
        // `mode` and the capability flags are initial: a new value remounts the grid.
        key={`${mode}-${JSON.stringify(flags)}-${position}`}
        aria-label="Edit methods and events"
        data={orders}
        columns={columns}
        selection={{ multiple: true }}
        height={340}
        locale="en-US"
        currency="USD"
        ref={api}
        editing={editing}
        onBeforeEditStart={(e) => {
          if (flags.blockFirstRow && e.rowId === first()) {
            e.preventDefault();
            push(`onBeforeEditStart: prevented ${e.rowId}`);
          }
        }}
        onEditStart={(e) => push(`onEditStart: ${e.rowId}${e.field ? ` / ${e.field}` : ''} (${e.source})`)}
        onCellValueChange={(e) => push(`onCellValueChange: ${e.field} ${String(e.previousValue)} → ${String(e.value)}`)}
        onBeforeSave={(e) => push(`onBeforeSave: +${e.added.length} ~${e.changed.length} −${e.deleted.length}`)}
        onSave={(e) => push(`onSave (${e.mode}): +${e.added.length} ~${e.changed.length} −${e.deleted.length}`)}
        onBeforeAdd={() => push('onBeforeAdd')}
        onAdd={(e) => push(`onAdd at ${e.position}: ${e.rowId}`)}
        onBeforeDelete={(e) => push(`onBeforeDelete: ${e.rowIds.join(', ')}`)}
        onDelete={(e) => push(`onDelete: ${e.rowIds.join(', ')}`)}
        onEditCancel={(e) => push(`onEditCancel (${e.scope})`)}
      />
      <EventLog entries={log} label="Edit events" />
    </>
  );
}
