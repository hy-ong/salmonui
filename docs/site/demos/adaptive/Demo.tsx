'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { DataGrid, type DataGridAdaptive, type DataGridApi, type DataGridColumn, type DataGridEditing, type DataGridToolbarItemId } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(20_000, 11);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'priority', header: 'Priority', width: 110 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
];

// Constants: option objects are reactive props.
const sorting = { multiple: true };
const filtering = { ui: 'excel' as const };
const selection = { multiple: true };
const paging = { pageSize: 50, pageSizeOptions: [20, 50, 100] };
// Dialog editing: while adaptive, the edit form is a full-screen sheet.
const editing: DataGridEditing<Order> = { mode: 'dialog' };
const toolbar: readonly DataGridToolbarItemId[] = ['add', 'edit', 'search', 'columnChooser'];

const widths = { phone: 380, tablet: 700, desktop: 1000 } as const;

const TARGETS = [
  { value: 'mobile', label: 'mobile (container below 640 px)' },
  { value: 'desktop', label: 'desktop (container 640 px and wider)' },
  { value: 'both', label: 'both' },
];
const FRAMES = [
  { value: 'phone', label: '380 px' },
  { value: 'tablet', label: '700 px' },
  { value: 'desktop', label: '1000 px' },
];

export default function AdaptiveDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [target, setTarget] = useState<NonNullable<DataGridAdaptive['target']>>('mobile');
  const [vertical, setVertical] = useState(true);
  const [frame, setFrame] = useState<keyof typeof widths>('phone');
  const [log, push] = useEventLog();
  // `defaultActive` matches the initial 380 px frame, so the server already renders cards.
  const adaptive: DataGridAdaptive = { target, rowLayout: vertical ? 'vertical' : 'horizontal', breakpoint: 640, defaultActive: true };
  return (
    <>
      <div className="demo-toolbar">
        <label>
          target
          <Select aria-label="target" data={TARGETS} value={target} onValueChange={(value) => value != null && setTarget(value as typeof target)} />
        </label>
        <Checkbox checked={vertical} onCheckedChange={(checked) => setVertical(checked)}>
          vertical rows
        </Checkbox>
        <label>
          frame
          <Select aria-label="frame" data={FRAMES} value={frame} onValueChange={(value) => value != null && setFrame(value as typeof frame)} />
        </label>
        <Button variant="outline" onClick={() => api.current?.openSortDialog()}>
          Open sort sheet
        </Button>
        <Button variant="outline" onClick={() => api.current?.openFilterDialog('country')}>
          Open Country filter sheet
        </Button>
        <Button variant="outline" onClick={() => api.current?.startEdit()}>
          Edit selected record
        </Button>
      </div>
      <div style={{ maxWidth: widths[frame] }}>
        <DataGrid<Order>
          aria-label="Adaptive orders"
          data={orders}
          columns={columns}
          adaptive={adaptive}
          sorting={sorting}
          filtering={filtering}
          selection={selection}
          paging={paging}
          editing={editing}
          toolbar={toolbar}
          columnMenu
          columnChooser
          height={520}
          locale="en-US"
          currency="USD"
          timeZone="UTC"
          ref={api}
          onBeforeAdaptiveDialogOpen={(event) => push(`beforeAdaptiveDialogOpen ${event.kind}${event.field ? ` ${event.field}` : ''} (${event.source})`)}
          onSave={(event) => push(`save ${event.status} ${event.changed.map((c) => `${c.rowId} [${c.fields.join(', ')}]`).join('; ')}`)}
          onSortChange={(event) => push(`sortChange ${event.sortBy.map((s) => `${s.field} ${s.direction}`).join(', ') || 'none'}`)}
        />
      </div>
      <p className="demo-status">On a touch screen, long-press a header for its column menu, or long-press a record to start multi-select and tap more records to add them. Double-click (or double-tap) a record, or select one and use Edit, to edit it in the full-screen sheet. Swiping scrolls the records natively.</p>
      <EventLog entries={log} />
    </>
  );
}
