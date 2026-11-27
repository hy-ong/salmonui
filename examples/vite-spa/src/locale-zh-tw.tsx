// LocaleProvider browser page (tests/browser/locale-zh-tw.spec.ts):
// components of several families under one `<LocaleProvider locale="zh-TW" localeText={zhTW}>`.
//
//   ?lang=en        the same page without the provider (built-in English)
//   ?scheme=dark
//
// Ids: #orders (DataGrid with paging, sorting, filtering, selection), #pager, #placed (DatePicker),
// #range (DateRangePicker), #status (Select), #customer (Combobox), #order-form (Form: TextField and
// NumberField required, #submit), #upload (FileUpload), #details (Dialog trigger), #delete (useConfirm),
// #toast (Toaster add).
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/styles.css';
import '@salmonui/calendars/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/dropdowns/styles.css';
import '@salmonui/inputs/styles.css';
import '@salmonui/navigation/styles.css';
import '@salmonui/notifications/styles.css';
import '@salmonui/overlays/styles.css';
import './app.css';
import { Button } from '@salmonui/buttons/button';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { ThemeProvider } from '@salmonui/core/theme';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { Select } from '@salmonui/dropdowns/select';
import { FileUpload } from '@salmonui/inputs/file-upload';
import { Form } from '@salmonui/inputs/form';
import { NumberField } from '@salmonui/inputs/number-field';
import { TextField } from '@salmonui/inputs/text-field';
import { BreadcrumbItem, Breadcrumbs } from '@salmonui/navigation/breadcrumbs';
import { Pager } from '@salmonui/navigation/pager';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { Toaster, useToast } from '@salmonui/notifications/toast';
import { Dialog, DialogProvider, useConfirm } from '@salmonui/overlays/dialog';

const params = new URLSearchParams(location.search);
const english = params.get('lang') === 'en';

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly amount: number;
  readonly placed: Date;
}

const CUSTOMERS = ['王小明', '李美玲', '陳志豪', '林雅婷', '張家豪', '黃淑芬'];
const ORDERS: readonly Order[] = Array.from({ length: 45 }, (_, i) => ({
  id: `SO-${String(1001 + i)}`,
  customer: CUSTOMERS[i % CUSTOMERS.length]!,
  amount: 120 + ((i * 37) % 900),
  placed: new Date(Date.UTC(2026, 10, 1 + (i % 26), 2)),
}));
const columns: DataGridColumn<Order>[] = [
  { type: 'selection' },
  { field: 'id', header: '訂單編號', primaryKey: true, width: 120 },
  { field: 'customer', header: '客戶', width: 120 },
  { field: 'amount', header: '金額', type: 'number', format: 'C0', align: 'end', width: 120 },
  { field: 'placed', header: '下單日期', type: 'date', format: 'yMMMd', width: 160 },
];
const STATUSES = [
  { value: 'unpaid', label: '待付款' },
  { value: 'shipped', label: '已出貨' },
  { value: 'done', label: '已完成' },
];

function Actions() {
  const confirm = useConfirm();
  const toast = useToast();
  const [result, setResult] = useState('');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Dialog trigger={<Dialog.Trigger render={(p) => <Button {...p} id="details" variant="outline">訂單詳情</Button>} />} closeButton resizable>
        <Dialog.Title>訂單詳情</Dialog.Title>
        <Dialog.Body>訂單 SO-1001 共 3 項商品。</Dialog.Body>
      </Dialog>
      <Button id="delete" tone="danger" variant="outline" onClick={async () => setResult((await confirm({ title: '刪除訂單？', description: '刪除後無法復原。', tone: 'danger' })) ? '已刪除' : '已取消')}>
        刪除
      </Button>
      <Button id="toast" onClick={() => toast.add({ title: '已儲存', description: '訂單已更新。', tone: 'success', dismissible: true })}>
        儲存
      </Button>
      <output id="result">{result}</output>
    </div>
  );
}

function Page() {
  return (
    <main className="app" data-salmon-a11y-root="" lang={english ? 'en' : 'zh-TW'} style={{ display: 'grid', gap: 16 }}>
      <Breadcrumbs id="crumbs" onItemClick={(event) => event.preventDefault()}>
        <BreadcrumbItem href="#home">首頁</BreadcrumbItem>
        <BreadcrumbItem href="#orders">訂單</BreadcrumbItem>
        <BreadcrumbItem>訂單管理</BreadcrumbItem>
      </Breadcrumbs>
      <h1 style={{ margin: 0, fontSize: 20 }}>訂單管理</h1>
      <Tabs defaultValue="list">
        <TabList aria-label="訂單">
          <Tab value="list">訂單列表</Tab>
          <Tab value="stats">統計</Tab>
        </TabList>
        <TabPanel value="list">
          <DataGrid<Order>
            id="orders"
            aria-label="訂單"
            data={ORDERS}
            columns={columns}
            sorting
            filtering
            paging={{ pageSize: 10, pageSizeOptions: [10, 20, 50] }}
            selection={{ mode: 'row', multiple: true }}
            currency="TWD"
            timeZone="Asia/Taipei"
            height="auto"
          />
        </TabPanel>
        <TabPanel value="stats">本月共 45 筆訂單。</TabPanel>
      </Tabs>
      <Pager id="pager" aria-label="操作紀錄分頁" totalCount={480} pageSizeOptions={[10, 20, 50]} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <DatePicker id="placed" label="下單日期" defaultValue="2026-11-26" clearable />
        <DateRangePicker id="range" label="期間" defaultValue={{ start: '2026-11-02', end: '2026-11-06' }} />
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="status">訂單狀態</label>
          <Select id="status" data={STATUSES} clearable defaultValue="unpaid" />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <span id="customer-label">客戶</span>
          <Combobox id="customer" aria-labelledby="customer-label" data={CUSTOMERS} />
        </div>
      </div>
      <Form id="order-form" style={{ display: 'grid', gap: 12, maxWidth: 360 }} onSubmit={(event) => event.preventDefault()}>
        <TextField name="name" label="客戶名稱" required />
        <NumberField name="quantity" label="數量" required min={1} />
        <FileUpload id="upload" name="file" label="附件" accept=".csv,.xlsx" />
        <Button id="submit" type="submit" tone="primary" style={{ justifySelf: 'start' }}>
          建立訂單
        </Button>
      </Form>
      <Actions />
    </main>
  );
}

function Locale({ children }: { children: ReactNode }) {
  return english ? (
    <>{children}</>
  ) : (
    <LocaleProvider locale="zh-TW" localeText={zhTW}>
      {children}
    </LocaleProvider>
  );
}

const app = (
  <StrictMode>
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <Locale>
        <Toaster>
          <DialogProvider>
            <Page />
          </DialogProvider>
        </Toaster>
      </Locale>
    </ThemeProvider>
  </StrictMode>
);
createRoot(document.getElementById('root') as HTMLElement).render(app);
