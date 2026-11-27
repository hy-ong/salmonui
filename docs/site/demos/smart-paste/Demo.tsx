'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { TextArea, TextField } from '@salmonui/inputs/text-field';
import { useSmartPaste, type SmartPasteAdapter } from '@salmonui/chat/smart-paste';
import { EventLog, useEventLog } from '../../components/demo-kit';

const PLANS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
];

const SAMPLE = 'Hi, this is Grace Hopper (grace@example.com) from Arlington. Please move me to the Pro plan and keep the newsletter coming. Call me after 5pm.';

/**
 * A stand-in for your server: a real adapter posts `{ clipboardText, fields }` to an endpoint that
 * prompts a model with the field descriptors. This one finds the values with regular expressions,
 * after a short delay so the pending state is visible.
 */
const adapter: SmartPasteAdapter = async ({ clipboardText }, { signal }) => {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 600);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(clipboardText)?.[0];
  const name = /this is ([A-Z][a-z]+ [A-Z][a-z]+)/.exec(clipboardText)?.[1];
  const city = /from ([A-Z][a-z]+)/.exec(clipboardText)?.[1];
  const plan = /\bpro\b/i.test(clipboardText) ? 'pro' : undefined;
  const notes = /(Call [^.]+\.)/.exec(clipboardText)?.[1];
  return { name, email, city, plan, newsletter: /newsletter/i.test(clipboardText), notes };
};

export default function SmartPasteDemo() {
  const formRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState(SAMPLE);
  const [plan, setPlan] = useState('free');
  const [log, push] = useEventLog();
  // The Select is not a native control, so it is described and filled as a custom field.
  const { paste, pending } = useSmartPaste(formRef, adapter, {
    fields: [
      {
        name: 'plan',
        label: 'Plan',
        type: 'select',
        options: PLANS.map((p) => p.value),
        fill: (value) => {
          const next = PLANS.find((p) => p.value === String(value).toLowerCase());
          if (!next) return false;
          setPlan(next.value);
        },
      },
    ],
  });
  const run = (fromClipboard: boolean): void => {
    (fromClipboard ? paste() : paste(text)).then(
      ({ filled, skipped }) => push(`filled ${filled.join(', ') || '-'}; skipped ${skipped.join(', ') || '-'}`),
      (error: unknown) => push(`error ${error instanceof Error ? error.name : String(error)}`),
    );
  };
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
      <TextArea label="Text to paste" rows={3} value={text} onValueChange={setText} />
      <form ref={formRef} style={{ display: 'grid', gap: 12 }} onSubmit={(e) => e.preventDefault()} onReset={() => setPlan('free')}>
        <TextField name="name" label="Full name" />
        <TextField name="email" type="email" label="Email" />
        <TextField name="city" label="City" data-salmon-paste-description="City of the customer's address" />
        <label>
          Plan{' '}
          <Select aria-label="Plan" data={PLANS} value={plan} onValueChange={(value) => value != null && setPlan(String(value))} />
        </label>
        <Checkbox name="newsletter">Newsletter</Checkbox>
        <TextArea name="notes" label="Notes" rows={2} />
        <div data-salmon-paste="off" style={{ display: 'grid' }}>
          <TextField name="agent" label="Agent (never pasted)" defaultValue="Ada" />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="solid" loading={pending} onClick={() => run(false)}>
            Smart paste the text above
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => run(true)}>
            Paste from clipboard
          </Button>
          <Button type="reset" variant="ghost">
            Reset
          </Button>
        </div>
      </form>
      <EventLog entries={log} />
    </div>
  );
}
