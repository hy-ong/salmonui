'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn, type DataGridFilterContext, type DataGridFilterUi, type DataGridFiltering } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(600, 8);

const FILTER_UIS = [
  { value: 'menu', label: 'Menu' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'excel', label: 'Excel' },
];

/** Menu value editor template (`renderFilter`): a dropdown of the categories. */
function CategoryFilter(ctx: DataGridFilterContext<Order>) {
  return (
    <select className="salmon-data-grid-input" style={{ inlineSize: '100%' }} aria-label="Category value" value={typeof ctx.value === 'string' ? ctx.value : ''} onChange={(event) => ctx.setValue(event.target.value)}>
      <option value="">Any category</option>
      <option value="Coffee">Coffee</option>
      <option value="Tea">Tea</option>
      <option value="Equipment">Equipment</option>
    </select>
  );
}

/** Lower case without spaces or hyphens: "bao-nguyen" and "Bao Nguyen" compare equal. */
const squash = (value: unknown): string => String(value ?? '').toLowerCase().replace(/[\s-]+/g, '');

/**
 * Custom filter comparer (`filterComparator`): decides each built-in
 * operator on the squashed text. It runs once per distinct name, not per row.
 */
const nameComparator: NonNullable<DataGridColumn<Order>['filterComparator']> = (value, filterValue, operator) => {
  const cell = squash(value);
  // The checklist sends `in` / `notIn` with the checked values.
  if (operator === 'in' || operator === 'notIn') {
    const hit = (Array.isArray(filterValue) ? filterValue : [filterValue]).some((v) => squash(v) === cell);
    return operator === 'in' ? hit : !hit;
  }
  const text = squash(filterValue);
  switch (operator) {
    case 'contains':
      return cell.includes(text);
    case 'doesNotContain':
      return !cell.includes(text);
    case 'startsWith':
      return cell.startsWith(text);
    case 'endsWith':
      return cell.endsWith(text);
    case 'notEqual':
      return cell !== text;
    case 'isEmpty':
      return cell === '';
    case 'isNotEmpty':
      return cell !== '';
    default:
      return cell === text;
  }
};

const columns: DataGridColumn<Order>[] = [
  // 600 distinct values: the checklist loads 50 at a time as it scrolls.
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  // Custom comparer: "baonguyen" or "bao-nguyen" finds "Bao Nguyen".
  { field: 'customer', header: 'Customer', width: 140, filterComparator: nameComparator },
  // Per-column UI: always a checklist, whatever `filtering.ui` says.
  { field: 'country', header: 'Country', width: 120, filter: { ui: 'checklist' } },
  { field: 'category', header: 'Category', width: 120, filter: { operator: 'equal' }, renderFilter: CategoryFilter },
  // Per-column operators and editor attributes.
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80, filter: { operators: ['equal', 'greaterThan', 'lessThan', 'between'], editorProps: { min: 1, max: 12, step: 1 } } },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'placed', header: 'Placed', type: 'date', format: 'yMMMd', width: 130 },
  { id: 'placedAt', field: 'placed', header: 'Placed at', type: 'datetime', format: 'yMMMdHm', width: 190 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 120 },
  // Most notes are empty: the checklist lists them as one Blanks entry.
  { field: 'note', header: 'Note', width: 200 },
];

// String columns offer these operators, in this order (the first is the default).
const operators: NonNullable<DataGridFiltering['operators']> = { string: ['contains', 'startsWith', 'endsWith', 'equal', 'notEqual', 'like', 'isEmpty', 'isNotEmpty'] };

export default function FilterMenusDemo() {
  const [ui, setUi] = useState<DataGridFilterUi>('excel');
  const [blockNote, setBlockNote] = useState(false);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Filter UI{' '}
          <Select aria-label="Filter UI" data={FILTER_UIS} value={ui} onValueChange={(value) => value != null && setUi(value as DataGridFilterUi)} />
        </label>
        <Checkbox checked={blockNote} onCheckedChange={(checked) => setBlockNote(checked)}>
          Cancel the Note filter menu
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders with filter menus"
        data={orders}
        columns={columns}
        filtering={{ ui, operators, checklistPageSize: 50 }}
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        // Menu open events: the before-event can cancel the opening.
        onBeforeFilterMenuOpen={(event) => {
          if (blockNote && event.field === 'note') {
            event.preventDefault();
            push(`beforeFilterMenuOpen (${event.field}, ${event.ui}, ${event.dialog}): prevented`);
            return;
          }
          push(`beforeFilterMenuOpen (${event.field}, ${event.ui}, ${event.dialog})`);
        }}
        onFilterMenuOpen={(event) => push(`filterMenuOpen (${event.field}, ${event.ui}, ${event.dialog})`)}
        onFilterChange={(event) => push(`filterChange (${event.field ?? 'all'}): ${JSON.stringify(event.filters)}`)}
      />
      <p className="demo-status">Open a header&apos;s filter button, or focus a header and press Alt+↓.</p>
      <EventLog entries={log} label="Filter events" />
    </>
  );
}
