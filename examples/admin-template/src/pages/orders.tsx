import { useMemo, useRef, useState, type SubmitEvent } from 'react';
import { CloudDownload, Plus, Search } from 'lucide-react';
import { Button } from '@salmonui/buttons/button';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';
import { Avatar } from '@salmonui/layout/avatar';
import { Card } from '@salmonui/layout/card';
import { Pager } from '@salmonui/navigation/pager';
import { Badge } from '@salmonui/notifications/badge';
import { Message } from '@salmonui/notifications/message';
import { useToast } from '@salmonui/notifications/toast';
import { useOrders } from '../api';
import type { OrderChannel, OrderRecord, OrderStatus } from '../api/types';
import { Link, Outlet, useRouter } from '../lib/router';
import { channelOptions, currencyFormatter, formatDateTime, statusMeta, statusOptions, taipeiDay } from '../lib/order-display';

const pageSize = 25;

interface FilterValues {
  keyword?: string;
  status?: OrderStatus;
  channel?: OrderChannel;
  /** `YYYY-MM-DD` calendar days in Asia/Taipei. */
  dateFrom?: string;
  dateTo?: string;
}

const columns: DataGridColumn<OrderRecord>[] = [
  {
    field: 'id',
    header: '訂單編號',
    primaryKey: true,
    width: 124,
    pinned: 'start',
    filterable: false,
    renderCell: ({ row }) => (
      <Link to={`/workspace/orders/${row.id}`} className="atlas-link">
        {row.id}
      </Link>
    ),
  },
  {
    field: 'customer',
    header: '客戶',
    width: 190,
    sortable: false,
    filterable: false,
    renderCell: ({ row }) => (
      <span className="atlas-customer">
        <Avatar size={28} shape="circle" variant="solid">
          {row.customer.slice(0, 1)}
        </Avatar>
        <span className="atlas-customer__text">
          <span>{row.customer}</span>
          <span className="atlas-muted">{row.email}</span>
        </span>
      </span>
    ),
  },
  { field: 'product', header: '方案', width: 150, sortable: false, filterable: false },
  {
    field: 'channel',
    header: '來源',
    width: 86,
    sortable: false,
    filterable: false,
    renderCell: ({ row }) => <Badge className="atlas-tag">{row.channel}</Badge>,
  },
  {
    field: 'amount',
    header: '金額',
    type: 'number',
    width: 112,
    align: 'end',
    filterable: false,
    renderCell: ({ row }) => currencyFormatter.format(row.amount),
  },
  {
    field: 'status',
    header: '狀態',
    width: 104,
    sortable: false,
    lookup: { data: statusOptions, keyField: 'value', displayField: 'label' },
    filter: { ui: 'checklist' },
    renderCell: ({ row }) => (
      <Badge variant="dot" tone={statusMeta[row.status].tone}>
        {statusMeta[row.status].label}
      </Badge>
    ),
  },
  {
    field: 'owner',
    header: '負責人',
    width: 100,
    sortable: false,
    filterable: false,
    renderCell: ({ row }) => (
      <span className="atlas-owner">
        <Avatar size={24} shape="circle" variant="solid">
          {row.owner.slice(0, 1)}
        </Avatar>
        <span>{row.owner}</span>
      </span>
    ),
  },
  { field: 'createdAt', header: '建立時間', width: 170, filterable: false, renderCell: ({ row }) => formatDateTime(row.createdAt) },
  { field: 'updatedAt', header: '更新時間', width: 170, filterable: false, renderCell: ({ row }) => formatDateTime(row.updatedAt) },
];

function readFilters(form: HTMLFormElement): FilterValues {
  const data = new FormData(form);
  const text = (name: string): string | undefined => {
    const value = data.get(name);
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const values: FilterValues = {};
  const keyword = text('keyword');
  const status = text('status') as OrderStatus | undefined;
  const channel = text('channel') as OrderChannel | undefined;
  const dateFrom = text('dateFrom');
  const dateTo = text('dateTo');
  if (keyword) values.keyword = keyword;
  if (status) values.status = status;
  if (channel) values.channel = channel;
  if (dateFrom) values.dateFrom = dateFrom;
  if (dateTo) values.dateTo = dateTo;
  return values;
}

export function OrdersPage() {
  const toast = useToast();
  const orders = useOrders();
  const { navigate } = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [requestedPage, setCurrentPage] = useState(1);

  const filteredData = useMemo(() => {
    const keyword = filters.keyword?.trim().toLowerCase();
    return (orders.data ?? []).filter((record) => {
      const matchesKeyword = !keyword || [record.id, record.customer, record.email, record.product].some((value) => value.toLowerCase().includes(keyword));
      const matchesStatus = !filters.status || record.status === filters.status;
      const matchesChannel = !filters.channel || record.channel === filters.channel;
      const day = taipeiDay(record.updatedAt);
      const matchesStart = !filters.dateFrom || day >= filters.dateFrom;
      const matchesEnd = !filters.dateTo || day <= filters.dateTo;
      return matchesKeyword && matchesStatus && matchesChannel && matchesStart && matchesEnd;
    });
  }, [filters, orders.data]);

  const currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(filteredData.length / pageSize)));
  const pageData = useMemo(() => filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, filteredData]);
  const first = (currentPage - 1) * pageSize + (filteredData.length ? 1 : 0);
  const last = Math.min(currentPage * pageSize, filteredData.length);

  const applyFilters = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFilters(readFilters(event.currentTarget));
    setCurrentPage(1);
  };
  const resetFilters = (): void => {
    formRef.current?.reset();
    setFilters({});
    setCurrentPage(1);
  };

  return (
    <>
      <div className="atlas-page" aria-labelledby="orders-title" role="region">
        <h1 id="orders-title" className="atlas-sr-only">
          訂單管理
        </h1>
        <Card className="atlas-card atlas-filter">
          <form ref={formRef} className="atlas-filter__form" onSubmit={applyFilters} aria-label="查詢條件">
            <div className="atlas-filter__grid">
              <TextField name="keyword" label="關鍵字" clearable placeholder="訂單、客戶或 Email" startAdornment={<Search size={14} aria-hidden />} />
              <Select name="status" label="訂單狀態" clearable placeholder="全部狀態" data={statusOptions} />
              <Select name="channel" label="訂單來源" clearable placeholder="全部來源" data={channelOptions} />
              <DateRangePicker label="更新時間" startName="dateFrom" endName="dateTo" separator="→" placeholder="開始日期　→　結束日期" />
            </div>
            <div className="atlas-filter__actions">
              <span className="atlas-filter__group">
                <Button tone="primary" iconStart={<Plus size={14} aria-hidden />} onClick={() => void navigate('/workspace/orders/new')}>
                  新增訂單
                </Button>
                <Button variant="outline" iconStart={<CloudDownload size={14} aria-hidden />} onClick={() => toast.add({ title: '已建立匯出工作', tone: 'info' })}>
                  匯出
                </Button>
              </span>
              <span className="atlas-filter__group">
                <Button variant="outline" onClick={resetFilters}>
                  重設
                </Button>
                <Button tone="primary" type="submit" iconStart={<Search size={14} aria-hidden />}>
                  查詢
                </Button>
              </span>
            </div>
          </form>
        </Card>

        {orders.isError ? (
          <Message tone="danger" title={orders.error?.message} action={<Button size="sm" onClick={() => void orders.refetch()}>重試</Button>} />
        ) : null}
        <section className="atlas-table" aria-label="訂單列表">
          <Card className="atlas-card atlas-table__card">
            <DataGrid<OrderRecord>
              aria-label="訂單"
              data={pageData}
              columns={columns}
              height="100%"
              className="atlas-orders-grid"
              headerHeight={31}
              estimatedRowHeight={76}
              sorting={{ indicators: 'always' }}
              filtering={{ ui: 'checklist' }}
              selection={false}
              gridLines="horizontal"
              striped={false}
              locale="zh-TW"
              renderEmpty={() => <span className="atlas-muted">沒有符合條件的訂單</span>}
            />
          </Card>
          <Card className="atlas-card atlas-pager">
            <span className="atlas-muted">
              顯示 {first}–{last} 筆
            </span>
            <span className="atlas-pager__end">
              <span>共 {filteredData.length} 筆</span>
              <Pager
                aria-label="訂單分頁"
                size="sm"
                variant="outline"
                page={currentPage}
                pageSize={pageSize}
                totalCount={filteredData.length}
                onPageChange={(event) => setCurrentPage(event.page)}
                showInfo={false}
                pageSizeOptions={false}
                buttonCount={5}
              />
            </span>
          </Card>
        </section>
      </div>
      <Outlet />
    </>
  );
}
