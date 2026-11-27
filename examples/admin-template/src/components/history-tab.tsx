import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Badge } from '@salmonui/notifications/badge';
import { Message } from '@salmonui/notifications/message';
import { Spinner } from '@salmonui/notifications/spinner';
import { Drawer } from '@salmonui/overlays/drawer';
import { useOrderHistory } from '../api';
import type { OrderAuditChange, OrderAuditEvent } from '../api/types';
import { formatDateTime, summarizeAuditChanges } from '../lib/order-display';
import { Descriptions } from './section';

type HistoryRow = OrderAuditEvent & { summary: string };
const actionLabels = { create: '建立', update: '更新' } as const;
const actionTones = { create: 'success', update: 'info' } as const;

function HistoryAction({ action }: { readonly action: OrderAuditEvent['action'] }) {
  return (
    <Badge variant="dot" tone={actionTones[action]}>
      {actionLabels[action]}
    </Badge>
  );
}

const changeColumns: DataGridColumn<OrderAuditChange>[] = [
  { field: 'field', header: '欄位', width: 170, primaryKey: true },
  { field: 'before', header: '變更前' },
  { field: 'after', header: '變更後' },
];

function HistoryDetails({ entry, onClose }: { readonly entry: HistoryRow; readonly onClose: () => void }) {
  return (
    <Drawer open side="end" size="min(960px, 100vw)" className="atlas-drawer atlas-drawer--details" closeButton title="異動詳情" onOpenChange={(open) => (open ? undefined : onClose())}>
      <Drawer.Body className="atlas-drawer__body atlas-details">
        <Descriptions
          columns={3}
          items={[
            { key: 'time', label: '異動時間', children: formatDateTime(entry.occurredAt) },
            { key: 'actor', label: '操作者', children: entry.actor },
            { key: 'action', label: '動作', children: <HistoryAction action={entry.action} /> },
          ]}
        />
        {entry.changes.length ? (
          <DataGrid<OrderAuditChange>
            aria-label="欄位變更"
            className="atlas-history-grid"
            data={entry.changes}
            getRowId={(change) => change.key}
            columns={changeColumns}
            height="auto"
            selection={false}
            gridLines="horizontal"
            striped={false}
            resizeMode="auto"
          />
        ) : (
          <p className="atlas-empty">沒有可顯示的欄位變更</p>
        )}
      </Drawer.Body>
    </Drawer>
  );
}

export function OrderHistoryTab({ orderId }: { readonly orderId: string }) {
  const history = useOrderHistory(orderId);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const rows: HistoryRow[] = (history.data ?? []).map((entry) => ({ ...entry, summary: summarizeAuditChanges(entry.changes) }));

  if (history.isPending) return <Spinner className="atlas-history-loading" aria-label="載入異動紀錄" />;
  if (history.isError)
    return (
      <Message
        tone="danger"
        title={history.error?.message}
        action={
          <Button size="sm" onClick={() => void history.refetch()}>
            重試
          </Button>
        }
      />
    );

  const columns: DataGridColumn<HistoryRow>[] = [
    { field: 'occurredAt', header: '異動時間', width: 170, renderCell: ({ row }) => formatDateTime(row.occurredAt) },
    { field: 'action', header: '動作', width: 90, renderCell: ({ row }) => <HistoryAction action={row.action} /> },
    { field: 'actor', header: '操作者', width: 180, renderCell: ({ row }) => <span title={row.actor}>{row.actor}</span> },
    {
      field: 'summary',
      header: '變更內容',
      width: 280,
      renderCell: ({ row }) => (
        <button type="button" className="atlas-row-button" aria-label={`查看異動詳情：${row.summary}`} title={row.summary} onClick={() => setSelected(row)}>
          {row.summary}
        </button>
      ),
    },
  ];

  return (
    <>
      <DataGrid<HistoryRow>
        aria-label="異動紀錄"
        className="atlas-history-grid"
        data={rows}
        columns={columns}
        height="auto"
        selection={false}
        gridLines="horizontal"
        striped={false}
        resizeMode="auto"
        paging={rows.length > 25 ? { pageSize: 25 } : false}
        onRowClick={(event) => setSelected(event.row)}
        getRowProps={() => ({ className: 'atlas-clickable-row' })}
        renderEmpty={() => <span className="atlas-muted">尚無異動紀錄</span>}
      />
      {selected ? <HistoryDetails entry={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
