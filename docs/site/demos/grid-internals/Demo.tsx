'use client';

import { useRef, useState } from 'react';
import { createDataGridApi, createDataGridEngine, createRowModel, defineDataGridModule, type DataGridCommand, type RowModelSnapshot } from '@salmonui/data-grid/engine';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const initialOrders = createOrders(500, 83);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

/** A custom core module: one serializable command and a filter stage in the query pipeline. */
type MinAmountCommand = { type: 'minAmount.set'; min: number };
const minAmountModule = defineDataGridModule<Order, { min: number }, MinAmountCommand, 'minAmount'>({
  name: 'minAmount',
  commands: ['minAmount.set'],
  initialState: () => ({ min: 0 }),
  reduce: (state, command) => (command.min === state.min ? state : { min: command.min }),
  pipeline: [
    {
      name: 'filter',
      key: (_query, state) => [state.min],
      run(input: RowModelSnapshot<Order>, ctx) {
        if (ctx.state.min === 0) return input;
        const keep: number[] = [];
        for (let i = 0; i < input.count; i++) {
          const at = input.order ? (input.order[i] as number) : i;
          if ((input.source[at]?.amount ?? 0) >= ctx.state.min) keep.push(at);
        }
        return createRowModel(input, Int32Array.from(keep));
      },
    },
  ],
});
const modules = [minAmountModule];

/** A core engine created outside `DataGrid` is disposed by its owner. */
function disposeStandaloneEngine(): string {
  const engine = createDataGridEngine<Order>({ columns: [{ field: 'id' }], dataSource: initialOrders.slice(0, 3), getRowId: (row) => row.id });
  const api = createDataGridApi(engine);
  const before = api.getViewRows().length;
  api.dispose();
  let after: string;
  try {
    after = engine.dispatch({ type: 'columns.hide', keys: ['id'] } as DataGridCommand).status;
  } catch (error) {
    after = `throws (${error instanceof Error ? error.message : String(error)})`;
  }
  return `standalone engine: ${before} rows, disposed=${engine.disposed}, dispatch after dispose: ${after}`;
}

export default function DataGridInternalsDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [log, push] = useEventLog();
  const [data, setData] = useState(initialOrders);
  const recorded = useRef<DataGridCommand[]>([]);
  const [recording, setRecording] = useState('');
  const unsubscribe = useRef<(() => void)[]>([]);
  const onReady = (grid: DataGridApi<Order>) => {
    // onReady runs once per mount (twice under StrictMode): drop the listeners of an earlier mount.
    for (const off of unsubscribe.current) off();
    // Fine-grained subscription: one cell, outside React rendering.
    const offCell = grid.engine.subscribeCell('ORD-10001', 'amount', () => push(`subscribeCell ORD-10001/amount: ${grid.engine.getCellSnapshot('ORD-10001', 'amount')?.formattedValue ?? '-'}`));
    // Every applied command is a plain, serializable object.
    const offCommands = grid.engine.onCommand(({ command, result }) => {
      if (result.status === 'rejected' || command.type.startsWith('focus.') || command.type.startsWith('selection.')) return;
      recorded.current = [...recorded.current, command];
      setRecording(JSON.stringify(recorded.current));
    });
    unsubscribe.current = [offCell, offCommands];
  };
  return (
    <>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          onClick={() => {
            const a = api.current;
            if (!a) return;
            push(`element: ${a.element?.className.split(' ')[0]}; header: ${a.getPartElement('header')?.className.split(' ')[0]}; body: ${a.getPartElement('body')?.className.split(' ')[0]}; Amount header: ${a.getHeaderElement('amount')?.textContent}`);
          }}
        >
          Read part elements
        </Button>
        <Button variant="outline" onClick={() => setData((rows) => rows.map((row) => (row.id === 'ORD-10001' ? { ...row, amount: row.amount + 1 } : row)))}>
          Add 1 to ORD-10001 amount
        </Button>
        <Button variant="outline" onClick={() => push(`minAmount.set: ${api.current?.engine.dispatch({ type: 'minAmount.set', min: 500 } as DataGridCommand).status}; ${api.current?.getViewRows().length} view rows`)}>
          Keep amounts ≥ 500 (custom module)
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const a = api.current;
            if (!a) return;
            const commands = recorded.current;
            a.clearSorting();
            a.engine.dispatch({ type: 'minAmount.set', min: 0 } as DataGridCommand);
            recorded.current = [];
            for (const command of commands) a.engine.dispatch(command);
            push(`replayed ${commands.length} commands; first row ${a.getViewRows()[0]?.id ?? '-'}`);
          }}
        >
          Reset and replay
        </Button>
        <Button variant="outline" onClick={() => push(disposeStandaloneEngine())}>
          Dispose a standalone engine
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with a custom module and a command recorder"
        data={data}
        columns={columns}
        modules={modules}
        sorting
        height={300}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onReady={onReady}
      />
      <pre className="demo-log" aria-label="Recorded commands">
        {recording || '(sort a column or use the custom module)'}
      </pre>
      <EventLog entries={log} />
    </>
  );
}
