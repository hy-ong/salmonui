'use client';
import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Dialog } from '@salmonui/overlays/dialog';
import { Select, type SelectValue } from '@salmonui/dropdowns/select';
import { TextArea } from '@salmonui/inputs/text-field';
import { Tooltip } from '@salmonui/overlays/tooltip';
import { EventLog, useEventLog } from '../../components/demo-kit';

const help = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.4 6.3a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1.1v.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="11.4" r=".9" fill="currentColor" />
  </svg>
);

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

// A modal task dialog whose placement, size, dismissal and direction come from
// the controls, with a cancellable close request, initial focus on the notes,
// and a Select and a Tooltip that stay usable inside the modal dialog.
export default function DialogOptionsDemo() {
  const [placement, setPlacement] = useState<'center' | 'top'>('center');
  const [width, setWidth] = useState(420);
  const [fullScreen, setFullScreen] = useState<'off' | 'mobile' | 'always'>('off');
  const [outside, setOutside] = useState(false);
  const [guard, setGuard] = useState(true);
  const [rtl, setRtl] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [priority, setPriority] = useState<SelectValue | null>('normal');
  const [log, record] = useEventLog(6);
  const notes = useRef<HTMLTextAreaElement>(null);
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Placement
          <Select aria-label="Placement" data={[{ value: 'center', label: 'Center' }, { value: 'top', label: 'Top' }]} value={placement} onValueChange={(value) => value != null && setPlacement(value as 'center' | 'top')} />
        </label>
        <label>
          Width
          <Select aria-label="Width" data={[{ value: 320, label: '320 px' }, { value: 420, label: '420 px' }, { value: 560, label: '560 px' }]} value={width} onValueChange={(value) => value != null && setWidth(Number(value))} />
        </label>
        <label>
          Full screen
          <Select aria-label="Full screen" data={[{ value: 'off', label: 'Off' }, { value: 'mobile', label: 'Below 640 px' }, { value: 'always', label: 'Always' }]} value={fullScreen} onValueChange={(value) => value != null && setFullScreen(value as 'off' | 'mobile' | 'always')} />
        </label>
        <Checkbox checked={outside} onCheckedChange={(checked) => setOutside(checked)}>
          Close on a backdrop press
        </Checkbox>
        <Checkbox checked={guard} onCheckedChange={(checked) => setGuard(checked)}>
          Keep open while edited
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'}>
        <Dialog
          trigger={<Dialog.Trigger render={(p) => <Button {...p}>New task</Button>} />}
          title="New task"
          closeButton
          placement={placement}
          width={width}
          minHeight={240}
          fullScreen={fullScreen === 'off' ? false : fullScreen === 'mobile' ? 'mobile' : true}
          dismissible={{ escape: true, outside }}
          initialFocus={notes}
          style={{ borderBlockStart: '4px solid var(--salmon-color-primary)' }}
          localeText={{ close: 'Close the task dialog' }}
          onOverlayPress={() => record('backdrop pressed')}
          onOpenChange={(open, event) => {
            if (!open && guard && dirty && event.reason !== 'submit') {
              event.preventDefault();
              record(`close (${event.reason}) prevented: unsaved notes`);
              return;
            }
            record(`${open ? 'open' : 'close'} requested (${event.reason})`);
            if (!open) setDirty(false);
          }}
          onAfterOpen={() => record('after open')}
          onAfterClose={() => record('after close')}
        >
          <Dialog.Description>The notes field takes the initial focus.</Dialog.Description>
          <form method="dialog">
            <Dialog.Body>
              <div style={{ display: 'grid', gap: 12 }}>
                <TextArea label="Notes" ref={notes} name="notes" rows={3} onChange={() => setDirty(true)} />
                <div style={{ display: 'grid', gap: 4 }}>
                  <span id="demo-dialog-priority" className="salmon-field-label">
                    Priority
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Select aria-labelledby="demo-dialog-priority" data={PRIORITIES} value={priority} onValueChange={setPriority} />
                    <Tooltip content="High priority tasks are listed first">
                      <Button type="button" variant="ghost" iconOnly aria-label="About priority">
                        {help}
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Close render={(p) => <Button {...p} variant="outline" />}>Cancel</Dialog.Close>
              <Button type="submit" value="create" tone="primary">
                Create
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog>
      </div>
      <EventLog entries={log} label="Dialog events" />
    </div>
  );
}
