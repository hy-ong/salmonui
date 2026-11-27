// Switch section of examples/vite-spa/inputs.html (?only=switch;
// tests/browser/inputs-switch.spec.ts).
import { useState } from 'react';
import { Form } from '@salmonui/inputs/form';
import { Switch } from '@salmonui/inputs/switch';
import { log, Section, submitTo } from './inputs-shared.tsx';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/switch/styles.css';

export function SwitchSection() {
  const [on, setOn] = useState(false);
  return (
    <Section id="switch" title="Switch">
      <Form id="swt-form" onSubmit={submitTo('swt-form')}>
        <Switch id="swt-basic" name="wifi" value="on" description="Uses mobile data when off" onCheckedChange={(c, d) => log({ kind: 'switch', checked: c, source: d.source, reason: d.reason })}>
          Wi-Fi
        </Switch>
        <Switch id="swt-start" name="bt" labelPlacement="start" defaultChecked thumbIcon="✓">
          Bluetooth
        </Switch>
        <Switch id="swt-disabled" disabled>
          Airplane mode
        </Switch>
        <button type="submit" id="swt-submit">
          Submit switches
        </button>
        <button type="reset" id="swt-reset">
          Reset switches
        </button>
      </Form>
      <Switch id="swt-controlled" checked={on} onCheckedChange={(c) => (c ? undefined : setOn(c))}>
        Vetoed on
      </Switch>
    </Section>
  );
}
