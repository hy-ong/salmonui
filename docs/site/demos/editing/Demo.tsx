'use client';

import { useMemo, useRef, useState } from 'react';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridEditing } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const initialOrders = createOrders(500, 9);

// Lookup (foreign-key) table: the cell stores the key, shows the label, and edits with a select.
const categories = [
  { code: 'Coffee', label: 'Coffee beans' },
  { code: 'Tea', label: 'Loose tea' },
  { code: 'Equipment', label: 'Brewing equipment' },
];

const columns: DataGridColumn<Order>[] = [
  // Command column; the last column adds a custom command handled in `onCommandClick`.
  { id: 'commands', header: 'Actions', width: 150, commands: [{ type: 'edit' }, { type: 'delete' }, { type: 'save' }, { type: 'cancel' }] },
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150, validation: { required: true, minLength: 3 } },
  { field: 'category', header: 'Category', width: 160, lookup: { data: categories, keyField: 'code', displayField: 'label' } },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80, validation: { required: true, min: 1, max: 99 }, defaultValue: 1 },
  { field: 'unitPrice', header: 'Price', type: 'number', format: 'C2', align: 'end', width: 100, validation: { min: 0 } },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMdHm', width: 170 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 90 },
  { field: 'priority', header: 'Priority', width: 110, editor: 'select', editorProps: { options: ['Low', 'Normal', 'High'] }, defaultValue: 'Normal' },
  {
    field: 'note',
    header: 'Note (custom editor)',
    width: 220,
    // renderEditor: any element; spread inputProps for the ids, ARIA wiring and focus.
    renderEditor: ({ value, setValue, inputProps }) => (
      <input {...inputProps} className="salmon-data-grid-input salmon-data-grid-editor__input" list="demo-notes" defaultValue={String(value ?? '')} onChange={(e) => setValue(e.currentTarget.value)} />
    ),
  },
  { id: 'more', header: 'More', width: 110, commands: [{ type: 'custom', label: 'Details', title: 'Log the order details' }] },
];

type Mode = NonNullable<DataGridEditing<Order>['mode']>;
const modeItems = (['row', 'batch', 'dialog', 'cell'] as const).map((value) => ({ value, label: value }));

export default function EditingDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [mode, setMode] = useState<Mode>('row');
  const [confirmDelete, setConfirmDelete] = useState(true);
  const [confirmSave, setConfirmSave] = useState(true);
  const [confirmDiscard, setConfirmDiscard] = useState(true);
  const [data, setData] = useState(initialOrders);
  const [log, push] = useEventLog();
  const modules = useMemo(() => [createLookupModule<Order>()], []);
  const editing: DataGridEditing<Order> = {
    mode,
    confirmDelete,
    // Batch mode: a toolbar Save asks first; Cancel asks before it discards.
    confirmSave,
    confirmDiscard,
    undo: true,
    newRow: () => ({ id: `ORD-${20_000 + Math.floor(Math.random() * 10_000)}`, placed: new Date(Date.UTC(2026, 10, 11, 9)) }),
    validateRow: (row) => (row.priority === 'High' && !row.shipped && row.quantity > 10 ? 'High priority orders above 10 items must ship.' : null),
    dialogProps: { width: 520 },
  };
  return (
    <>
      <div className="demo-toolbar">
        <label>
          mode
          <Select aria-label="mode" data={modeItems} value={mode} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
        <Checkbox checked={confirmDelete} onCheckedChange={(checked) => setConfirmDelete(checked)}>
          confirmDelete
        </Checkbox>
        <Checkbox checked={confirmSave} onCheckedChange={(checked) => setConfirmSave(checked)}>
          confirmSave
        </Checkbox>
        <Checkbox checked={confirmDiscard} onCheckedChange={(checked) => setConfirmDiscard(checked)}>
          confirmDiscard
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => push(`undo: ${api.current?.undo().status}`)}>
          Undo
        </Button>
        <Button variant="outline" type="button" onClick={() => push(`redo: ${api.current?.redo().status}`)}>
          Redo
        </Button>
        <Button variant="outline" type="button" onClick={() => void api.current?.validateBatch().then((ok) => push(`validateBatch: ${ok}`))}>
          Validate pending
        </Button>
        <Button variant="outline" type="button" onClick={() => push(`pending: ${JSON.stringify(api.current?.getBatchPreview() ? { dirty: api.current.getBatchPreview()?.dirtyCellCount, added: api.current.getBatchPreview()?.addedRowIds.length, deleted: api.current.getBatchPreview()?.deletedRowIds.length } : null)}`)}>
          Read pending changes
        </Button>
        <Button variant="outline" type="button" onClick={() => setData(initialOrders)}>
          Reset data
        </Button>
      </div>
      <datalist id="demo-notes">
        <option value="Gift wrap" />
        <option value="Leave at door" />
        <option value="Call on arrival" />
      </datalist>
      <DataGrid<Order>
        // The edit mode is initial: a new mode remounts the grid.
        key={mode}
        aria-label="Editable orders"
        data={data}
        columns={columns}
        modules={modules}
        sorting
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        editing={editing}
        toolbar={['add', 'edit', 'delete', 'save', 'cancel']}
        onEditStart={(e) => push(`${e.source}: edit ${e.rowId}${e.field ? ` / ${e.field}` : ''}`)}
        onSave={(e) => push(`save (${e.mode}): +${e.added.length} ~${e.changed.length} −${e.deleted.length}`)}
        onAdd={(e) => push(`add at ${e.position}: ${e.rowId}`)}
        onDelete={(e) => push(`delete ${e.rowIds.join(', ')}${e.mode === 'batch' ? ' (marked until save)' : ''}`)}
        onEditCancel={(e) => push(`cancel (${e.scope})`)}
        onCommandClick={(e) => {
          if (e.command.type === 'custom') push(`details ${e.rowId}: ${e.row?.customer ?? '-'}, ${e.row?.quantity ?? 0} items`);
          else push(`command ${e.command.type} ${e.rowId}`);
        }}
      />
      <EventLog entries={log} />
    </>
  );
}
