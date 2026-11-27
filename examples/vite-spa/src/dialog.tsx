// Dialog family browser page (tests/browser/dialog.spec.ts):
// Dialog (modal, modeless, draggable, resizable), AlertDialog,
// DialogProvider + useConfirm / useAlert, Drawer.
//
//   ?dir=rtl  ?scheme=dark  ?hydrate (server-render, then hydrate)
//
// window.__dialog records callbacks: { id, kind, ... }; window.__renders counts Draggable renders.
import { StrictMode, useRef, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/overlays/dialog/styles.css';
import '@salmonui/overlays/drawer/styles.css';
import { Button } from '@salmonui/buttons/button';
import { AlertDialog, Dialog, DialogProvider, useAlert, useConfirm, type DialogOpenChangeEvent } from '@salmonui/overlays/dialog';
import { Drawer } from '@salmonui/overlays/drawer';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __dialog?: Record<string, unknown>[];
    __renders?: number;
    __abort?: AbortController;
  }
}

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const push = (entry: Record<string, unknown>) => (window.__dialog ??= []).push(entry);
const change = (id: string) => (open: boolean, e: DialogOpenChangeEvent) => push({ id, kind: 'change', open, reason: e.reason, source: e.source, returnValue: e.returnValue });
const trigger = (id: string, label: string) => <Dialog.Trigger id={id} render={(p) => <Button {...p}>{label}</Button>} />;

function Guarded() {
  // Uncontrolled; Escape is vetoed with preventDefault while "locked" is checked.
  const locked = useRef(false);
  return (
    <Dialog
      trigger={trigger('guarded-trigger', 'Guarded')}
      data-test="guarded"
      onOpenChange={(open, e) => {
        change('guarded')(open, e);
        if (!open && e.reason === 'escape' && locked.current) e.preventDefault();
      }}
      dismissible={{ escape: true, outside: true }}
      onOverlayPress={() => push({ id: 'guarded', kind: 'overlay' })}
    >
      <Dialog.Title>Guarded</Dialog.Title>
      <label>
        <input type="checkbox" id="lock" onChange={(e) => (locked.current = e.target.checked)} /> Lock Escape
      </label>
    </Dialog>
  );
}

function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button id="controlled-open" onClick={() => setOpen(true)}>
        Controlled
      </Button>
      <Dialog open={open} onOpenChange={(o, e) => (change('controlled')(o, e), e.reason !== 'outside' && setOpen(o))} data-test="controlled" aria-label="Controlled dialog" dismissible>
        <p>Outside presses are vetoed by the parent.</p>
        <Dialog.Close id="controlled-close">Close</Dialog.Close>
      </Dialog>
    </>
  );
}

function Draggable() {
  window.__renders = (window.__renders ?? 0) + 1;
  return (
    <Dialog
      trigger={trigger('drag-trigger', 'Draggable')}
      data-test="drag"
      modal={false}
      draggable
      resizable={['bottomEnd', 'end']}
      defaultPosition={{ x: 0, y: 0 }}
      width={360}
      height={240}
      onMoveStart={() => push({ id: 'drag', kind: 'moveStart' })}
      onMove={(p) => push({ id: 'drag', kind: 'move', ...p })}
      onMoveEnd={(p) => push({ id: 'drag', kind: 'moveEnd', ...p })}
      onPositionChange={(p) => push({ id: 'drag', kind: 'position', ...p })}
      onResizeEnd={(s) => push({ id: 'drag', kind: 'resizeEnd', ...s })}
      closeButton
    >
      <Dialog.Title id="drag-title">Drag me</Dialog.Title>
      <Dialog.Body>Drag the title or use the arrow keys on it.</Dialog.Body>
    </Dialog>
  );
}

function Imperative() {
  const confirm = useConfirm();
  const alert = useAlert();
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button id="use-confirm" onClick={async () => push({ id: 'useConfirm', kind: 'result', value: await confirm({ title: 'Delete order?', description: 'This cannot be undone.', tone: 'danger', confirmLabel: 'Delete' }) })}>
        useConfirm
      </Button>
      <Button id="use-alert" onClick={async () => (await alert({ title: 'Saved', description: 'The order was saved.' }), push({ id: 'useAlert', kind: 'result' }))}>
        useAlert
      </Button>
      <Button
        id="use-confirm-abort"
        onClick={async () => {
          window.__abort = new AbortController();
          push({ id: 'abort', kind: 'result', value: await confirm({ title: 'Wait', signal: window.__abort.signal }) });
        }}
      >
        Abortable
      </Button>
      <Button
        id="use-confirm-async"
        onClick={async () => {
          let attempt = 0;
          const value = await confirm({
            title: 'Sync orders?',
            confirmLabel: 'Sync',
            localeText: { error: 'Sync failed.' },
            // The first attempt rejects without an Error message (localeText.error shows), the second fulfills.
            onConfirm: () => new Promise((resolve, reject) => setTimeout(() => (++attempt === 1 ? reject('offline') : resolve(undefined)), 200)),
          });
          push({ id: 'useConfirmAsync', kind: 'result', value, attempt });
        }}
      >
        Async useConfirm
      </Button>
    </div>
  );
}

// The first confirm rejects with an Error (its message shows in the dialog), the next one fulfills.
function Publish() {
  const [attempt] = useState(() => ({ n: 0 }));
  return (
    <AlertDialog
      trigger={trigger('publish-trigger', 'Publish')}
      data-test="publish"
      title="Publish the price list?"
      confirmLabel="Publish"
      cancelLabel="Cancel"
      closeButton
      onConfirm={() => new Promise((resolve, reject) => setTimeout(() => (++attempt.n === 1 ? reject(new Error('Network unavailable')) : (push({ id: 'publish', kind: 'confirm' }), resolve(undefined))), 300))}
      onCancel={() => push({ id: 'publish', kind: 'cancel' })}
    />
  );
}

function Contained() {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setPanel} id="panel" style={{ position: 'relative', width: 400, height: 220, border: '1px dashed gray' }}>
      <Dialog trigger={trigger('contained-trigger', 'In panel')} data-test="contained" modal={false} container={panel} title="Panel dialog" width={240} />
    </div>
  );
}

function Page() {
  const name = useRef<HTMLInputElement>(null);
  return (
    <div id="page" data-salmon-a11y-root="" dir={dir} style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'start', minHeight: 900, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
      <Dialog
        trigger={trigger('basic-trigger', 'Edit order')}
        data-test="basic"
        closeButton
        initialFocus={name}
        width={480}
        className="custom"
        style={{ minHeight: 200 }}
        onOpenChange={change('basic')}
        onAfterOpen={() => push({ id: 'basic', kind: 'afterOpen' })}
        onAfterClose={() => push({ id: 'basic', kind: 'afterClose' })}
      >
        <Dialog.Title>Edit order</Dialog.Title>
        <Dialog.Description>Changes are saved on submit.</Dialog.Description>
        <form method="dialog">
          <Dialog.Body>
            <label>
              Customer <input ref={name} id="customer" name="customer" />
            </label>
            <label>
              Notes <input id="notes" />
            </label>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close id="basic-cancel" render={(p) => <Button {...p} variant="outline" />}>
              Cancel
            </Dialog.Close>
            <Button type="submit" value="saved" tone="primary" id="basic-save">
              Save
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog>

      <Dialog trigger={trigger('modeless-trigger', 'Modeless')} data-test="modeless" modal={false} title="Modeless" placement="top" onOpenChange={change('modeless')}>
        <Dialog.Body>
          <button type="button" id="modeless-button">
            Inside
          </button>
        </Dialog.Body>
      </Dialog>

      <Dialog trigger={trigger('full-trigger', 'Full screen on mobile')} data-test="full" fullScreen="mobile" title="Sheet">
        <Dialog.Body>Full screen below 640 px.</Dialog.Body>
        <Dialog.Close>Close</Dialog.Close>
      </Dialog>

      <Guarded />
      <Controlled />
      <Draggable />

      <AlertDialog
        trigger={trigger('alert-trigger', 'Alert')}
        data-test="alert"
        title="Session expired"
        description="Sign in again to continue."
        onOpenChange={change('alert')}
        onConfirm={() => push({ id: 'alert', kind: 'confirm' })}
      />
      <AlertDialog
        trigger={trigger('confirm-trigger', 'Delete')}
        data-test="confirm"
        title="Delete order?"
        description="This cannot be undone."
        tone="danger"
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={() => new Promise((resolve) => setTimeout(() => (push({ id: 'confirm', kind: 'confirm' }), resolve(undefined)), 300))}
        onCancel={() => push({ id: 'confirm', kind: 'cancel' })}
      />
      <Publish />
      <AlertDialog
        trigger={trigger('prompt-trigger', 'Rename')}
        data-test="prompt"
        title="Rename order"
        confirmLabel="Rename"
        cancelLabel="Cancel"
        onConfirm={(data) => push({ id: 'prompt', kind: 'confirm', name: data?.get('name') })}
      >
        <label>
          Name <input name="name" id="prompt-name" defaultValue="Order 1" />
        </label>
      </AlertDialog>

      <Drawer trigger={trigger('drawer-trigger', 'Menu')} data-test="drawer" side="start" size={280} title="Navigation" onOpenChange={change('drawer')}>
        <Drawer.Body>
          <a href="#orders" id="drawer-link">
            Orders
          </a>
        </Drawer.Body>
      </Drawer>
      <Drawer trigger={trigger('drawer-end-trigger', 'Filters')} data-test="drawer-end" side="end" title="Filters" />

      <Imperative />
      <Contained />
      <a href="#after" id="after">
        After
      </a>
    </div>
  );
}

const app = (
  <StrictMode>
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <DialogProvider>
        <Page />
      </DialogProvider>
    </ThemeProvider>
  </StrictMode>
);
const root = document.getElementById('root') as HTMLElement;
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app);
} else createRoot(root).render(app);
