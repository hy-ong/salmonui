// An admin orders page composed from Salmon UI families under one theme: compact density, a
// teal-tinted neutral ramp, a near-black sidebar surface, a white app bar surface and a
// primary-colored table header (docs/site/content/appearance.md "Theme like an admin template").
// The navigation is a SidebarMenu, which reads the --salmon-surface-sidebar-* variables.
import { StrictMode, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/navigation/sidebar-layout/styles.css';
import '@salmonui/navigation/sidebar-menu/styles.css';
import '@salmonui/navigation/breadcrumbs/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/navigation/pager/styles.css';
import '@salmonui/layout/avatar/styles.css';
import '@salmonui/layout/card/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/inputs/text-field/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/calendars/date-range-picker/styles.css';
import '@salmonui/notifications/badge/styles.css';
import '@salmonui/data-grid/styles.css';
import './admin-template.css';
import { ThemeStyle } from '@salmonui/core/server';
import { ThemeProvider, type SalmonThemeInput } from '@salmonui/core/theme';
import { SidebarLayout, SidebarMain, SidebarPanel } from '@salmonui/navigation/sidebar-layout';
import { SidebarMenu, type SidebarMenuEntry, type SidebarMenuItem } from '@salmonui/navigation/sidebar-menu';
import { BreadcrumbItem, Breadcrumbs } from '@salmonui/navigation/breadcrumbs';
import { Pager } from '@salmonui/navigation/pager';
import { Avatar } from '@salmonui/layout/avatar';
import { Card } from '@salmonui/layout/card';
import { Button } from '@salmonui/buttons/button';
import { TextField } from '@salmonui/inputs/text-field';
import { Select } from '@salmonui/dropdowns/select';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { Badge } from '@salmonui/notifications/badge';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';

const theme: SalmonThemeInput = {
  colors: { primary: '#0e4d5c', success: '#0c8f54', warning: '#d4690b', danger: '#d62f23', info: '#0e4d5c' },
  colorScheme: 'light',
  density: 'compact',
  fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  neutral: { chroma: 0.032 },
  surfaces: { sidebar: '#192225', appBar: '#ffffff', tableHeader: 'primary' },
};

// ---- Icons (inline, 16px, currentColor) ------------------------------------------------------

const icon = (d: string, size = 16): ReactNode => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS = {
  apps: 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z',
  dashboard: 'M8 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM8 9l2.5-3M4.5 9.5h1M10.5 9.5h1M8 4.5v1',
  chart: 'M2 2v12h12M5 11V8M8 11V5M11 11V7',
  cart: 'M1.5 2.5h2l1.6 7.5h7.4l1.5-5.5H4.2M6 13.3h.01M12 13.3h.01',
  shop: 'M2 6.5 3 2.5h10l1 4M2 6.5h12M2 6.5c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2M3 8.3V14h10V8.3',
  team: 'M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M11 2.5a2.5 2.5 0 0 1 0 4.5M12.5 9.8c1.2.6 2 2 2 4.2',
  wallet: 'M2 4h11v9.5H2zM2 4l9-2v2M10 8.5h3',
  card: 'M1.5 3.5h13v9h-13zM1.5 6.5h13M4 10h3',
  globe: 'M8 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM1.5 8h13M8 1.5c1.8 1.8 2.6 4 2.6 6.5S9.8 12.7 8 14.5M8 1.5C6.2 3.3 5.4 5.5 5.4 8s.8 4.7 2.6 6.5',
  database: 'M3 3.5c0-1 2.2-2 5-2s5 1 5 2-2.2 2-5 2-5-1-5-2zM3 3.5v9c0 1 2.2 2 5 2s5-1 5-2v-9M3 8c0 1 2.2 2 5 2s5-1 5-2',
  setting: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  support: 'M2.5 10V8a5.5 5.5 0 0 1 11 0v2M2.5 9.5h2v4h-2zM11.5 9.5h2v4h-2z',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14 14l-3.5-3.5',
  plus: 'M8 3v10M3 8h10',
  download: 'M4.5 11.5h-.5a3 3 0 0 1-.3-6 4.5 4.5 0 0 1 8.6 0 3 3 0 0 1-.3 6h-.5M8 8v6M6 12l2 2 2-2',
} as const;

// ---- Navigation -------------------------------------------------------------------------------

const leaf = (id: string, label: string, glyph?: keyof typeof ICONS): SidebarMenuItem => ({
  id,
  label,
  href: '#',
  ...(glyph ? { icon: icon(ICONS[glyph], 15) } : {}),
});

const MENU: SidebarMenuEntry[] = [
  { type: 'group', id: 'workspace', label: '工作區', children: [leaf('overview', '總覽', 'dashboard'), leaf('analytics', '數據分析', 'chart'), leaf('orders', '訂單管理', 'cart')] },
  {
    type: 'group',
    id: 'operations',
    label: '營運',
    children: [
      { id: 'commerce', label: '商務中心', icon: icon(ICONS.shop, 15), children: [leaf('products', '商品目錄'), leaf('promotions', '促銷活動'), leaf('subscriptions', '訂閱方案')] },
      { id: 'customers', label: '客戶關係', icon: icon(ICONS.team, 15), children: [leaf('segments', '客群管理'), leaf('support', '服務案件'), leaf('feedback', '回饋中心')] },
      leaf('payments', '金流管理', 'wallet'),
      leaf('billing', '帳務設定', 'card'),
    ],
  },
  { type: 'group', id: 'system', label: '系統', children: [leaf('integrations', '整合服務', 'globe'), leaf('data', '資料管理', 'database'), leaf('settings', '系統設定', 'setting'), leaf('help', '支援中心', 'support')] },
];

// ---- Data ---------------------------------------------------------------------------------------

type Status = 'paid' | 'pending' | 'refunded' | 'failed';
interface OrderRecord {
  readonly id: string;
  readonly customer: string;
  readonly email: string;
  readonly product: string;
  readonly channel: string;
  readonly amount: number;
  readonly status: Status;
  readonly owner: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const CUSTOMERS = [
  ['王小安', 'an.wang@example.com'],
  ['林怡君', 'yijun.lin@example.com'],
  ['陳柏宇', 'boyu.chen@example.com'],
  ['張語晴', 'yuqing.zhang@example.com'],
  ['李承翰', 'chenghan.li@example.com'],
  ['許庭瑄', 'tingxuan.hsu@example.com'],
  ['吳品妤', 'pinyu.wu@example.com'],
  ['周昱廷', 'yuting.chou@example.com'],
] as const;
const PRODUCTS = ['Growth 年繳方案', 'Scale 月繳方案', 'Starter 年繳方案', 'Enterprise 加購'];
const CHANNELS = ['Web', 'iOS', 'Android', 'Partner'];
const STATUSES: readonly Status[] = ['paid', 'pending', 'paid', 'paid', 'refunded', 'failed'];
const OWNERS = ['Joyce', 'Marcus', 'Nina', 'Oscar', 'Sam'];
const STATUS_META: Record<Status, { label: string; color: string }> = {
  paid: { label: '已付款', color: 'var(--salmon-color-success)' },
  pending: { label: '待處理', color: 'var(--salmon-color-primary)' },
  refunded: { label: '已退款', color: 'var(--salmon-text-secondary)' },
  failed: { label: '付款失敗', color: 'var(--salmon-color-danger)' },
};

/** `YYYY-MM-DD HH:mm:ss` in UTC+8, deterministic. */
function taipei(date: Date): string {
  const t = new Date(date.getTime() + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

const ORDERS: readonly OrderRecord[] = Array.from({ length: 96 }, (_, index) => {
  const [customer, email] = CUSTOMERS[index % CUSTOMERS.length]!;
  const updated = new Date(Date.UTC(2026, 6, 28 - (index % 46), 9, 30));
  const created = new Date(updated);
  created.setUTCDate(created.getUTCDate() - 2 - (index % 21));
  created.setUTCHours(9, 0, 0, 0);
  return {
    id: `ORD-${String(2680 - index).padStart(5, '0')}`,
    customer,
    email,
    product: PRODUCTS[index % PRODUCTS.length]!,
    channel: CHANNELS[index % CHANNELS.length]!,
    amount: 680 + ((index * 137) % 15800),
    status: STATUSES[index % STATUSES.length]!,
    owner: OWNERS[index % OWNERS.length]!,
    createdAt: taipei(created),
    updatedAt: taipei(updated),
  };
});

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const COLUMNS: DataGridColumn<OrderRecord>[] = [
  { type: 'selection' },
  {
    field: 'id',
    header: '訂單編號',
    primaryKey: true,
    width: 124,
    renderCell: ({ row }) => (
      <a className="atlas-link" href="#">
        {row.id}
      </a>
    ),
  },
  {
    field: 'customer',
    header: '客戶',
    width: 220,
    sortable: false,
    renderCell: ({ row }) => (
      <span className="atlas-customer">
        <Avatar name={row.customer} size={28} shape="circle">
          {row.customer.slice(0, 1)}
        </Avatar>
        <span className="atlas-customer__text">
          <strong>{row.customer}</strong>
          <span>{row.email}</span>
        </span>
      </span>
    ),
  },
  { field: 'product', header: '方案', width: 150, sortable: false },
  {
    field: 'channel',
    header: '來源',
    width: 86,
    sortable: false,
    renderCell: ({ row }) => (
      <Badge tone="neutral" variant="soft">
        {row.channel}
      </Badge>
    ),
  },
  { field: 'amount', header: '金額', type: 'number', width: 112, align: 'end', renderCell: ({ row }) => <strong className="atlas-strong">{money.format(row.amount)}</strong> },
  {
    field: 'status',
    header: '狀態',
    width: 104,
    sortable: false,
    renderCell: ({ row }) => (
      <span className="atlas-status">
        <span className="atlas-status__dot" style={{ background: STATUS_META[row.status].color }} aria-hidden="true" />
        {STATUS_META[row.status].label}
      </span>
    ),
  },
  {
    field: 'owner',
    header: '負責人',
    width: 100,
    sortable: false,
    renderCell: ({ row }) => (
      <span className="atlas-owner">
        <Avatar name={row.owner} size={24} shape="circle">
          {row.owner.slice(0, 1)}
        </Avatar>
        {row.owner}
      </span>
    ),
  },
  { field: 'createdAt', header: '建立時間', width: 170 },
  { field: 'updatedAt', header: '更新時間', width: 170 },
];

const STATUS_OPTIONS = (Object.keys(STATUS_META) as Status[]).map((value) => ({ value, label: STATUS_META[value].label }));
const CHANNEL_OPTIONS = CHANNELS.map((value) => ({ value, label: value }));
const PAGE_SIZE = 25;

function Labelled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="atlas-filter__item">
      <span id={id} className="atlas-filter__label">
        {label}
      </span>
      {children}
    </div>
  );
}

function OrdersPage() {
  const [page, setPage] = useState(1);
  const rows = useMemo(() => ORDERS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [page]);
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, ORDERS.length);
  return (
    <div className="atlas-page" aria-label="訂單管理">
      <Card className="atlas-card atlas-filter">
        <form className="atlas-filter__form" onSubmit={(event) => event.preventDefault()}>
          <div className="atlas-filter__grid">
            <div className="atlas-filter__item">
              <TextField label="關鍵字" clearable placeholder="訂單、客戶或 Email" startAdornment={icon(ICONS.search, 14)} />
            </div>
            <Labelled id="f-status" label="訂單狀態">
              <Select aria-labelledby="f-status" clearable placeholder="全部狀態" data={STATUS_OPTIONS} />
            </Labelled>
            <Labelled id="f-channel" label="訂單來源">
              <Select aria-labelledby="f-channel" clearable placeholder="全部來源" data={CHANNEL_OPTIONS} />
            </Labelled>
            <Labelled id="f-date" label="更新時間">
              <DateRangePicker aria-labelledby="f-date" placeholder="開始日期 → 結束日期" locale="zh-TW" />
            </Labelled>
          </div>
          <div className="atlas-filter__actions">
            <span className="atlas-filter__group">
              <Button tone="primary" iconStart={icon(ICONS.plus, 14)}>
                新增訂單
              </Button>
              <Button variant="outline" iconStart={icon(ICONS.download, 14)}>
                匯出
              </Button>
            </span>
            <span className="atlas-filter__group">
              <Button variant="outline" type="reset">
                重設
              </Button>
              <Button tone="primary" type="submit" iconStart={icon(ICONS.search, 14)}>
                查詢
              </Button>
            </span>
          </div>
        </form>
      </Card>
      <section className="atlas-table" aria-label="訂單列表">
        <Card className="atlas-card atlas-table__card">
          <DataGrid<OrderRecord>
            aria-label="訂單"
            data={rows}
            columns={COLUMNS}
            height="100%"
            rowHeight={54}
            sorting
            selection={{ multiple: true }}
            gridLines="horizontal"
            striped={false}
            locale="zh-TW"
          />
        </Card>
        <Card className="atlas-card atlas-pager">
          <span className="atlas-muted">
            顯示 {first}–{last} 筆
          </span>
          <span className="atlas-pager__end">
            <span>共 {ORDERS.length} 筆</span>
            <Pager page={page} pageSize={PAGE_SIZE} totalCount={ORDERS.length} onPageChange={(event) => setPage(event.page)} showInfo={false} buttonCount={5} />
          </span>
        </Card>
      </section>
    </div>
  );
}

function App() {
  return (
    <>
      <ThemeStyle theme={theme} />
      <ThemeProvider theme={theme} className="atlas-root">
        <header className="salmon-app-bar atlas-topbar" data-salmon-surface="app-bar">
          <span className="atlas-brand">
            {icon(ICONS.apps, 18)}
            <strong>Atlas</strong>
          </span>
          <Breadcrumbs separator="/">
            <BreadcrumbItem href="#">工作區</BreadcrumbItem>
            <BreadcrumbItem>訂單管理</BreadcrumbItem>
          </Breadcrumbs>
          <button type="button" className="atlas-account" aria-label="Olivia 帳號選單">
            <Avatar size={22} shape="circle">
              OL
            </Avatar>
            <span>Olivia</span>
          </button>
        </header>
        <SidebarLayout size={215} className="atlas-layout">
          <SidebarPanel navigation aria-label="主選單">
            <SidebarMenu landmark={false} items={MENU} defaultSelected="orders" defaultExpanded="all" />
          </SidebarPanel>
          <SidebarMain render={(props) => <main {...props} />} className="atlas-main">
            <OrdersPage />
          </SidebarMain>
        </SidebarLayout>
      </ThemeProvider>
    </>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
