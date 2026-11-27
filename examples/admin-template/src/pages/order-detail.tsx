import { Button } from '@salmonui/buttons/button';
import { Message } from '@salmonui/notifications/message';
import { Spinner } from '@salmonui/notifications/spinner';
import { Drawer } from '@salmonui/overlays/drawer';
import { useOrder } from '../api';
import { OrderEditor } from '../components/order-editor';
import { NotFoundResult } from '../components/not-found-result';
import { useParams, useRouter } from '../lib/router';

export function OrderDetailPage() {
  const orderId = useParams()['orderId'] ?? '';
  const order = useOrder(orderId);
  const { navigate } = useRouter();
  const close = (): void => void navigate('/workspace/orders', { replace: true });

  if (order.isSuccess && order.data) return <OrderEditor key={order.data.id} record={order.data} />;

  return (
    <Drawer open side="end" size="min(800px, 100vw)" className="atlas-drawer atlas-drawer--details" closeButton title={order.isSuccess ? '找不到訂單' : '訂單資料'} onOpenChange={(open) => (open ? undefined : close())}>
      <Drawer.Body className="atlas-drawer__body">
        {order.isPending ? (
          <Spinner aria-label="載入訂單資料" />
        ) : order.isError ? (
          <Message
            tone="danger"
            title={order.error?.message}
            action={
              <Button size="sm" onClick={() => void order.refetch()}>
                重試
              </Button>
            }
          />
        ) : (
          <NotFoundResult
            title="找不到訂單"
            subTitle={`訂單 ${orderId} 不存在`}
            extra={
              <Button size="sm" tone="primary" onClick={close}>
                返回訂單列表
              </Button>
            }
          />
        )}
      </Drawer.Body>
    </Drawer>
  );
}
