'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { Switch } from '@salmonui/inputs/switch';
import { EventLog, useEventLog } from '../../components/demo-kit';

// Change events of the choice controls, radio labels before the control and
// standalone radios grouped only by a shared native `name`.
export default function ChoiceEventsDemo() {
  const [log, push] = useEventLog(12);
  const [shipping, setShipping] = useState<string | null>('standard');
  const [standalone, setStandalone] = useState('monthly');
  return (
    <>
      <div style={{ display: 'grid', gap: 16, maxInlineSize: 420 }}>
        <RadioGroup
          label="Shipping"
          name="ce-shipping"
          labelPlacement="start"
          value={shipping}
          onValueChange={(value, details) => {
            setShipping(value);
            push(`RadioGroup onValueChange ${JSON.stringify(value)} (${details.reason}, ${details.source})`);
          }}
        >
          <Radio value="standard">Standard, 3 to 5 days</Radio>
          <Radio value="express">Express, next day</Radio>
          <Radio value="pickup" labelPlacement="end">
            Pick up in store (label after)
          </Radio>
        </RadioGroup>
        <div role="group" aria-labelledby="ce-billing-label" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px' }}>
          <span id="ce-billing-label" style={{ flexBasis: '100%', fontWeight: 'var(--salmon-font-weight-medium)' }}>
            Billing (standalone radios)
          </span>
          <Radio name="ce-billing" value="monthly" checked={standalone === 'monthly'} onChange={(event) => (setStandalone(event.target.value), push(`Radio onChange ${event.target.value}`))}>
            Monthly
          </Radio>
          <Radio name="ce-billing" value="yearly" checked={standalone === 'yearly'} onChange={(event) => (setStandalone(event.target.value), push(`Radio onChange ${event.target.value}`))}>
            Yearly
          </Radio>
        </div>
        <Checkbox name="ce-terms" value="accepted" onCheckedChange={(checked, details) => push(`Checkbox onCheckedChange ${checked} (${details.source})`)}>
          I accept the terms
        </Checkbox>
        <Switch name="ce-dark" value="on" onCheckedChange={(checked, details) => push(`Switch onCheckedChange ${checked} (${details.source})`)}>
          Dark receipts
        </Switch>
      </div>
      <p className="demo-status">
        Shipping {JSON.stringify(shipping)} · Billing {JSON.stringify(standalone)}
      </p>
      <EventLog entries={log} label="Change events" />
    </>
  );
}
