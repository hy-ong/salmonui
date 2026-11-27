'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Form } from '@salmonui/inputs/form';
import { MaskedField } from '@salmonui/inputs/masked-field';
import { NumberField } from '@salmonui/inputs/number-field';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { Rating } from '@salmonui/inputs/rating';
import { Select } from '@salmonui/dropdowns/select';
import { SignaturePad } from '@salmonui/inputs/signature-pad';
import { Slider } from '@salmonui/inputs/slider';
import { Switch } from '@salmonui/inputs/switch';
import { TextField } from '@salmonui/inputs/text-field';

/** One line per FormData entry; long data URLs are shortened. */
function entriesOf(form: HTMLFormElement): string[] {
  return Array.from(new FormData(form), ([key, value]) => {
    const text = typeof value === 'string' ? value : `File ${value.name}`;
    return `${key} = ${text.length > 48 ? `${text.slice(0, 40)}… (${text.length} chars)` : JSON.stringify(text)}`;
  });
}

// Every field is uncontrolled inside a native form: names submit through
// FormData (custom-drawn controls through native or hidden inputs) and the
// Reset button restores each defaultValue and clears the shown errors.
export default function FieldFormsDemo() {
  const [submitValue, setSubmitValue] = useState<'raw' | 'masked'>('raw');
  const [entries, setEntries] = useState<readonly string[]>([]);
  const [status, setStatus] = useState('Change some fields, then submit or reset.');
  return (
    <>
      <div className="demo-toolbar">
        <label>
          MaskedField submitValue
          <Select aria-label="MaskedField submitValue" data={['raw', 'masked']} value={submitValue} onValueChange={(value) => value != null && setSubmitValue(value as 'raw' | 'masked')} />
        </label>
      </div>
      <Form
        aria-label="Delivery preferences"
        style={{ display: 'grid', gap: 16, maxInlineSize: 420 }}
        onSubmit={(event) => {
          event.preventDefault();
          setEntries(entriesOf(event.currentTarget));
          setStatus('Submitted: the FormData entries are listed below.');
        }}
        onValidate={({ valid }) => !valid && setStatus('Not submitted: fix the highlighted field.')}
        onReset={() => {
          setEntries([]);
          setStatus('Reset: every field is back to its defaultValue.');
        }}
      >
        <TextField name="name" label="Name" defaultValue="Ada Lovelace" required />
        <MaskedField name="phone" label="Phone" mask="(000) 000-0000" defaultValue="5551234567" required submitValue={submitValue} description="Required: an incomplete number blocks the submit" />
        <NumberField name="parcels" label="Parcels" defaultValue={2} min={1} max={9} />
        <RadioGroup name="slot" label="Delivery slot" defaultValue="am" orientation="horizontal">
          <Radio value="am">Morning</Radio>
          <Radio value="pm">Afternoon</Radio>
        </RadioGroup>
        <Checkbox name="extras" value="gift-wrap" defaultChecked>
          Gift wrap
        </Checkbox>
        <Switch name="notify" value="sms">
          Text me when it ships
        </Switch>
        <Slider name="window" label="Delivery window (hours)" defaultValue={[9, 17]} min={6} max={22} ticks={{ placement: 'after', majorStep: 4 }} />
        <Rating name="priority" label="Priority" defaultValue={2} count={3} />
        <SignaturePad name="signature" label="Signature" description="Optional: submitted as a PNG data URL" height={120} backgroundColor="#ffffff" />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" tone="primary">
            Submit
          </Button>
          <Button type="reset" variant="outline">
            Reset
          </Button>
        </div>
      </Form>
      <p className="demo-status" role="status">
        {status}
      </p>
      <pre className="demo-log" aria-label="Submitted FormData">
        {entries.length === 0 ? '(nothing submitted yet)' : entries.join('\n')}
      </pre>
    </>
  );
}
