'use client';

import { useMemo, useState } from 'react';
import { Button, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { Select, type SelectValue } from '@salmonui/dropdowns/select';
import { FileUpload } from '@salmonui/inputs/file-upload';
import { Form } from '@salmonui/inputs/form';
import { NumberField } from '@salmonui/inputs/number-field';
import { TextField } from '@salmonui/inputs/text-field';
import { BreadcrumbItem, Breadcrumbs } from '@salmonui/navigation/breadcrumbs';
import { Pager } from '@salmonui/navigation/pager';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { Badge, type BadgeTone } from '@salmonui/notifications/badge';
import { Toaster, useToast } from '@salmonui/notifications/toast';
import { Dialog, DialogProvider, useConfirm } from '@salmonui/overlays/dialog';

// An order admin page under one LocaleProvider: every component string
// (pager, grid menus, pickers, dropdowns, validation, dialogs, toasts) comes
// from the zh-TW pack, the app's own labels from its own dictionary. The
// "English" button renders the same page without the provider.

type Lang = 'zh' | 'en';
type Status = 'unpaid' | 'processing' | 'shipped' | 'done' | 'cancelled';

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly product: string;
  readonly quantity: number;
  readonly amount: number;
  readonly placed: Date;
  readonly status: Status;
}

const CUSTOMERS = ['王小明', '李美玲', '陳志豪', '林雅婷', '張家豪', '黃淑芬', '吳俊傑', '劉怡君', '蔡宗翰', '楊佩珊'];
const PRODUCTS: readonly (readonly [string, number])[] = [
  ['拿鐵咖啡豆 1 kg', 680],
  ['凍頂烏龍茶葉', 450],
  ['手沖壺組', 1280],
  ['電動磨豆機', 3600],
  ['濾紙（100 入）', 120],
  ['冷泡茶包禮盒', 520],
];
const STATUSES: readonly Status[] = ['unpaid', 'processing', 'shipped', 'done', 'done', 'cancelled'];
const TONES: Record<Status, BadgeTone> = { unpaid: 'warning', processing: 'info', shipped: 'primary', done: 'success', cancelled: 'neutral' };

// Deterministic data: identical on the server and in the browser.
const ORDERS: readonly Order[] = Array.from({ length: 64 }, (_, i) => {
  const [product, price] = PRODUCTS[(i * 5) % PRODUCTS.length]!;
  const quantity = 1 + ((i * 7) % 6);
  return {
    id: `SO-${String(20261100 + i + 1)}`,
    customer: CUSTOMERS[(i * 3) % CUSTOMERS.length]!,
    product,
    quantity,
    amount: price * quantity,
    placed: new Date(Date.UTC(2026, 10, 26 - (i % 25), 1 + (i % 9))),
    status: STATUSES[(i * 11) % STATUSES.length]!,
  };
});

const ACTIVITY = Array.from({ length: 48 }, (_, i) => ({ id: i, customer: CUSTOMERS[i % CUSTOMERS.length]!, order: ORDERS[i]!.id }));

// The application's own strings; component strings come from the pack.
const TEXT = {
  zh: {
    home: '首頁',
    sales: '銷售管理',
    title: '訂單管理',
    subtitle: '查詢、建立與匯入訂單',
    language: '介面語言',
    list: '訂單列表',
    create: '新增訂單',
    import: '匯入訂單',
    placed: '下單日期',
    status: '訂單狀態',
    customer: '客戶',
    customerHint: '輸入或選擇客戶',
    search: '查詢',
    reset: '重設',
    remove: '刪除所選',
    removeTitle: (n: number) => `刪除 ${n} 筆訂單？`,
    removeBody: '刪除後無法復原。',
    removeConfirm: '刪除',
    removed: (n: number) => `已刪除 ${n} 筆訂單`,
    details: '訂單詳情',
    detailsBody: '最近一筆訂單由王小明於今日建立，共 3 項商品。',
    order: '訂單編號',
    product: '商品',
    quantity: '數量',
    amount: '金額',
    grid: '訂單',
    statuses: { unpaid: '待付款', processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' } as Record<Status, string>,
    name: '客戶名稱',
    phone: '聯絡電話',
    delivery: '交貨日期',
    payment: '付款方式',
    payments: ['信用卡', '銀行轉帳', '貨到付款'],
    note: '備註',
    submit: '建立訂單',
    created: '已建立訂單',
    createdBody: (name: string) => `${name} 的訂單已送出。`,
    file: '訂單檔案',
    fileHint: 'CSV 或 Excel 檔，單檔 5 MB 以內',
    upload: '開始匯入',
    activity: '操作紀錄',
    activityPages: '操作紀錄分頁',
    activityItem: (who: string, id: string) => `${who} 更新了訂單 ${id}`,
    selected: (n: number) => `已選取 ${n} 筆`,
  },
  en: {
    home: 'Home',
    sales: 'Sales',
    title: 'Orders',
    subtitle: 'Search, create and import orders',
    language: 'Interface language',
    list: 'Order list',
    create: 'New order',
    import: 'Import',
    placed: 'Order date',
    status: 'Status',
    customer: 'Customer',
    customerHint: 'Type or pick a customer',
    search: 'Search',
    reset: 'Reset',
    remove: 'Delete selected',
    removeTitle: (n: number) => `Delete ${n} orders?`,
    removeBody: 'This cannot be undone.',
    removeConfirm: 'Delete',
    removed: (n: number) => `${n} orders deleted`,
    details: 'Order details',
    detailsBody: 'The latest order was placed today by 王小明, with 3 items.',
    order: 'Order',
    product: 'Product',
    quantity: 'Qty',
    amount: 'Amount',
    grid: 'Orders',
    statuses: { unpaid: 'Unpaid', processing: 'Processing', shipped: 'Shipped', done: 'Completed', cancelled: 'Cancelled' } as Record<Status, string>,
    name: 'Customer name',
    phone: 'Phone',
    delivery: 'Delivery date',
    payment: 'Payment',
    payments: ['Credit card', 'Bank transfer', 'Cash on delivery'],
    note: 'Note',
    submit: 'Create order',
    created: 'Order created',
    createdBody: (name: string) => `The order for ${name} was sent.`,
    file: 'Order file',
    fileHint: 'CSV or Excel, up to 5 MB',
    upload: 'Import',
    activity: 'Activity',
    activityPages: 'Activity pages',
    activityItem: (who: string, id: string) => `${who} updated order ${id}`,
    selected: (n: number) => `${n} selected`,
  },
};
type Text = (typeof TEXT)['zh'];

// Filters from the column header menus, no filter row: a compact back-office table.
const FILTERING = { ui: 'menu' } as const;

function useColumns(t: Text): DataGridColumn<Order>[] {
  return useMemo(
    () => [
      { type: 'selection' },
      { field: 'id', header: t.order, primaryKey: true, width: 130 },
      { field: 'customer', header: t.customer, width: 100 },
      { field: 'product', header: t.product, width: 140 },
      { field: 'quantity', header: t.quantity, type: 'number', align: 'end', width: 90 },
      { field: 'amount', header: t.amount, type: 'number', format: 'C0', align: 'end', width: 104 },
      { field: 'placed', header: t.placed, type: 'date', format: 'yMMMd', width: 140 },
      {
        field: 'status',
        header: t.status,
        width: 120,
        valueGetter: (row: Order) => t.statuses[row.status],
        renderCell: ({ row }) => (
          <Badge tone={TONES[row.status]} variant="dot">
            {t.statuses[row.status]}
          </Badge>
        ),
      },
    ],
    [t],
  );
}

function OrderList({ t }: { t: Text }) {
  const columns = useColumns(t);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<SelectValue | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const statusItems = (Object.keys(t.statuses) as Status[]).map((value) => ({ value, label: t.statuses[value] }));
  const rows = useMemo(() => (status ? ORDERS.filter((order) => order.status === status) : ORDERS), [status]);
  return (
    <div className="demo-admin__stack">
      <section className="demo-admin__card demo-admin__filters" aria-label={t.search}>
        <DateRangePicker label={t.placed} />
        <div className="demo-admin__field">
          <label htmlFor="zh-demo-status" className="demo-admin__label">
            {t.status}
          </label>
          <Select id="zh-demo-status" data={statusItems} value={status} onValueChange={setStatus} clearable />
        </div>
        <div className="demo-admin__field">
          <span id="zh-demo-customer" className="demo-admin__label">
            {t.customer}
          </span>
          <Combobox aria-labelledby="zh-demo-customer" data={CUSTOMERS} placeholder={t.customerHint} />
        </div>
        <div className="demo-admin__actions">
          <Button tone="primary">{t.search}</Button>
          <Button variant="outline" onClick={() => setStatus(null)}>
            {t.reset}
          </Button>
        </div>
      </section>
      <section className="demo-admin__card demo-admin__card--flush" aria-label={t.list}>
        <div className="demo-admin__bar">
          <span className="demo-admin__muted">{t.selected(selected.length)}</span>
          <div className="demo-admin__actions">
            <Dialog trigger={<Dialog.Trigger render={(p) => <Button {...p} variant="outline">{t.details}</Button>} />} closeButton>
              <Dialog.Title>{t.details}</Dialog.Title>
              <Dialog.Body>{t.detailsBody}</Dialog.Body>
            </Dialog>
            <Button
              tone="danger"
              variant="outline"
              disabled={selected.length === 0}
              onClick={async () => {
                const ok = await confirm({ title: t.removeTitle(selected.length), description: t.removeBody, confirmLabel: t.removeConfirm, tone: 'danger' });
                if (ok) toast.add({ title: t.removed(selected.length), tone: 'success' });
              }}
            >
              {t.remove}
            </Button>
          </div>
        </div>
        <DataGrid<Order>
          aria-label={t.grid}
          data={rows}
          columns={columns}
          sorting
          filtering={FILTERING}
          paging={{ pageSize: 8, pageSizeOptions: [8, 20, 50] }}
          selection={{ mode: 'row', multiple: true, rowIds: selected }}
          onSelectionChange={(event) => setSelected(event.rowIds as readonly string[])}
          currency="TWD"
          timeZone="Asia/Taipei"
          height="auto"
        />
      </section>
    </div>
  );
}

function NewOrder({ t }: { t: Text }) {
  const toast = useToast();
  return (
    <Form
      className="demo-admin__card demo-admin__form"
      onSubmit={(event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('name') ?? '');
        toast.add({ title: t.created, description: t.createdBody(name), tone: 'success', dismissible: true });
      }}
    >
      <TextField name="name" label={t.name} required />
      <TextField name="phone" label={t.phone} type="tel" />
      <NumberField name="quantity" label={t.quantity} required min={1} max={99} />
      <DatePicker name="delivery" label={t.delivery} />
      <div className="demo-admin__field">
        <label htmlFor="zh-demo-payment" className="demo-admin__label">
          {t.payment}
        </label>
        <Select id="zh-demo-payment" name="payment" data={t.payments} defaultValue={t.payments[0]!} />
      </div>
      <TextField name="note" label={t.note} />
      <div className="demo-admin__actions demo-admin__span">
        <Button type="submit" tone="primary">
          {t.submit}
        </Button>
        <Button type="reset" variant="outline">
          {t.reset}
        </Button>
      </div>
    </Form>
  );
}

function ImportOrders({ t }: { t: Text }) {
  return (
    <Form className="demo-admin__card demo-admin__stack" onSubmit={(event) => event.preventDefault()}>
      <FileUpload name="file" label={t.file} description={t.fileHint} accept=".csv,.xlsx" maxSize={5 * 1024 * 1024} required />
      <div className="demo-admin__actions">
        <Button type="submit" tone="primary">
          {t.upload}
        </Button>
      </div>
    </Form>
  );
}

function Activity({ t }: { t: Text }) {
  const [page, setPage] = useState(1);
  const items = ACTIVITY.slice((page - 1) * 4, page * 4);
  return (
    <section className="demo-admin__card" aria-labelledby="zh-demo-activity">
      <h4 id="zh-demo-activity" className="demo-admin__heading">
        {t.activity}
      </h4>
      <ul className="demo-admin__list">
        {items.map((item) => (
          <li key={item.id}>{t.activityItem(item.customer, item.order)}</li>
        ))}
      </ul>
      <Pager aria-label={t.activityPages} page={page} pageSize={4} totalCount={ACTIVITY.length} buttonCount={5} onPageChange={(event) => setPage(event.page)} />
    </section>
  );
}

function AdminPage({ t, lang, onLang }: { t: Text; lang: Lang; onLang: (lang: Lang) => void }) {
  return (
    <div className="demo-admin" lang={lang === 'zh' ? 'zh-TW' : 'en'} data-salmon-a11y-root="">
      <header className="demo-admin__header">
        <Breadcrumbs onItemClick={(event) => event.preventDefault()}>
          <BreadcrumbItem href="#demo-locale-zh-tw-title">{t.home}</BreadcrumbItem>
          <BreadcrumbItem href="#demo-locale-zh-tw-title">{t.sales}</BreadcrumbItem>
          <BreadcrumbItem>{t.title}</BreadcrumbItem>
        </Breadcrumbs>
        <div className="demo-admin__title-row">
          <div>
            <h3 className="demo-admin__title">{t.title}</h3>
            <p className="demo-admin__muted">{t.subtitle}</p>
          </div>
          <ToggleButtonGroup aria-label={t.language} value={lang} onValueChange={(value) => value && onLang(value as Lang)} disallowEmpty size="sm">
            <ToggleButton value="zh">繁體中文</ToggleButton>
            <ToggleButton value="en">English</ToggleButton>
          </ToggleButtonGroup>
        </div>
      </header>
      <Tabs defaultValue="list">
        <TabList aria-label={t.title}>
          <Tab value="list">{t.list}</Tab>
          <Tab value="create">{t.create}</Tab>
          <Tab value="import">{t.import}</Tab>
        </TabList>
        <TabPanel value="list">
          <OrderList t={t} />
        </TabPanel>
        <TabPanel value="create">
          <NewOrder t={t} />
        </TabPanel>
        <TabPanel value="import">
          <ImportOrders t={t} />
        </TabPanel>
      </Tabs>
      <Activity t={t} />
    </div>
  );
}

export default function LocaleZhTwDemo() {
  const [lang, setLang] = useState<Lang>('zh');
  const page = (
    <Toaster>
      <DialogProvider>
        <AdminPage t={TEXT[lang]} lang={lang} onLang={setLang} />
      </DialogProvider>
    </Toaster>
  );
  // English: the same tree without a provider, so every component falls back to its built-in English text.
  return lang === 'zh' ? (
    <LocaleProvider locale="zh-TW" localeText={zhTW}>
      {page}
    </LocaleProvider>
  ) : (
    page
  );
}
