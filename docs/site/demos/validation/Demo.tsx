'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridLocaleText } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Supplier {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly website: string;
  readonly phone: string;
  readonly card: string;
  readonly code: string;
  readonly zip: string;
  readonly since: string;
  readonly rating: number;
  readonly minOrder: number;
  readonly voucher: string;
}

const suppliers: Supplier[] = [
  { id: 'S-01', name: 'Kopi Roasters', email: 'orders@kopi.example', website: 'https://kopi.example', phone: '+60 4 555 0101', card: '4111111111111111', code: 'KOP-101', zip: '10200', since: '2019-04-01', rating: 4, minOrder: 50, voucher: '' },
  { id: 'S-02', name: 'Tea Garden', email: 'hello@teagarden.example', website: 'https://teagarden.example', phone: '+81 6 555 0102', card: '5500000000000004', code: 'TEA-202', zip: '53000', since: '2021-09-15', rating: 5, minOrder: 20, voucher: '' },
  { id: 'S-03', name: 'Brew Tools', email: 'sales@brewtools.example', website: 'https://brewtools.example', phone: '+49 30 555 0103', card: '340000000000009', code: 'BRW-303', zip: '10115', since: '2020-01-20', rating: 3, minOrder: 100, voucher: '' },
  { id: 'S-04', name: 'Bean Bros', email: 'team@beanbros.example', website: 'https://beanbros.example', phone: '+351 22 555 0104', card: '6011000000000004', code: 'BEA-404', zip: '40000', since: '2018-06-30', rating: 4, minOrder: 25, voucher: '' },
];

// Vouchers already redeemed; the async validator "asks the server".
const usedVouchers = new Set(['WELCOME', 'SPRING']);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const columns: DataGridColumn<Supplier>[] = [
  { field: 'id', header: 'Id', primaryKey: true, width: 80 },
  // Built-in rules with a per-rule message.
  { field: 'name', header: 'Name', width: 150, validation: { required: true, minLength: 3, maxLength: [20, 'Keep the name under 20 characters.'] } },
  // Format rules.
  { field: 'email', header: 'Email', width: 190, validation: { required: true, email: true } },
  { field: 'website', header: 'Website', width: 190, validation: { url: true } },
  { field: 'phone', header: 'Phone', width: 150, validation: { tel: true } },
  { field: 'card', header: 'Card', width: 160, validation: { creditcard: true } },
  { field: 'code', header: 'Code', width: 100, validation: { pattern: '^[A-Z]{3}-\\d{3}$', messages: { pattern: 'Use three capitals, a dash and three digits (ABC-123).' } } },
  { field: 'zip', header: 'Postcode', width: 100, validation: { digits: true, rangeLength: [5, 5] } },
  { field: 'since', header: 'Since (ISO)', width: 120, validation: { dateIso: true } },
  { field: 'rating', header: 'Rating', type: 'number', align: 'end', width: 90, validation: { range: [1, 5] } },
  { field: 'minOrder', header: 'Min order', type: 'number', align: 'end', width: 110, validation: { number: true, min: 1, max: 1000 } },
  {
    field: 'voucher',
    header: 'Voucher (async)',
    width: 150,
    // Custom validator: `string` is the message, `null` passes; async is allowed.
    validation: {
      validate: async (value) => {
        if (value === '' || value == null) return null;
        await delay(300);
        return usedVouchers.has(String(value).toUpperCase()) ? `Voucher ${String(value).toUpperCase()} was already redeemed.` : null;
      },
    },
  },
];

// Localized default messages: `{0}` and `{1}` are the rule arguments.
const localeText: DataGridLocaleText = {
  validationRequired: 'Required.',
  validationMinLength: 'At least {0} characters.',
  validationRangeLength: 'Exactly {0} to {1} characters.',
};

type Mode = 'row' | 'batch';
const MODES = [
  { value: 'row', label: 'row' },
  { value: 'batch', label: 'batch' },
];

export default function ValidationDemo() {
  const api = useRef<DataGridApi<Supplier> | null>(null);
  const [mode, setMode] = useState<Mode>('row');
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <label>
          mode
          <Select aria-label="mode" data={MODES} value={mode} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
        <Button variant="outline" type="button" onClick={() => void api.current?.validateBatch().then((ok) => push(`validateBatch: ${ok ? 'valid' : 'invalid'}`))}>
          validateBatch()
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            const result = api.current?.save();
            push(`save: ${result?.status ?? 'no grid'}${result?.status === 'rejected' ? ` (${result.reason})` : ''}`);
          }}
        >
          save()
        </Button>
      </div>
      <DataGrid<Supplier>
        key={mode}
        aria-label="Suppliers with validation rules"
        data={suppliers}
        columns={columns}
        height={260}
        // Four rows: render every column so each editor is in the DOM.
        virtualization={false}
        locale="en-US"
        localeText={localeText}
        ref={api}
        editing={{
          mode,
          confirmDiscard: false,
          guardUnsaved: false,
          // Row-level rule: runs before the row (or the batch) saves and blocks it.
          validateRow: (row) => (row.rating === 5 && row.minOrder > 50 ? 'Five-star suppliers take orders of 50 or less.' : null),
        }}
        onSave={(e) => push(`saved: +${e.added.length} ~${e.changed.length}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
