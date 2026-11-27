import { useCallback, useState, type SubmitEvent } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Form } from '@salmonui/inputs/form';
import { useFormState } from '@salmonui/inputs/form/state';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';
import { useToast } from '@salmonui/notifications/toast';
import { useConfirm } from '@salmonui/overlays/dialog';
import { Drawer } from '@salmonui/overlays/drawer';
import { orderKeys, ordersApi } from '../api';
import type { OrderEditValues, OrderRecord } from '../api/types';
import { useMutation } from '../lib/mutation';
import { orderToEditValues } from '../lib/order-display';
import { invalidateQueries, removeQueries, setQueryData } from '../lib/query';
import { useBlocker, useRouter } from '../lib/router';
import { OrderHistoryTab } from './history-tab';
import { OrderFields } from './order-fields';
import { SystemInfo } from './system-info';

const emptyOrder: OrderEditValues = { customer: '', email: '', product: '', channel: 'Web', status: 'pending', amount: 0, owner: 'Olivia' };

function readValues(form: HTMLFormElement): OrderEditValues {
  const data = new FormData(form);
  const text = (name: string): string => String(data.get(name) ?? '').trim();
  return {
    customer: text('customer'),
    email: text('email'),
    product: text('product'),
    channel: text('channel') as OrderEditValues['channel'],
    amount: Number(text('amount') || 0),
    status: text('status') as OrderEditValues['status'],
    owner: text('owner'),
  };
}

const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

export function OrderEditor({ record }: { readonly record: OrderRecord | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { navigate } = useRouter();
  const form = useFormState();
  const save = useMutation((values: OrderEditValues) => (record ? ordersApi.update(record.id, values) : ordersApi.create(values)));
  const remove = useMutation((id: string) => ordersApi.remove(id));
  const busy = save.isPending || remove.isPending;
  const dirty = form.isDirty;
  const initial = record ? orderToEditValues(record) : emptyOrder;

  const closeDrawer = useCallback(() => navigate('/workspace/orders', { replace: true, ignoreBlocker: true }), [navigate]);
  const blocker = useCallback(
    async () => !busy && (await confirm({ title: '捨棄未儲存的變更？', description: '目前的修改尚未儲存，離開後將會遺失。', confirmLabel: '捨棄並離開', cancelLabel: '繼續編輯', tone: 'danger' })),
    [busy, confirm],
  );
  useBlocker(dirty || busy ? blocker : null, dirty || busy);

  const requestClose = async (): Promise<void> => {
    if (busy) return;
    if (dirty && !(await confirm({ title: '捨棄未儲存的變更？', description: '目前的修改尚未儲存，關閉後將會遺失。', confirmLabel: '捨棄', cancelLabel: '繼續編輯', tone: 'danger' }))) return;
    await closeDrawer();
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    try {
      const saved = await save.mutate(readValues(event.currentTarget));
      setQueryData(orderKeys.detail(saved.id), saved);
      invalidateQueries(orderKeys.list);
      invalidateQueries(orderKeys.history(saved.id));
      toast.add({ title: record ? '訂單資料已更新' : '訂單已新增', tone: 'success' });
      await closeDrawer();
    } catch (error) {
      toast.add({ title: errorText(error, '儲存失敗，請再試一次'), tone: 'danger' });
    }
  };

  const requestDelete = async (): Promise<void> => {
    if (!record || busy) return;
    const deleted = await confirm({
      title: '刪除訂單',
      description: `確定要刪除「${record.id}」嗎？`,
      confirmLabel: '刪除',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await remove.mutate(record.id);
        } catch (error) {
          toast.add({ title: errorText(error, '刪除失敗，請再試一次'), tone: 'danger' });
          throw error;
        }
      },
    });
    if (!deleted) return;
    invalidateQueries(orderKeys.list);
    toast.add({ title: '訂單已刪除', tone: 'success' });
    await closeDrawer();
    removeQueries(orderKeys.detail(record.id));
    removeQueries(orderKeys.history(record.id));
  };

  const basic = (
    <div className="atlas-section-stack">
      <div className="atlas-section">
        <OrderFields initial={initial} />
      </div>
      {record ? <SystemInfo createdAt={record.createdAt} updatedAt={record.updatedAt} /> : null}
    </div>
  );

  return (
    <Drawer
      open
      side="end"
      size="min(800px, 100vw)"
      className="atlas-drawer"
      closeButton
      dismissible={!dirty && !busy}
      title={
        <span className="atlas-drawer__heading">
          <span>{record ? '編輯訂單' : '新增訂單'}</span>
          {record ? <span className="atlas-drawer__account">{record.id}</span> : null}
        </span>
      }
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <Form id="order-form" ref={form.ref} requiredMark autoComplete="off" className="atlas-drawer__form" onSubmit={(event) => void submit(event)}>
        <Drawer.Body className="atlas-drawer__body">
          {record ? (
            <Tabs defaultValue="basic" className="atlas-tabs">
              <TabList aria-label="訂單資料">
                <Tab value="basic">基本資料</Tab>
                <Tab value="history" disabled={busy}>
                  異動紀錄
                </Tab>
              </TabList>
              <TabPanel value="basic">{basic}</TabPanel>
              <TabPanel value="history">
                <OrderHistoryTab key={record.id} orderId={record.id} />
              </TabPanel>
            </Tabs>
          ) : (
            basic
          )}
        </Drawer.Body>
        <Drawer.Footer className="atlas-drawer__footer">
          <div>
            {record ? (
              <Button variant="outline" tone="danger" loading={remove.isPending} disabled={save.isPending} onClick={() => void requestDelete()}>
                刪除
              </Button>
            ) : null}
          </div>
          {dirty ? (
            <span className="atlas-drawer__actions">
              <Button variant="outline" disabled={busy} onClick={form.reset}>
                棄用
              </Button>
              <Button tone="primary" type="submit" loading={save.isPending} disabled={remove.isPending}>
                儲存
              </Button>
            </span>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => void requestClose()}>
              關閉
            </Button>
          )}
        </Drawer.Footer>
      </Form>
    </Drawer>
  );
}
