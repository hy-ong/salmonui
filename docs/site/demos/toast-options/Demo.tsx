'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Toaster, createToastQueue, type ToastPlacement, type ToastQueue } from '@salmonui/notifications/toast';
import { EventLog, useEventLog } from '../../components/demo-kit';

const PLACEMENTS: { value: ToastPlacement; label: string }[] = [
  { value: 'topStart', label: 'Top start' },
  { value: 'top', label: 'Top' },
  { value: 'topEnd', label: 'Top end' },
  { value: 'bottomStart', label: 'Bottom start' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'bottomEnd', label: 'Bottom end' },
];

// Plain non-React code holding the queue: it adds and updates toasts
// without a component. In an application the queue is created once in a client module.
function saveDraft(queue: ToastQueue): Promise<void> {
  const id = queue.add({ title: 'Saving draft…', duration: Infinity });
  return new Promise((resolve) =>
    setTimeout(() => {
      queue.update(id, { title: 'Draft saved', tone: 'success', duration: 3000 });
      resolve();
    }, 800),
  );
}

const bell = (
  <svg viewBox="0 0 16 16" width="16" height="16">
    <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1H3zM6.5 13.5a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export default function ToastOptionsDemo() {
  const [queue] = useState(() => createToastQueue());
  const [placement, setPlacement] = useState<ToastPlacement>('topEnd');
  const [newestOnTop, setNewestOnTop] = useState(true);
  const [scoped, setScoped] = useState(false);
  const [keep, setKeep] = useState(false);
  // Read when a toast closes, after it was added: a ref, so the toast sees the current checkbox.
  const keepRef = useRef(false);
  const [rtl, setRtl] = useState(false);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  const [log, push] = useEventLog(8);
  const next = () => {
    setCount(count + 1);
    return count + 1;
  };
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'grid', gap: 12 }}>
      <div className="demo-toolbar">
        <label>
          Placement
          <Select aria-label="Placement" data={PLACEMENTS} value={placement} onValueChange={(value) => value != null && setPlacement(value as ToastPlacement)} />
        </label>
        <Checkbox checked={newestOnTop} onCheckedChange={(checked) => setNewestOnTop(checked)}>
          Newest on top
        </Checkbox>
        <Checkbox checked={scoped} onCheckedChange={(checked) => setScoped(checked)}>
          Inside the panel
        </Checkbox>
        <Checkbox
          checked={keep}
          onCheckedChange={(checked) => {
            keepRef.current = checked;
            setKeep(checked);
          }}
        >
          Keep open (veto close)
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button
          onClick={() => {
            const n = next();
            queue.add({
              title: `Reminder ${n}`,
              description: 'Stand-up starts in 5 minutes.',
              icon: bell,
              dismissible: true,
              style: { inlineSize: 280 },
              onOpen: (id) => push(`onOpen ${id}`),
              onClick: () => push(`onClick reminder ${n}`),
              onBeforeClose: (event) => {
                if (keepRef.current) event.preventDefault();
                push(`onBeforeClose ${event.reason}${keepRef.current ? ': prevented' : ''}`);
              },
              onClose: (event) => push(`onClose ${event.reason}`),
            });
          }}
        >
          Reminder (icon, width, events)
        </Button>
        <Button
          onClick={() =>
            queue.add({
              dismissible: true,
              content: (
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong>Build #{next()} passed</strong>
                  <span>
                    142 tests, 0 failures · <a href="#demo-toast-options-title">details</a>
                  </span>
                </div>
              ),
            })
          }
        >
          Custom content
        </Button>
        <Button variant="outline" onClick={() => saveDraft(queue).then(() => push('saveDraft resolved'))}>
          Save draft (non-React code)
        </Button>
        <Button variant="ghost" onClick={() => queue.dismiss()}>
          Dismiss all
        </Button>
      </div>
      <div ref={setPanel} style={{ position: 'relative', blockSize: 200, overflow: 'hidden', border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)', padding: 8 }}>
        Panel: with “Inside the panel” the toasts render in this box (<code>container</code>).
      </div>
      <Toaster queue={queue} placement={placement} newestOnTop={newestOnTop} max={3} container={scoped ? panel : undefined} localeText={{ notifications: 'Demo notifications' }} />
      <EventLog entries={log} label="Toast events" />
    </div>
  );
}
