'use client';

import { useState, type SubmitEvent } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { Form } from '@salmonui/inputs/form';
import { useFormState } from '@salmonui/inputs/form/state';
import { TextArea, TextField } from '@salmonui/inputs/text-field';
import { Badge, type BadgeTone } from '@salmonui/notifications/badge';
import { DialogProvider, useConfirm } from '@salmonui/overlays/dialog';
import { Drawer } from '@salmonui/overlays/drawer';

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly email: string;
  readonly status: string;
  readonly owner: string;
  readonly note: string;
}

const STATUSES: { value: string; label: string; tone: BadgeTone }[] = [
  { value: 'pending', label: 'Pending', tone: 'primary' },
  { value: 'paid', label: 'Paid', tone: 'success' },
  { value: 'refunded', label: 'Refunded', tone: 'neutral' },
  { value: 'failed', label: 'Payment failed', tone: 'danger' },
];
const OWNERS = ['Olivia', 'Liam', 'Noah', 'Emma'];
const INITIAL: Order[] = [
  { id: 'ORD-1042', customer: 'Ada Lovelace', email: 'ada@example.com', status: 'paid', owner: 'Olivia', note: '' },
  { id: 'ORD-1043', customer: 'Grace Hopper', email: 'grace@example.com', status: 'pending', owner: 'Liam', note: 'Call before shipping.' },
];
const cell = { padding: '8px 12px', borderBlockEnd: '1px solid var(--salmon-border-subtle)', textAlign: 'start' } as const;
const field = { inlineSize: '100%' } as const;

// The editor drawer: Save / Discard only while dirty, Close otherwise; closing a dirty form asks first.
function OrderEditor({ order, onClose, onSave }: { order: Order; onClose: () => void; onSave: (order: Order) => void }) {
  const form = useFormState();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);

  const requestClose = async (): Promise<void> => {
    if (saving) return;
    if (form.isDirty) {
      const discard = await confirm({
        title: 'Discard unsaved changes?',
        description: 'Your changes to this order have not been saved and will be lost.',
        tone: 'danger',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      });
      if (!discard) return;
    }
    onClose();
  };

  const save = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    // A pretend request; the drawer closes once it is saved.
    setTimeout(() => {
      onSave({ ...order, customer: String(data.get('customer')), email: String(data.get('email')), status: String(data.get('status')), owner: String(data.get('owner')), note: String(data.get('note')) });
      setSaving(false);
    }, 600);
  };

  return (
    <Drawer
      open
      side="end"
      size="min(440px, 100vw)"
      title={`Edit ${order.id}`}
      closeButton
      onOpenChange={(open) => {
        // Escape, the backdrop and the close button ask before a dirty form closes.
        if (!open) void requestClose();
      }}
    >
      <Form ref={form.ref} requiredMark onSubmit={save} style={{ display: 'contents' }}>
        <Drawer.Body>
          <div style={{ display: 'grid', gap: 16 }}>
            <TextField name="customer" label="Customer" required defaultValue={order.customer} style={field} />
            <TextField name="email" label="Email" type="email" required defaultValue={order.email} style={field} />
            <Select name="status" label="Status" required data={STATUSES} defaultValue={order.status} style={field} />
            <Select name="owner" label="Owner" description="Who follows up with the customer." data={OWNERS} defaultValue={order.owner} style={field} />
            <TextArea name="note" label="Note" defaultValue={order.note} rows={3} style={field} />
            <p style={{ margin: 0, color: 'var(--salmon-text-secondary)', fontSize: 13 }} aria-live="polite">
              {form.isDirty ? `Changed: ${form.dirtyFields.join(', ')}` : 'No changes'}
            </p>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          {form.isDirty ? (
            <>
              <Button variant="outline" onClick={form.reset} disabled={saving}>
                Discard
              </Button>
              <Button type="submit" tone="primary" loading={saving}>
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => void requestClose()}>
              Close
            </Button>
          )}
        </Drawer.Footer>
      </Form>
    </Drawer>
  );
}

export default function FormStateDrawerDemo() {
  const [orders, setOrders] = useState(INITIAL);
  const [editing, setEditing] = useState<string | null>(null);
  const order = orders.find((o) => o.id === editing);
  return (
    <DialogProvider>
      <table style={{ borderCollapse: 'collapse', fontSize: 14, inlineSize: '100%', maxInlineSize: 560 }}>
        <thead>
          <tr>
            <th style={cell}>Order</th>
            <th style={cell}>Customer</th>
            <th style={cell}>Status</th>
            <th style={cell}>
              <span className="salmon-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const status = STATUSES.find((s) => s.value === o.status);
            return (
              <tr key={o.id}>
                <td style={cell}>{o.id}</td>
                <td style={cell}>{o.customer}</td>
                <td style={cell}>
                  <Badge variant="dot" tone={status?.tone}>
                    {status?.label}
                  </Badge>
                </td>
                <td style={{ ...cell, textAlign: 'end' }}>
                  <Button size="sm" variant="outline" aria-label={`Edit ${o.id}`} onClick={() => setEditing(o.id)}>
                    Edit
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {order ? <OrderEditor key={order.id} order={order} onClose={() => setEditing(null)} onSave={(next) => (setOrders((list) => list.map((o) => (o.id === next.id ? next : o))), setEditing(null))} /> : null}
    </DialogProvider>
  );
}
