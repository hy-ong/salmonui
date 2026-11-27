'use client';

import { useState, type FocusEvent } from 'react';
import { Checkbox, CheckboxGroup } from '@salmonui/inputs/checkbox';
import { MaskedField } from '@salmonui/inputs/masked-field';
import { NumberField } from '@salmonui/inputs/number-field';
import { OtpField } from '@salmonui/inputs/otp-field';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { Rating } from '@salmonui/inputs/rating';
import { Slider } from '@salmonui/inputs/slider';
import { Switch } from '@salmonui/inputs/switch';
import { TextField } from '@salmonui/inputs/text-field';

/** The accessible name a screen reader announces, from aria-labelledby, aria-label or the native label. */
function nameOf(el: HTMLElement): string {
  const ids = el.getAttribute('aria-labelledby');
  if (ids) return ids.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  const label = el.getAttribute('aria-label');
  if (label) return label;
  const input = el as HTMLInputElement;
  return input.labels?.[0]?.textContent?.trim() ?? '';
}

/** What assistive technology reads for the focused control: role, name, state and description. */
function describe(el: HTMLElement): string {
  const input = el as HTMLInputElement;
  const role = el.getAttribute('role') ?? (el.tagName === 'INPUT' ? (input.type === 'text' || input.type === 'search' || input.type === 'password' ? 'textbox' : input.type === 'range' ? 'slider' : input.type) : el.tagName.toLowerCase());
  const parts = [`role ${role}`, `name "${nameOf(el)}"`];
  const valueText = el.getAttribute('aria-valuetext') ?? el.getAttribute('aria-valuenow');
  if (valueText) parts.push(`value "${valueText}"`);
  if (input.type === 'checkbox' || input.type === 'radio') parts.push(input.checked ? 'checked' : 'not checked');
  if (input.maxLength > 0) parts.push(`maxlength ${input.maxLength}`);
  const described = el.getAttribute('aria-describedby');
  if (described) parts.push(`description "${described.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()}"`);
  return parts.join(', ');
}

// Every Inputs control in tab order. The read-out shows what the focused
// element exposes to assistive technology, updated on focus and value changes.
export default function InputsKeyboardDemo() {
  const [focused, setFocused] = useState('Press Tab to move into the first field.');
  const update = (event: FocusEvent<HTMLDivElement> | { target: EventTarget | null }) => {
    const target = event.target as HTMLElement | null;
    if (target && target instanceof HTMLElement && target.matches('input, textarea, [role="slider"], [role="spinbutton"]')) setFocused(describe(target));
  };
  return (
    <>
      <div style={{ display: 'grid', gap: 16, maxInlineSize: 420 }} onFocus={update} onKeyUp={(event) => update({ target: document.activeElement })}>
        <TextField label="Full name" description="As on your ID" />
        <MaskedField label="Postcode" mask="00000-000" description="Format 00000-000" />
        <NumberField label="Tip" formatOptions={{ style: 'currency', currency: 'USD' }} defaultValue={12} min={0} max={100} />
        <RadioGroup label="Payment" name="kb-payment" defaultValue="card" orientation="horizontal">
          <Radio value="card">Card</Radio>
          <Radio value="cash">Cash</Radio>
          <Radio value="voucher">Voucher</Radio>
        </RadioGroup>
        <CheckboxGroup label="Extras" name="kb-extras" orientation="horizontal">
          <Checkbox value="napkins">Napkins</Checkbox>
          <Checkbox value="cutlery">Cutlery</Checkbox>
        </CheckboxGroup>
        <Switch>Leave at the door</Switch>
        <Slider label="Spice level" defaultValue={[2, 4]} min={0} max={5} ticks={{ placement: 'after', majorStep: 1 }} />
        <Rating label="Rate the last order" defaultValue={4} />
        <OtpField label="Courier code" length={4} />
      </div>
      <p className="demo-status" role="status" aria-label="Focused control">
        {focused}
      </p>
    </>
  );
}
