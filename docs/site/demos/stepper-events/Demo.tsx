'use client';
import { useState } from 'react';
import { Step, Stepper } from '@salmonui/navigation/stepper';
import { TextField } from '@salmonui/inputs/text-field';

const labels = ['Details', 'Plan', 'Payment', 'Done'];

export default function StepperEventsDemo() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [log, setLog] = useState<readonly string[]>([]);
  const add = (entry: string) => setLog((list) => [entry, ...list].slice(0, 5));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      {/* Four text steps need about 340px: on a narrower screen the strip scrolls instead of squeezing. */}
      <div style={{ overflowX: 'auto', padding: 2 }}>
      <Stepper
        aria-label="Sign up"
        value={step}
        onBeforeValueChange={(event) => {
          // Leaving the first step forward needs a workspace name.
          if (event.previousValue === 0 && event.value > 0 && name.trim() === '') {
            event.preventDefault();
            add(`onBeforeValueChange cancelled ${labels[event.previousValue]} → ${labels[event.value]} (${event.source}): name is empty`);
          }
        }}
        onValueChange={(next, event) => {
          setStep(next);
          add(`onValueChange → ${labels[next]} (${event.source})`);
        }}
        renderStep={(ctx) => (
          <span style={{ display: 'grid', gap: 2 }}>
            <span>
              {ctx.index + 1}. {ctx.label}
            </span>
            <small style={{ color: 'var(--salmon-text-secondary)' }}>{ctx.status}</small>
          </span>
        )}
      >
        <Step label="Details" invalid={step > 0 && name.trim() === ''} />
        <Step label="Plan" />
        <Step label="Payment" />
        {/* Step children win over renderStep for this step only. */}
        <Step label="Done">
          <span>
            <span aria-hidden="true">✓ </span>Done
          </span>
        </Step>
      </Stepper>
      </div>
      <TextField label="Workspace name" value={name} onValueChange={(value) => setName(value)} placeholder="Required to continue" style={{ maxInlineSize: 320 }} />
      <div className="demo-log" aria-live="polite">
        {log.length === 0 ? (
          <span style={{ color: 'var(--salmon-text-secondary)' }}>No events yet.</span>
        ) : (
          <ol>
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
