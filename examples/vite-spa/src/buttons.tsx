// Buttons family browser page (tests/browser/buttons.spec.ts):
//
//   ?scheme=light|dark   theme color scheme (default light)
//   ?dir=rtl             renders everything inside dir="rtl"
//   ?unnamed             adds an iconOnly button without a name (dev warning)
//   ?perf                adds a ToggleButton and a 50-item ToggleButtonGroup (buttons-perf.spec.ts)
//   ?hydrate             renders the page to a string first and hydrates it
//                        (zero hydration warnings)
//
// window.__buttonEvents records every callback as a plain object;
// window.__formData holds the entries of the last form submission.
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import './app.css';
import { Button, ButtonGroup, ToggleButton, ToggleButtonGroup, type ButtonTone, type ButtonVariant } from '@salmonui/buttons/button';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __buttonEvents?: Record<string, unknown>[];
    __formData?: [string, string][];
  }
}

const params = new URLSearchParams(location.search);
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
window.__buttonEvents = [];
const log = (entry: Record<string, unknown>) => window.__buttonEvents?.push(entry);

const TONES: ButtonTone[] = ['neutral', 'primary', 'success', 'warning', 'danger', 'info'];
const VARIANTS: ButtonVariant[] = ['solid', 'outline', 'ghost', 'link', 'chip'];
const Plus = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 3v10M3 8h10" />
  </svg>
);

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} style={{ marginBlockEnd: 24 }}>
      <h2 id={`${id}-title`} style={{ fontSize: 14 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ControlledToggle() {
  const [pressed, setPressed] = useState(false);
  const [veto, setVeto] = useState(false);
  return (
    <>
      <ToggleButton
        id="controlled-toggle"
        pressed={pressed}
        onPressedChange={(next, event) => {
          log({ kind: 'controlled-toggle', pressed: next, source: event.source, reason: event.reason, frozen: Object.isFrozen(event) });
          if (!veto) setPressed(next);
        }}
      >
        Controlled
      </ToggleButton>
      <label>
        <input id="veto" type="checkbox" checked={veto} onChange={(e) => setVeto(e.target.checked)} /> Veto
      </label>
    </>
  );
}

function SwitchingToggle() {
  const [controlled, setControlled] = useState(true);
  return (
    <>
      <ToggleButton id="switching-toggle" {...(controlled ? { pressed: true } : {})}>
        Switching
      </ToggleButton>
      <Button id="make-uncontrolled" onClick={() => setControlled(false)}>
        Make uncontrolled
      </Button>
    </>
  );
}

function ControlledGroup() {
  const [value, setValue] = useState<string | null>('day');
  return (
    <ToggleButtonGroup
      id="view-group"
      aria-label="View"
      value={value}
      onValueChange={(next, event) => {
        log({ kind: 'view', value: next, source: event.source, reason: event.reason });
        // Vetoes "year": a controlled group ignores a proposal by not updating.
        if (next !== 'year') setValue(next);
      }}
    >
      <ToggleButton value="day">Day</ToggleButton>
      <ToggleButton value="week">Week</ToggleButton>
      <ToggleButton value="year">Year</ToggleButton>
    </ToggleButtonGroup>
  );
}

function Page() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <div dir={dir} id="page" data-salmon-a11y-root="">
        <Section id="basic" title="Button">
          <Button id="save" tone="primary" onClick={() => log({ kind: 'click', id: 'save' })}>
            Save
          </Button>{' '}
          <Button id="loading" loading={loading} onClick={() => log({ kind: 'click', id: 'loading' })}>
            Loading
          </Button>{' '}
          <Button id="stop-loading" onClick={() => setLoading(false)}>
            Stop loading
          </Button>{' '}
          <Button id="disabled" disabled onClick={() => log({ kind: 'click', id: 'disabled' })}>
            Disabled
          </Button>{' '}
          <Button id="icon-only" iconOnly aria-label="Add item" iconStart={<Plus />} />{' '}
          {params.has('unnamed') ? <Button {...({ id: 'unnamed', iconOnly: true, iconStart: <Plus /> } as object)} /> : null}
          <Button id="icons" iconStart={<Plus />} iconEnd={<span>→</span>}>
            Next
          </Button>{' '}
          <Button id="link" variant="link" render={(props) => <a {...props} href="#basic" />}>
            Orders
          </Button>{' '}
          <Button id="disabled-link" disabled variant="link" render={(props) => <a {...props} href="#disabled-target" />}>
            Disabled link
          </Button>{' '}
          <Button id="progress" progress={40} tone="success" variant="outline">
            Upload
          </Button>{' '}
          <Button id="prevented" onKeyDown={(e) => e.preventDefault()} repeat onRepeat={() => log({ kind: 'repeat', id: 'prevented' })}>
            Prevented
          </Button>
        </Section>
        <Section id="repeat" title="Repeat">
          <Button id="repeat-pointer" repeat={{ delay: 200, interval: 50 }} onRepeat={(e) => log({ kind: 'repeat', id: 'pointer', count: e.count, source: e.source })} onClick={() => setCount((c) => c + 1)}>
            Hold ({count})
          </Button>{' '}
          <Button id="repeat-key" repeat onRepeat={(e) => log({ kind: 'repeat', id: 'key', count: e.count, source: e.source })} onClick={() => log({ kind: 'click', id: 'repeat-key' })}>
            Hold key
          </Button>
        </Section>
        <Section id="toggles" title="ToggleButton">
          <ToggleButton id="bold" onPressedChange={(pressed, event) => log({ kind: 'bold', pressed, source: event.source, reason: event.reason })}>
            Bold
          </ToggleButton>{' '}
          <ControlledToggle /> <SwitchingToggle />
        </Section>
        <Section id="groups" title="ButtonGroup">
          <ButtonGroup id="actions" aria-label="Actions" variant="outline">
            <Button>Cut</Button>
            <Button>Copy</Button>
            <Button>Paste</Button>
          </ButtonGroup>{' '}
          <ButtonGroup id="vertical" aria-label="Vertical" orientation="vertical">
            <Button>Top</Button>
            <Button>Bottom</Button>
          </ButtonGroup>
        </Section>
        <Section id="forms" title="Forms">
          <form
            id="form"
            onSubmit={(e) => {
              e.preventDefault();
              window.__formData = [...new FormData(e.currentTarget).entries()].map(([k, v]) => [k, String(v)]);
            }}
          >
            <ToggleButtonGroup id="align" aria-label="Alignment" name="align" defaultValue="center" onValueChange={(value, event) => log({ kind: 'align', value, source: event.source, reason: event.reason })}>
              <ToggleButton value="left">Left</ToggleButton>
              <ToggleButton value="center">Center</ToggleButton>
              <ToggleButton value="disabled" disabled>
                Off
              </ToggleButton>
              <ToggleButton value="right">Right</ToggleButton>
            </ToggleButtonGroup>{' '}
            <ToggleButtonGroup id="style" aria-label="Text style" selectionMode="multiple" name="style" defaultValue={['bold']} disallowEmpty onValueChange={(value, event) => log({ kind: 'style', value, source: event.source, reason: event.reason })}>
              <ToggleButton value="bold">B</ToggleButton>
              <ToggleButton value="italic">I</ToggleButton>
              <ToggleButton value="underline">U</ToggleButton>
            </ToggleButtonGroup>{' '}
            <ToggleButton id="standalone" name="notify" value="yes">
              Notify
            </ToggleButton>{' '}
            <Button id="plain-in-form">Plain</Button>{' '}
            <Button id="submit" type="submit" tone="primary">
              Submit
            </Button>{' '}
            <Button id="reset" type="reset">
              Reset
            </Button>
          </form>
          <ControlledGroup />
        </Section>
        <Section id="chips" title="Chips">
          <ToggleButtonGroup id="choice" aria-label="Size" variant="chip" defaultValue="m">
            <ToggleButton value="s">Small</ToggleButton>
            <ToggleButton value="m">Medium</ToggleButton>
            <ToggleButton value="l">Large</ToggleButton>
          </ToggleButtonGroup>{' '}
          <ToggleButtonGroup id="filter" aria-label="Filters" variant="chip" tone="primary" selectionMode="multiple" defaultValue={['open']}>
            <ToggleButton value="open">Open</ToggleButton>
            <ToggleButton value="mine">Mine</ToggleButton>
            <ToggleButton value="urgent">Urgent</ToggleButton>
          </ToggleButtonGroup>
        </Section>
        <Section id="matrix" title="Tones and variants">
          {VARIANTS.map((variant) => (
            <div key={variant} style={{ display: 'flex', gap: 8, marginBlockEnd: 8 }}>
              {TONES.map((tone) => (
                <Button key={tone} data-matrix={`${tone}-${variant}`} tone={tone} variant={variant}>
                  {tone}
                </Button>
              ))}
              {TONES.map((tone) => (
                <ToggleButton key={tone} data-matrix={`${tone}-${variant}-pressed`} tone={tone} variant={variant} defaultPressed>
                  {tone}
                </ToggleButton>
              ))}
            </div>
          ))}
        </Section>
        {params.has('perf') ? (
          <Section id="perf" title="Performance">
            <ToggleButton id="perf-toggle">Bold</ToggleButton>
            <ToggleButtonGroup id="perf-group" aria-label="Fifty options" defaultValue="o0">
              {Array.from({ length: 50 }, (_, i) => (
                <ToggleButton key={i} value={`o${i}`}>
                  {`Option ${i}`}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Section>
        ) : null}
        <Section id="fab" title="Floating action button">
          <div id="fab-parent" style={{ position: 'relative', inlineSize: 320, blockSize: 160, border: '1px dashed var(--salmon-border-default)' }}>
            <Button id="fab-parent-button" floating="topStart" floatingScope="parent" iconOnly aria-label="Add in panel" iconStart={<Plus />} />
          </div>
          <Button id="fab-viewport" floating iconOnly aria-label="Compose" iconStart={<Plus />} />
        </Section>
      </div>
    </ThemeProvider>
  );
}

const root = document.getElementById('root') as HTMLElement;
const app = (
  <StrictMode>
    <Page />
  </StrictMode>
);
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app, { onRecoverableError: (error) => console.error('recoverable', error) });
} else {
  createRoot(root).render(app);
}
