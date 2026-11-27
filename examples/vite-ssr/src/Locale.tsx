// `?locale`: components of several families under one LocaleProvider with the
// zh-TW pack, server rendered and hydrated (tests/browser/ssr-locale.spec.ts).
// The server markup is already in Traditional
// Chinese; hydration in StrictMode reports nothing. The page imports only
// the pack families it renders, so its bundle carries no other translations.
import { Button } from '@salmonui/buttons/button';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { LocaleProvider } from '@salmonui/core/locale';
import { calendar, dataGrid, dateField, datePicker, locale, numberField, select, textField, validation } from '@salmonui/core/locale/zh-TW';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { Form } from '@salmonui/inputs/form';
import { NumberField } from '@salmonui/inputs/number-field';
import { TextField } from '@salmonui/inputs/text-field';

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly amount: number;
  readonly placed: Date;
}

const CUSTOMERS = ['王小明', '李美玲', '陳志豪', '林雅婷'];
const orders: Order[] = Array.from({ length: 36 }, (_, i) => ({
  id: `SO-${String(1001 + i)}`,
  customer: CUSTOMERS[i % CUSTOMERS.length]!,
  amount: 150 + ((i * 41) % 800),
  placed: new Date(Date.UTC(2026, 10, 1 + (i % 26), 2)),
}));
const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: '訂單編號', primaryKey: true, width: 120 },
  { field: 'customer', header: '客戶', width: 120 },
  { field: 'amount', header: '金額', type: 'number', format: 'C0', align: 'end', width: 120 },
  { field: 'placed', header: '下單日期', type: 'date', format: 'yMMMd', width: 160 },
];
const text = { calendar, dataGrid, dateField, datePicker, numberField, select, textField, validation };
const paging = { pageSize: 10, pageSizeOptions: [10, 20] } as const;
const statuses = [
  { value: 'unpaid', label: '待付款' },
  { value: 'done', label: '已完成' },
];

export function LocalePage() {
  return (
    <LocaleProvider locale={locale} localeText={text}>
      <main lang="zh-TW" style={{ display: 'grid', gap: 16, padding: 16 }}>
        <DataGrid<Order> aria-label="訂單" data={orders} columns={columns} sorting paging={paging} currency="TWD" timeZone="Asia/Taipei" height="auto" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <DatePicker label="下單日期" name="placed" defaultValue="2026-11-26" clearable />
          <div style={{ display: 'grid', gap: 4 }}>
            <label htmlFor="ssr-status">訂單狀態</label>
            <Select id="ssr-status" data={statuses} defaultValue="unpaid" name="status" clearable />
          </div>
        </div>
        <Form style={{ display: 'grid', gap: 12, maxWidth: 360 }} onSubmit={(event) => event.preventDefault()}>
          <TextField name="name" label="客戶名稱" required />
          <NumberField name="quantity" label="數量" required min={1} />
          <Button type="submit" tone="primary" style={{ justifySelf: 'start' }}>
            建立訂單
          </Button>
        </Form>
      </main>
    </LocaleProvider>
  );
}
