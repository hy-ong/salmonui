'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Form, type FieldValidation } from '@salmonui/inputs/form';
import { TextField } from '@salmonui/inputs/text-field';
import { EventLog, useEventLog } from '../../components/demo-kit';

const PHONE_RULES: FieldValidation = { required: [true, 'A phone number is required for courier delivery.'], tel: true };
const NO_RULES: FieldValidation = {};

// Custom and localized messages, native HTML constraints read as rules,
// rules swapped at runtime, error text from a function, the validation
// events and the native reportValidity() / requestSubmit() entry points.
export default function FormRulesDemo() {
  const form = useRef<HTMLFormElement>(null);
  const phone = useRef<HTMLInputElement>(null);
  const [courier, setCourier] = useState(false);
  const [skip, setSkip] = useState(false);
  const [log, push] = useEventLog(12);
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={courier} onCheckedChange={(checked) => setCourier(checked)}>
          Courier delivery (adds phone rules)
        </Checkbox>
        <Checkbox checked={skip} onCheckedChange={(checked) => setSkip(checked)}>
          Skip client validation (onBeforeValidate)
        </Checkbox>
      </div>
      <Form
        ref={form}
        aria-label="Shipping address"
        style={{ display: 'grid', gap: 16 }}
        onBeforeValidate={(event) => {
          if (skip) event.preventDefault();
          push(`onBeforeValidate${skip ? ': preventDefault()' : ''}`);
        }}
        onValidate={({ valid, errors }) => push(`onValidate valid=${valid} ${JSON.stringify(errors)}`)}
        onSubmit={(event) => {
          event.preventDefault();
          push('onSubmit: submitted');
        }}
        onReset={() => push('reset: errors cleared')}
      >
        <div style={{ display: 'grid', gap: 12, maxInlineSize: 400 }}>
          <TextField
            name="recipient"
            label="Recipient"
            validation={{ required: true, minLength: [3, 'Use at least {0} characters, as on the label.'] }}
            localeText={{ validationRequired: 'Who receives the parcel?' }}
            description="Per-rule message for minLength; localeText for required"
          />
          <TextField
            name="street"
            label="Street"
            validation={{ required: true, maxLength: 30, messages: { maxLength: 'Street lines hold {0} characters at most.' } }}
            description="validation.messages overrides the maxLength text"
          />
          <TextField
            name="zip"
            label="ZIP code"
            required
            pattern="[0-9]{5}"
            minLength={5}
            maxLength={5}
            inputMode="numeric"
            errorMessage={({ errors }) => `ZIP: ${errors.join(' ')} Use five digits, for example 94103.`}
            description="Native required, pattern, minLength and maxLength; the error text comes from a function"
          />
          <TextField name="site" label="Website" type="url" description='Native type="url": type "example" and blur' />
          <TextField ref={phone} name="phone" label="Phone" type="tel" validation={courier ? PHONE_RULES : NO_RULES} description={courier ? 'Required for the courier' : 'Optional'} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button type="submit" tone="primary">Submit</Button>
          <Button type="button" variant="outline" onClick={() => push(`form.reportValidity(): ${String(form.current?.reportValidity())}`)}>
            form.reportValidity()
          </Button>
          <Button type="button" variant="outline" onClick={() => push(`phone.reportValidity(): ${String(phone.current?.reportValidity())}`)}>
            phone.reportValidity()
          </Button>
          <Button type="button" variant="outline" onClick={() => form.current?.requestSubmit()}>
            form.requestSubmit()
          </Button>
          <Button type="reset" variant="outline">
            Reset
          </Button>
        </div>
      </Form>
      <EventLog entries={log} label="Validation events" />
    </>
  );
}
