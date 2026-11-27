'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { AlertDialog, Dialog, DialogProvider, useConfirm } from '@salmonui/overlays/dialog';
import { TextField } from '@salmonui/inputs/text-field';

const trash = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6l.7-9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

function Imperative({ onResult }: { onResult: (text: string) => void }) {
  const confirm = useConfirm();
  return (
    <Button variant="outline" onClick={async () => onResult((await confirm({ title: 'Archive order?', confirmLabel: 'Archive' })) ? 'Archived' : 'Kept')}>
      Archive (useConfirm)
    </Button>
  );
}

// The first publish fails (its Error message shows in the dialog); a retry succeeds.
function Publish({ onResult }: { onResult: (text: string) => void }) {
  const [attempts] = useState(() => ({ n: 0 }));
  return (
    <AlertDialog
      trigger={<Dialog.Trigger render={(p) => <Button {...p} variant="outline">Publish</Button>} />}
      title="Publish the price list?"
      description="Customers see the new prices right away."
      confirmLabel="Publish"
      cancelLabel="Cancel"
      onConfirm={() =>
        new Promise((resolve, reject) =>
          setTimeout(() => {
            if (++attempts.n === 1) reject(new Error('Network unavailable. Check your connection and try again.'));
            else resolve(onResult('Published'));
          }, 800),
        )
      }
    />
  );
}

export default function AlertDialogDemo() {
  const [status, setStatus] = useState('Order 1042');
  return (
    <DialogProvider>
      <div className="demo-toolbar">
        <AlertDialog
          trigger={<Dialog.Trigger render={(p) => <Button {...p} tone="danger">Delete</Button>} />}
          title="Delete order?"
          description="This cannot be undone."
          tone="danger"
          confirmLabel="Delete"
          confirmIcon={trash}
          cancelLabel="Keep"
          onCancel={() => setStatus('Kept')}
          onConfirm={() => new Promise((resolve) => setTimeout(() => (setStatus('Deleted'), resolve(undefined)), 600))}
        />
        <Imperative onResult={setStatus} />
        <Publish onResult={setStatus} />
        <AlertDialog
          trigger={<Dialog.Trigger render={(p) => <Button {...p} variant="outline">Show limit</Button>} />}
          title="Export limit reached"
          description="You can export up to 10,000 rows at a time."
          confirmLabel="Got it"
          onConfirm={() => setStatus('Limit acknowledged')}
        />
        <AlertDialog
          trigger={<Dialog.Trigger render={(p) => <Button {...p} variant="outline">Rename</Button>} />}
          title="Rename order"
          description="Enter a new name for the order."
          confirmLabel="Rename"
          cancelLabel="Cancel"
          placement="top"
          draggable
          closeButton
          onConfirm={(data) => setStatus(`Renamed to ${String(data?.get('name') ?? '')}`)}
        >
          <TextField label="Name" name="name" required defaultValue="Order 1042" style={{ inlineSize: '100%' }} />
        </AlertDialog>
      </div>
      <p>
        <output>{status}</output>
      </p>
    </DialogProvider>
  );
}
