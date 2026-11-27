// Scheduler browser page (tests/browser/recurrence-editor.spec.ts,
// tests/browser/scheduler*.spec.ts): RecurrenceEditor and Scheduler
// scenarios, each in a `[data-scenario]` block with fixed locales, zones and
// dates. User changes are recorded in `window.__schedEvents`.
//
//   ?scheme=dark   dark color scheme
//   ?ssr=1         renderToString in the browser, then hydrateRoot
//   ?set=more      the scenarios of scheduler-more.tsx
//   ?set=keys      the keyboard, clipboard and adaptive scenarios of scheduler-keys.tsx
//   ?set=perf      the render-to-paint scenarios of scheduler-perf.tsx
//   ?set=drag      the drag, resize, external drop, drag group and swipe scenarios of scheduler-drag.tsx
//   ?set=popups    the dialog, popover, context menu, tooltip and print scenarios of scheduler-popups.tsx
//   ?set=views     the timeline, resource, year and agenda scenarios of scheduler-views.tsx
//                  (with ?ssr=1: their server render, after the view chunks loaded, hydrated)
import { useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/scheduler/styles.css';
import './app.css';
import { RecurrenceEditor, Scheduler } from '@salmonui/scheduler';
import { SchedulerScenarios, WEEK_DATA } from './scheduler-scenarios.tsx';
import { SchedulerMoreScenarios } from './scheduler-more.tsx';
import { SchedulerKeyScenarios } from './scheduler-keys.tsx';
import { SchedulerPerfScenario } from './scheduler-perf.tsx';
import { SchedulerPopupScenarios } from './scheduler-popups.tsx';
import { SchedulerViewScenarios, SchedulerViewsHydration } from './scheduler-views.tsx';
import { SchedulerDragScenarios } from './scheduler-drag.tsx';
import { ThemeProvider, type SalmonColorScheme } from '@salmonui/core/theme';

declare global {
  interface Window {
    __schedEvents: { id: string; type: string; value: unknown; details?: unknown }[];
    __mountMs?: number;
    __hydrated?: boolean;
    __serverHtml?: string;
  }
}

window.__schedEvents = [];
const params = new URLSearchParams(location.search);
const scheme = (params.get('scheme') ?? 'light') as SalmonColorScheme;

const json = (v: unknown): unknown => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));
const log = (id: string, type: string) => (value: unknown, details?: unknown) => {
  window.__schedEvents.push({ id, type, value: json(value), details: json(details) });
};

function Block({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section data-scenario={id} style={{ display: 'block', margin: 8 }}>
      <h2 style={{ fontSize: 12, margin: '0 0 4px' }}>{id}</h2>
      {children}
    </section>
  );
}

function ControlledEditor() {
  const [rule, setRule] = useState<string | null>('FREQ=WEEKLY;BYDAY=MO,WE');
  return (
    <>
      <RecurrenceEditor
        value={rule}
        start="2026-11-23T09:00"
        onValueChange={(r, d) => {
          log('re-controlled', 'value')(r, d);
          setRule(r);
        }}
      />
      <output data-testid="rule">{rule ?? 'null'}</output>
      <button type="button" data-testid="set-monthly" onClick={() => setRule('FREQ=MONTHLY;BYDAY=-1FR;COUNT=5')}>
        Set monthly
      </button>
    </>
  );
}

function Page() {
  if (params.get('set') === 'views')
    return (
      <ThemeProvider theme={{ colorScheme: scheme }} className="app">
        <main>
          <h1 style={{ fontSize: 14 }}>Scheduler views</h1>
          <SchedulerViewScenarios log={log} Block={Block} />
        </main>
      </ThemeProvider>
    );
  if (params.get('set') === 'drag')
    return (
      <ThemeProvider theme={{ colorScheme: scheme }} className="app">
        <main>
          <SchedulerDragScenarios log={log} Block={Block} />
        </main>
      </ThemeProvider>
    );
  if (params.get('set') === 'perf')
    return (
      <ThemeProvider theme={{ colorScheme: scheme }} className="app">
        <main>
          <h1 style={{ fontSize: 14 }}>Scheduler performance</h1>
          <SchedulerPerfScenario />
        </main>
      </ThemeProvider>
    );
  if (params.get('set') === 'keys')
    return (
      <ThemeProvider theme={{ colorScheme: scheme }} className="app">
        <main>
          <SchedulerKeyScenarios log={log} Block={Block} />
        </main>
      </ThemeProvider>
    );
  if (params.get('set') === 'more')
    return (
      <ThemeProvider theme={{ colorScheme: scheme }} className="app">
        <main>
          <SchedulerMoreScenarios log={log} Block={Block} />
        </main>
      </ThemeProvider>
    );
  if (params.get('set') === 'popups')
    return (
      <ThemeProvider theme={{ colorScheme: scheme }} className="app">
        <main>
          <SchedulerPopupScenarios log={log} Block={Block} />
        </main>
      </ThemeProvider>
    );
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <main>
      <h1 style={{ fontSize: 14 }}>Scheduler and RecurrenceEditor</h1>
      <Block id="re-basic">
        <RecurrenceEditor defaultFrequency="never" start="2026-11-23T09:00" onValueChange={log('re-basic', 'value')} />
      </Block>
      <Block id="re-controlled">
        <ControlledEditor />
      </Block>
      <Block id="re-limited">
        <RecurrenceEditor frequencies={['never', 'daily', 'weekly']} endTypes={['never', 'count']} defaultFrequency="daily" start="2026-11-23T09:00" onValueChange={log('re-limited', 'value')} />
      </Block>
      <Block id="re-monthly">
        <RecurrenceEditor defaultValue="FREQ=MONTHLY;BYMONTHDAY=23;UNTIL=20270101" start="2026-11-23T09:00" min="2026-11-23" max="2027-06-30" onValueChange={log('re-monthly', 'value')} />
      </Block>
      <Block id="re-yearly">
        <RecurrenceEditor defaultValue="FREQ=YEARLY;BYMONTH=11;BYDAY=4TH" start="2026-11-26T09:00" onValueChange={log('re-yearly', 'value')} />
      </Block>
      <Block id="re-de">
        <RecurrenceEditor defaultValue="FREQ=WEEKLY;BYDAY=MO" locale="de-DE" start="2026-11-23T09:00" localeText={{ repeat: 'Wiederholen', weeklyOn: { one: 'Jede Woche am {days}', other: 'Alle {interval} Wochen am {days}' } }} />
      </Block>
      <Block id="re-rtl">
        <RecurrenceEditor defaultValue="FREQ=DAILY" dir="rtl" locale="ar-EG" className="custom-class" style={{ maxInlineSize: 480 }} start="2026-11-23T09:00" />
      </Block>
      <Block id="re-disabled">
        <RecurrenceEditor defaultValue="FREQ=DAILY;COUNT=3" disabled start="2026-11-23T09:00" />
      </Block>
      <SchedulerScenarios log={log} Block={Block} />
      </main>
    </ThemeProvider>
  );
}

function Hydration() {
  if (params.get('set') === 'views')
    return (
      <ThemeProvider theme={{ colorScheme: scheme }} className="app">
        <SchedulerViewsHydration />
      </ThemeProvider>
    );
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <Block id="ssr-editor">
        <RecurrenceEditor defaultValue="FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231" start="2026-11-23T09:00" />
      </Block>
      <Block id="ssr-scheduler">
        <Scheduler data={WEEK_DATA} view="week" date="2026-11-23" timeZone="America/New_York" height={480} />
      </Block>
    </ThemeProvider>
  );
}

const container = document.getElementById('root') as HTMLElement;
const t0 = performance.now();
if (params.get('ssr') === '1') {
  // The browser build resolves the lazy view registry: render until the view chunks the first
  // render requested have loaded (a server build imports them statically and renders at once).
  const serverRender = async (): Promise<string> => {
    let html = renderToString(<Hydration />);
    for (let i = 0; i < 100 && html.includes('salmon-scheduler__pending'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      html = renderToString(<Hydration />);
    }
    return html;
  };
  void serverRender().then((html) => {
    window.__serverHtml = html;
    container.innerHTML = html;
    hydrateRoot(container, <Hydration />, { onRecoverableError: (e) => console.error('recoverable', e) });
    requestAnimationFrame(() => (window.__hydrated = true));
  });
} else {
  createRoot(container).render(<Page />);
}
requestAnimationFrame(() => (window.__mountMs = performance.now() - t0));
