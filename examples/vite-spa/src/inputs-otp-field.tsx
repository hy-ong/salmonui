// OtpField section of examples/vite-spa/inputs.html (?only=otp;
// tests/browser/inputs-otp-field.spec.ts).
import { Form } from '@salmonui/inputs/form';
import { OtpField } from '@salmonui/inputs/otp-field';
import { log, Section, submitTo } from './inputs-shared.tsx';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/otp-field/styles.css';

// ?otp-autofocus mounts #otp-auto with autoFocus.
const autoFocus = new URLSearchParams(location.search).has('otp-autofocus');

export function OtpSection() {
  return (
    <Section id="otp" title="OtpField">
      <Form id="otp-form" onSubmit={submitTo('otp-form')}>
        <OtpField
          id="otp-basic"
          name="code"
          label="Verification code"
          description="6 digits from the SMS"
          length={6}
          separator="-"
          groupSize={3}
          placeholder="○"
          onValueChange={(v, d) => log({ kind: 'otp', value: v, reason: d.reason })}
          onComplete={(v) => log({ kind: 'otp-complete', value: v })}
        />
        <OtpField id="otp-alpha" name="key" label="Key" type="alphanumeric" transform="uppercase" defaultValue="ab" />
        <OtpField id="otp-mask" name="pin" label="PIN" mask placeholder="0000" />
        <OtpField id="otp-auto" label="Auto focus target" autoFocus={autoFocus} />
        <button type="submit" id="otp-submit">
          Submit codes
        </button>
        <button type="reset" id="otp-reset">
          Reset codes
        </button>
      </Form>
    </Section>
  );
}
