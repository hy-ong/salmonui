// RadioGroup and Radio section of examples/vite-spa/inputs.html (?only=radio;
// tests/browser/inputs-radio-group.spec.ts).
import { useState } from 'react';
import { Form } from '@salmonui/inputs/form';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { log, Section, submitTo } from './inputs-shared.tsx';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/radio-group/styles.css';

function ControlledRadio() {
  const [value, setValue] = useState<string | null>('s');
  return (
    <>
      <RadioGroup id="rad-controlled" label="Controlled size" value={value} onValueChange={(v) => setValue(v)} orientation="horizontal" labelPlacement="start">
        <Radio value="s">S</Radio>
        <Radio value="m">M</Radio>
      </RadioGroup>
      <output id="rad-controlled-out">{value}</output>
    </>
  );
}

export function RadioSection() {
  return (
    <Section id="radio" title="RadioGroup">
      <Form id="rad-form" onSubmit={submitTo('rad-form')}>
        <RadioGroup id="rad-group" name="plan" label="Plan" description="Billed monthly" required onValueChange={(v, d) => log({ kind: 'radio', value: v, source: d.source, reason: d.reason })}>
          <Radio value="free">Free</Radio>
          <Radio value="pro">Pro</Radio>
          <Radio value="team" disabled>
            Team
          </Radio>
          <Radio value="max">Max</Radio>
        </RadioGroup>
        <RadioGroup id="rad-default" name="ship" label="Shipping" defaultValue="std" readOnly={false}>
          <Radio value="std">Standard</Radio>
          <Radio value="exp">Express</Radio>
        </RadioGroup>
        <RadioGroup id="rad-readonly" name="locked" label="Locked" defaultValue="x" readOnly>
          <Radio value="x">X</Radio>
          <Radio value="y">Y</Radio>
        </RadioGroup>
        <button type="submit" id="rad-submit">
          Submit radios
        </button>
        <button type="reset" id="rad-reset">
          Reset radios
        </button>
      </Form>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>Standalone</legend>
        <Radio id="rad-solo-a" name="solo" value="a" defaultChecked>
          Solo A
        </Radio>
        <Radio id="rad-solo-b" name="solo" value="b">
          Solo B
        </Radio>
      </fieldset>
      <ControlledRadio />
    </Section>
  );
}
