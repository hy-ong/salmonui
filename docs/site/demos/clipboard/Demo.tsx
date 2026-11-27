'use client';

import { useMemo, useRef, useState } from 'react';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { TextArea } from '@salmonui/inputs/text-field';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(2_000, 31);

// Lookup (foreign-key) column: copies its display text.
const categories = [
  { code: 'Coffee', label: 'Coffee beans' },
  { code: 'Tea', label: 'Loose tea' },
  { code: 'Equipment', label: 'Brewing equipment' },
];

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 140 },
  { field: 'category', header: 'Category', width: 160, lookup: { data: categories, keyField: 'code', displayField: 'label' } },
  // Read-only: paste skips it.
  { field: 'country', header: 'Country (read-only)', width: 170, editable: false },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  // Copies the formatted text ("$18.50"); a pasted "$20.00" parses back to 20.
  { field: 'unitPrice', header: 'Price', type: 'number', format: 'C2', align: 'end', width: 100 },
  // Raw copy: `clipboardFormatter` wins over the display format.
  { field: 'amount', header: 'Amount (raw copy)', type: 'number', format: 'C2', align: 'end', width: 170, clipboardFormatter: (value) => Number(value).toFixed(2) },
];

// `editing` brings the clipboard: Ctrl/⌘+C, Ctrl+Shift+H, Ctrl/⌘+V, copy(), paste() and the copy items.
const editing = { mode: 'batch', confirmDiscard: false, guardUnsaved: false } as const;
const selection = { mode: 'cell', cellRange: 'box', multiple: true } as const;
const toolbar = ['copy', 'save', 'cancel'] as const;
const contextMenu = ['copy'] as const;

export default function ClipboardDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const modules = useMemo(() => [createLookupModule<Order>()], []);
  const [copied, setCopied] = useState('');
  // Customer, Category (a lookup key), Country (read-only: skipped), Qty.
  const [pasteText, setPasteText] = useState('Pasted one\tTea\tIgnored\t5\nPasted two\tCoffee\tIgnored\t6');
  const [semicolons, setSemicolons] = useState(false);
  const [blockPaste, setBlockPaste] = useState(false);
  const [log, push] = useEventLog();
  const result = (name: string, r: { status: string; reason?: string } | undefined) => push(`${name}: ${r?.status ?? 'no grid'}${r?.status === 'rejected' ? ` (${r.reason})` : ''}`);

  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => result('copy()', api.current?.copy())}>
          copy()
        </Button>
        <Button variant="outline" type="button" onClick={() => result('copy({ includeHeaders: true })', api.current?.copy({ includeHeaders: true }))}>
          {'copy({ includeHeaders: true })'}
        </Button>
        <Button variant="outline" type="button" onClick={() => result('copy({ copyFormatted: false })', api.current?.copy({ copyFormatted: false }))}>
          {'copy({ copyFormatted: false })'}
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.selectCellRange({ rowId: 'ORD-10000', field: 'customer' }, { rowId: 'ORD-10002', field: 'amount' })}>
          Select 3 rows × Customer–Amount
        </Button>
        <Button variant="outline" type="button" onClick={() => result('paste', api.current?.paste(pasteText))}>
          Paste the text below
        </Button>
        <Button variant="outline" type="button" onClick={() => result('paste()', api.current?.paste())}>
          Paste from the clipboard
        </Button>
        <Checkbox checked={semicolons} onCheckedChange={(checked) => setSemicolons(checked)}>
          Copy with semicolons
        </Checkbox>
        <Checkbox checked={blockPaste} onCheckedChange={(checked) => setBlockPaste(checked)}>
          Cancel pastes
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Clipboard copy and paste"
        data={orders}
        columns={columns}
        modules={modules}
        height={320}
        locale="en-US"
        currency="USD"
        ref={api}
        selection={selection}
        editing={editing}
        toolbar={toolbar}
        contextMenu={contextMenu}
        onBeforeCopy={(e) => {
          // assigning `data` replaces the text written to the clipboard.
          if (semicolons) e.data = e.data.replaceAll('\t', ';');
          setCopied(e.data);
          push(`copy${e.includeHeaders ? ' with headers' : ''}: ${e.cells} cells from the ${e.copied} (${e.source})`);
        }}
        onBeforePaste={(e) => {
          push(`onBeforePaste (${e.source}): ${e.data.length} characters at ${e.target ? `${e.target.rowId} / ${e.target.field}` : 'no target'}${blockPaste ? ', cancelled' : ''}`);
          if (blockPaste) e.preventDefault();
        }}
      />
      <div className="demo-toolbar" style={{ marginBlockStart: 'var(--salmon-space-4)' }}>
        <TextArea label="Last copy (TSV)" aria-label="Last copy" readOnly rows={4} cols={60} value={copied} />
        <TextArea label="Text to paste (TSV)" aria-label="Text to paste" rows={4} cols={40} value={pasteText} onValueChange={(value) => setPasteText(value)} />
      </div>
      <EventLog entries={log} />
    </>
  );
}
