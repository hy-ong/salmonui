'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select, type SelectValue } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

const PLANS = [
  { value: 'free', label: 'Free' },
  { value: 'team', label: 'Team' },
  { value: 'business', label: 'Business' },
  { value: 'enterprise', label: 'Enterprise (contact sales)' },
];

const TIME_ZONES = ['Africa/Lagos', 'America/New_York', 'America/Sao_Paulo', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/Berlin', 'Europe/London', 'Pacific/Auckland'];

// Events, a vetoed change, controlled open, focus through the ref, the loading state and the sheet popup.
export default function SelectEventsDemo() {
  const [log, push] = useEventLog();
  const [plan, setPlan] = useState<SelectValue | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="select-events-plan">Plan</span>
        <Select
          ref={trigger}
          aria-labelledby="select-events-plan"
          data={PLANS}
          placeholder="Choose a plan"
          value={plan}
          onValueChange={(next, event) => {
            push(`onValueChange ${String(next)} (reason ${event.reason}, source ${event.source}, previous [${event.previousValue.join(', ')}])`);
            // A controlled value vetoes a change by not applying it.
            if (next === 'enterprise') {
              push('vetoed: Enterprise needs a sales contact');
              return;
            }
            setPlan(next);
          }}
          open={open}
          onOpenChange={(next, event) => {
            push(`onOpenChange ${next} (reason ${event.reason}, source ${event.source})`);
            setOpen(next);
          }}
          onFocus={() => push('onFocus')}
          onBlur={() => push('onBlur')}
          loading={loading}
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Open the list
        </Button>
        <Button variant="outline" onClick={() => trigger.current?.focus()}>
          Focus the Select
        </Button>
        <Checkbox checked={loading} onCheckedChange={(checked) => setLoading(checked)}>
          Loading
        </Checkbox>
      </div>
      <output>Value: {String(plan)}</output>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="select-events-zone">Time zone (full-screen sheet)</span>
        <Select aria-labelledby="select-events-zone" data={TIME_ZONES} popupMode="sheet" placeholder="Choose a time zone" />
      </div>
      <EventLog entries={log} />
    </div>
  );
}
