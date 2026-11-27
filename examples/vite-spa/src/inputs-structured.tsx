// MaskedField and NumberField sections of examples/vite-spa/inputs.html
// (tests/browser/inputs-structured.spec.ts).
import { useState } from 'react';
import { MaskedField } from '@salmonui/inputs/masked-field';
import { NumberField } from '@salmonui/inputs/number-field';
import { entries, log, Section } from './inputs-shared.tsx';
import '@salmonui/inputs/masked-field/styles.css';
import '@salmonui/inputs/number-field/styles.css';

function ControlledNumber() {
  const [value, setValue] = useState<number | null>(5);
  return (
    <>
      <NumberField id="num-controlled" label="Controlled" value={value} onValueChange={(v, d) => (log({ kind: 'number', value: v, reason: d.reason, source: d.source, formatted: d.formattedValue }), setValue(v))} min={0} max={10} />
      <output id="num-controlled-out">{String(value)}</output>
    </>
  );
}

export function StructuredSections() {
  return (
    <>
      <Section id="masked" title="MaskedField">
        <form
          id="masked-form"
          onSubmit={(e) => {
            e.preventDefault();
            window.__inputForms!['masked'] = entries(e.currentTarget);
          }}
        >
          <MaskedField id="mask-phone" name="phone" label="Phone" mask="(000) 000-0000" description="(555) 123-4567" onValueChange={(v, d) => log({ kind: 'mask', value: v, masked: d.masked, reason: d.reason, complete: d.complete })} />
          <MaskedField id="mask-code" name="code" label="Code" mask=">LL-0000" submitValue="masked" defaultValue="ab1234" />
          <MaskedField id="mask-custom" label="Custom" mask="##:##" tokens={{ '#': '0123456789' }} placeholderChar="•" />
          <MaskedField id="mask-required" name="req" label="Required" mask="0000" required />
          <button type="submit" id="masked-submit">
            Submit
          </button>
          <button type="reset" id="masked-reset">
            Reset
          </button>
        </form>
      </Section>
      <Section id="number" title="NumberField">
        <form
          id="number-form"
          onSubmit={(e) => {
            e.preventDefault();
            window.__inputForms!['number'] = entries(e.currentTarget);
          }}
        >
          <NumberField id="num-basic" name="qty" label="Quantity" defaultValue={1234.5} step={0.5} min={0} max={10000} />
          <NumberField id="num-currency" name="price" label="Price (de-DE)" locale="de-DE" currency="EUR" defaultValue={1234.5} />
          <NumberField id="num-percent" label="Rate" format="P1" defaultValue={0.25} step={0.01} />
          <NumberField id="num-restrict" label="Two decimals" decimals={2} restrictDecimals />
          <NumberField id="num-none" label="Unclamped" min={0} max={10} clampBehavior="none" defaultValue={5} />
          <NumberField id="num-wheel" label="Wheel" incrementOnWheel defaultValue={0} />
          <NumberField id="num-nowheel" label="No wheel" defaultValue={0} />
          <ControlledNumber />
          <button type="submit" id="number-submit">
            Submit
          </button>
          <button type="reset" id="number-reset">
            Reset
          </button>
        </form>
      </Section>
    </>
  );
}
