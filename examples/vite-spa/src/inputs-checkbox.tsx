// Checkbox and CheckboxGroup section of examples/vite-spa/inputs.html (?only=checkbox;
// tests/browser/inputs-checkbox.spec.ts).
import { useState } from 'react';
import { Checkbox, CheckboxGroup } from '@salmonui/inputs/checkbox';
import { Form } from '@salmonui/inputs/form';
import { log, Section, submitTo } from './inputs-shared.tsx';
import '@salmonui/inputs/checkbox/styles.css';
import '@salmonui/inputs/form/styles.css';

function Parent() {
  const [items, setItems] = useState<readonly string[]>(['a']);
  const all = items.length === 2;
  return (
    <>
      <Checkbox id="chk-all" checked={all} indeterminate={items.length === 1} onCheckedChange={(c) => setItems(c ? ['a', 'b'] : [])}>
        All toppings
      </Checkbox>
      <CheckboxGroup id="chk-controlled" label="Toppings" value={items} onValueChange={(v, d) => (log({ kind: 'chk-group', value: v, item: d.item, reason: d.reason }), setItems(v))} orientation="horizontal">
        <Checkbox value="a">Anchovy</Checkbox>
        <Checkbox value="b">Basil</Checkbox>
      </CheckboxGroup>
    </>
  );
}

export function CheckboxSection() {
  return (
    <Section id="checkbox" title="Checkbox">
      <Form id="chk-form" onSubmit={submitTo('chk-form')}>
        <Checkbox id="chk-basic" name="terms" value="yes" description="Required to continue" required onCheckedChange={(c, d) => log({ kind: 'chk', checked: c, source: d.source, reason: d.reason })}>
          I accept the terms
        </Checkbox>
        <Checkbox id="chk-start" name="news" labelPlacement="start" defaultChecked>
          Newsletter
        </Checkbox>
        <Checkbox id="chk-mixed" indeterminate aria-label="Mixed" />
        <Checkbox id="chk-disabled" disabled defaultChecked>
          Disabled
        </Checkbox>
        <CheckboxGroup id="chk-group" name="fruit" label="Fruit" description="Pick at least one" required defaultValue={['apple']} onValueChange={(v, d) => log({ kind: 'fruit', value: v, item: d.item, reason: d.reason, source: d.source })}>
          <Checkbox value="apple">Apple</Checkbox>
          <Checkbox value="pear">Pear</Checkbox>
          <Checkbox value="plum" disabled>
            Plum
          </Checkbox>
        </CheckboxGroup>
        <button type="submit" id="chk-submit">
          Submit checkboxes
        </button>
        <button type="reset" id="chk-reset">
          Reset checkboxes
        </button>
      </Form>
      <Parent />
    </Section>
  );
}
