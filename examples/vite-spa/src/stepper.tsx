// Stepper browser page (tests/browser/stepper.spec.ts, stepper-a11y.spec.ts):
//
//   ?dir=rtl  ?scheme=dark
//   ?mode=hydrate   server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//
// Every callback appends to window.__events; window.__setStep(index) drives
// the controlled #controlled stepper (its onValueChange only records).
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
// The theme and the family's own stylesheet (/stepper is self-contained), plus
// the Tooltip stylesheet for the composed step tooltips (#tips).
import '@salmonui/core/styles.css';
import '@salmonui/navigation/stepper/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import { Step, Stepper } from '@salmonui/navigation/stepper';
import { Tooltip } from '@salmonui/overlays/tooltip';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const win = window as unknown as { __events: unknown[]; __setStep?: (index: number) => void };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

function Controlled() {
  const [step, setStep] = useState(1);
  win.__setStep = setStep;
  return (
    <Stepper id="controlled" aria-label="Controlled" value={step} onValueChange={(next, event) => log('controlled', next, event.source)}>
      <Step label="One" />
      <Step label="Two" />
      <Step label="Three" />
    </Stepper>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24, display: 'grid', gap: 32, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
        <h1>Stepper</h1>
        <button id="before" type="button">
          Before
        </button>
        <Stepper
          id="main"
          aria-label="Checkout"
          onStepClick={(event) => log('click', event.index, event.source)}
          onBeforeValueChange={(event) => {
            log('before', event.value, event.previousValue, event.source);
            if (event.value === 4) event.preventDefault();
          }}
          onValueChange={(value, event) => log('change', value, event.source)}
        >
          <Step label="Account" description="Sign in" />
          <Step label="Billing" optional />
          <Step label="Disabled" disabled />
          <Step label="Shipping" invalid />
          <Step label="Vetoed" />
          <Step label="Confirm" />
        </Stepper>
        <Stepper id="linear" aria-label="Linear" linear defaultValue={0}>
          <Step label="First" />
          <Step label="Second" />
          <Step label="Third" />
          <Step label="Fourth" />
        </Stepper>
        <Stepper id="vertical" aria-label="Vertical" orientation="vertical" defaultValue={1}>
          <Step label="Up one" />
          <Step label="Up two" />
          <Step label="Up three" />
        </Stepper>
        <Stepper id="readonly" aria-label="Read only" readOnly value={1}>
          <Step label="Done" />
          <Step label="Now" />
          <Step label="Later" />
        </Stepper>
        <Stepper id="custom" aria-label="Custom" defaultValue={1} renderStep={(ctx) => <span className="custom-step">{`${ctx.index + 1}. ${String(ctx.label)} (${ctx.status})`}</span>}>
          <Step label="Cart" />
          <Step label="Pay" />
        </Stepper>
        <Controlled />
        <Stepper id="tips" aria-label="With tooltips" defaultValue={0}>
          <Step label="Cart" render={(step) => <Tooltip content="Review the items in your cart" render={(tip) => <button {...step} {...tip} />} />} />
          <Step label="Address" render={(step) => <Tooltip content={<strong>Where we ship to</strong>} render={(tip) => <button {...step} {...tip} />} />} />
          <Step label="Plain" render={(step) => <button {...step} title="No tooltip, a native title" />} />
        </Stepper>
        <button id="after" type="button">
          After
        </button>
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (mode === 'hydrate') {
  const html = renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
  (window as unknown as { __ssrHtml: string }).__ssrHtml = html;
  root.innerHTML = html;
  hydrateRoot(
    root,
    <StrictMode>
      <Page />
    </StrictMode>,
    { onRecoverableError: (error) => console.error('recoverable', error) },
  );
  requestAnimationFrame(() => ((window as unknown as { __hydrated: boolean }).__hydrated = true));
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
