'use client';

// Components of several families inside the zh-TW provider of ./layout.tsx.
import { Button } from '@salmonui/buttons/button';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { Pager } from '@salmonui/navigation/pager';
import { Toaster, useToast } from '@salmonui/notifications/toast';

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly amount: number;
}

const CUSTOMERS = ['王小明', '李美玲', '陳志豪', '林雅婷'];
const orders: Order[] = Array.from({ length: 36 }, (_, i) => ({ id: `SO-${String(1001 + i)}`, customer: CUSTOMERS[i % CUSTOMERS.length]!, amount: 150 + ((i * 41) % 800) }));
const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: '訂單編號', primaryKey: true, width: 120 },
  { field: 'customer', header: '客戶', width: 120 },
  { field: 'amount', header: '金額', type: 'number', format: 'C0', align: 'end', width: 120 },
];
const paging = { pageSize: 10, pageSizeOptions: [10, 20] } as const;
const statuses = [
  { value: 'unpaid', label: '待付款' },
  { value: 'done', label: '已完成' },
];

function Save() {
  const toast = useToast();
  return <Button onClick={() => toast.add({ title: '已儲存', tone: 'success', dismissible: true })}>儲存</Button>;
}

export function LocalePanel() {
  return (
    <Toaster>
      <main style={{ display: 'grid', gap: 16, padding: 16 }}>
        <DataGrid<Order> aria-label="訂單" data={orders} columns={columns} sorting paging={paging} currency="TWD" height="auto" />
        <Pager aria-label="操作紀錄分頁" totalCount={480} pageSizeOptions={[10, 20, 50]} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <DatePicker label="下單日期" defaultValue="2026-11-26" clearable />
          <div style={{ display: 'grid', gap: 4 }}>
            <label htmlFor="next-status">訂單狀態</label>
            <Select id="next-status" data={statuses} defaultValue="unpaid" clearable />
          </div>
          <Save />
        </div>
      </main>
    </Toaster>
  );
}
