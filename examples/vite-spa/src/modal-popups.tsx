// Popups inside modal dialogs (tests/browser/modal-popups.spec.ts): Select, Combobox,
// DatePicker, MenuButton, Tooltip and Popover inside a modal
// `Dialog` and a modal `Drawer`. Every control has an id with the host
// prefix (`dialog-` / `drawer-`). `?host=grid` puts a DataGrid with a column
// menu and checklist filter menus in a modal Dialog instead
// (tests/browser/modal-data-grid.spec.ts).
//
//   ?host=dialog|drawer|grid (default dialog)
//
// window.__modal records callbacks: { id, kind, value }.
import { StrictMode, useMemo, useState } from 'react';
import { createFilterModule } from '@salmonui/data-grid/engine';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/overlays/dialog/styles.css';
import '@salmonui/overlays/popover/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import '@salmonui/overlays/drawer/styles.css';
import { Button } from '@salmonui/buttons/button';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { Dialog } from '@salmonui/overlays/dialog';
import { Drawer } from '@salmonui/overlays/drawer';
import { MenuButton, type MenuItemData } from '@salmonui/buttons/menu';
import { Popover } from '@salmonui/overlays/popover';
import { Select } from '@salmonui/dropdowns/select';
import { ThemeProvider } from '@salmonui/core/theme';
import { Tooltip } from '@salmonui/overlays/tooltip';

declare global {
  interface Window {
    __modal?: Record<string, unknown>[];
  }
}

const push = (entry: Record<string, unknown>) => (window.__modal ??= []).push(entry);
const params = new URLSearchParams(location.search);
const hostParam = params.get('host');
const host = hostParam === 'drawer' || hostParam === 'grid' ? hostParam : 'dialog';

const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'grape', label: 'Grape' },
];

const ITEMS: MenuItemData[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'copy', label: 'Copy' },
  { id: 'share', label: 'Share', items: [{ id: 'mail', label: 'Mail' }, { id: 'chat', label: 'Chat' }] },
];

function Fields(props: { readonly id: string }) {
  const p = props.id;
  const [date, setDate] = useState<string | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
      <label id={`${p}-select-label`}>Fruit</label>
      <Select id={`${p}-select`} aria-labelledby={`${p}-select-label`} data={FRUITS} placeholder="Pick a fruit" onValueChange={(value) => push({ id: `${p}-select`, kind: 'value', value })} />
      <label id={`${p}-combobox-label`}>Topping</label>
      <Combobox id={`${p}-combobox`} aria-labelledby={`${p}-combobox-label`} data={FRUITS} placeholder="Type a fruit" onValueChange={(value) => push({ id: `${p}-combobox`, kind: 'value', value })} />
      <DatePicker
        id={`${p}-date`}
        label="Due"
        defaultValue={null}
        onValueChange={(value) => {
          const text = value ? value.toString() : null;
          setDate(text);
          push({ id: `${p}-date`, kind: 'value', value: text });
        }}
      />
      <output id={`${p}-date-value`}>{date ?? ''}</output>
      <MenuButton id={`${p}-menu`} items={ITEMS} onAction={(e) => push({ id: `${p}-menu`, kind: 'action', value: e.id })}>
        Actions
      </MenuButton>
      <Tooltip content="Saves the draft" delay={0}>
        <button type="button" id={`${p}-tip-trigger`}>
          Draft
        </button>
      </Tooltip>
      <Popover>
        <Popover.Trigger id={`${p}-popover-trigger`}>Details</Popover.Trigger>
        <Popover.Content data-test={`${p}-popover`} aria-label="Details">
          <button type="button" id={`${p}-popover-button`} onClick={() => push({ id: `${p}-popover`, kind: 'press' })}>
            Inside the popover
          </button>
        </Popover.Content>
      </Popover>
    </div>
  );
}

interface Order {
  readonly id: string;
  readonly fruit: string;
  readonly qty: number;
}

const ORDERS: readonly Order[] = FRUITS.flatMap((f, i) => [0, 1].map((n) => ({ id: `${f.value}-${n}`, fruit: f.label, qty: (i + 1) * 10 + n })));

const ORDER_COLUMNS: readonly DataGridColumn<Order>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 110 },
  { field: 'fruit', header: 'Fruit', width: 160 },
  { field: 'qty', header: 'Quantity', type: 'number', width: 120 },
];

function GridInDialog() {
  const modules = useMemo(() => [createFilterModule<Order>()], []);
  return (
    <div id="page" data-salmon-a11y-root="" style={{ padding: 32 }}>
      <Dialog
        data-test="grid"
        title="Orders"
        width={520}
        dismissible
        onOpenChange={(open, e) => push({ id: 'grid', kind: 'change', value: open, reason: e.reason })}
        trigger={<Dialog.Trigger id="open" render={(p) => <Button {...p}>Open orders</Button>} />}
      >
        <Dialog.Body>
          <DataGrid<Order>
            aria-label="Orders"
            data={ORDERS}
            columns={ORDER_COLUMNS}
            height={320}
            modules={modules}
            filtering={{ ui: 'checklist' }}
            columnMenu={['autoSize', { id: 'note', label: 'Add note' }, 'filter']}
            onColumnMenuItemClick={(e) => push({ id: 'grid-column-menu', kind: 'action', value: e.item.id, field: e.field })}
            onReady={(api) => {
              window.__gridApi = api;
            }}
          />
        </Dialog.Body>
      </Dialog>
    </div>
  );
}

function Page() {
  const common = {
    onOpenChange: (open: boolean, e: { reason: string }) => push({ id: host, kind: 'change', value: open, reason: e.reason }),
    'data-test': host,
  };
  return (
    <div id="page" data-salmon-a11y-root="" style={{ padding: 32, display: 'grid', gap: 16, justifyItems: 'start' }}>
      {host === 'dialog' ? (
        <Dialog {...common} title="Edit order" trigger={<Dialog.Trigger id="open" render={(p) => <Button {...p}>Open dialog</Button>} />}>
          <Dialog.Body>
            <Fields id="dialog" />
          </Dialog.Body>
        </Dialog>
      ) : (
        <Drawer {...common} side="end" size={380} title="Filters" trigger={<Drawer.Trigger id="open" render={(p) => <Button {...p}>Open drawer</Button>} />}>
          <Drawer.Body>
            <Fields id="drawer" />
          </Drawer.Body>
        </Drawer>
      )}
      <button type="button" id="outside">
        Outside
      </button>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ThemeProvider theme={{ colorScheme: 'light' }}>
      {host === 'grid' ? <GridInDialog /> : <Page />}
    </ThemeProvider>
  </StrictMode>,
);
