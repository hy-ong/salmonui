// Mention browser page (tests/browser/mention.spec.ts):
//
//   ?field=input           an <input> instead of the <textarea>
//   ?target                attach through `target` instead of wrapping
//   ?target&late           Mention mounts only when window.__mountMention() runs (a lazily loaded Mention)
//   ?dir=rtl  ?scheme=dark
//   ?keepChar  ?suffix=<s>  ?multiWord  ?leading=0  ?min=<n>  ?max=<n>  ?highlight
//   ?remote                people come from a remote source (300 ms latency, 50 ms debounce)
//   ?veto                  onBeforeInsert cancels inserting "Bob"
//   ?controlled            the textarea is a controlled React input
//   ?field=salmon          Salmon's TextArea instead of the native textarea (with ?controlled: controlled)
//   ?events                onOpenChange and onInsert also re-render the page (an on-page event log, as the docs demo)
//   ?hydrate               server-renders the page with react-dom/server, then hydrates it
//
// window.__mention records events: { inserts, opens, searches, before, reads, aborted, value }.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/dropdowns/mention/styles.css';
import '@salmonui/inputs/text-field/styles.css';
import { Mention, type MentionDataSource, type MentionProps, type MentionTrigger } from '@salmonui/dropdowns/mention';
import { TextArea } from '@salmonui/inputs/text-field';
import { ThemeProvider } from '@salmonui/core/theme';

interface Person {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

const PEOPLE: readonly Person[] = [
  { value: 'alice', label: 'Alice Smith' },
  { value: 'bob', label: 'Bob Jones' },
  { value: 'carol', label: 'Carol White', disabled: true },
  { value: 'dave', label: 'Dave Brown' },
  { value: 'elodie', label: 'Élodie Martin' },
  { value: 'malik', label: 'Malik Ali' },
];
const TAGS: readonly Person[] = [
  { value: 'bug', label: 'bug' },
  { value: 'docs', label: 'docs' },
  { value: 'perf', label: 'performance' },
];

const log = {
  inserts: [] as { text: string; trigger: string; source: string }[],
  opens: [] as { open: boolean; reason: string }[],
  searches: [] as string[],
  before: 0,
  reads: [] as string[],
  aborted: 0,
  errors: [] as string[],
  value: '',
};
(window as unknown as { __mention: typeof log }).__mention = log;

const params = new URLSearchParams(location.search);

const remote: MentionDataSource<Person> = {
  read(request) {
    const text = request.query.search?.text.toLowerCase() ?? '';
    log.reads.push(text);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (text === 'fail') reject(new Error('boom'));
        else resolve({ version: request.version, rows: PEOPLE.filter((p) => p.label.toLowerCase().includes(text)), totalRowCount: PEOPLE.length });
      }, 300);
      request.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        log.aborted++;
      });
    });
  },
};

const triggers: MentionTrigger<Person>[] = [
  { char: '@', data: params.has('remote') ? remote : PEOPLE, keepChar: params.has('keepChar'), suffix: params.get('suffix') ?? '' },
  { char: '#', data: TAGS, keepChar: true, suffix: ' ' },
];

function Page(): ReactNode {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState('');
  const [events, setEvents] = useState<readonly string[]>([]);
  const [mounted, setMounted] = useState(!params.has('late'));
  (window as unknown as { __mountMention: () => void }).__mountMention = () => setMounted(true);
  const record = params.has('events') ? (entry: string) => setEvents((list) => [entry, ...list]) : () => {};
  const props: MentionProps<Person> = {
    triggers,
    multiWord: params.has('multiWord'),
    requireLeadingSpace: params.get('leading') !== '0',
    minSearchLength: Number(params.get('min') ?? 0),
    maxResults: Number(params.get('max') ?? 25),
    highlightMatches: params.has('highlight'),
    ignoreAccents: true,
    debounce: 50,
    className: 'demo-mention',
    classNames: { popup: 'demo-popup' },
    onInsert: (e) => {
      log.inserts.push({ text: e.text, trigger: e.trigger, source: e.source });
      record(`insert ${e.text}`);
    },
    onOpenChange: (open, e) => {
      log.opens.push({ open, reason: e.reason });
      record(`${open ? 'open' : 'close'} ${e.reason}`);
    },
    onSearchChange: (e) => log.searches.push(`${e.trigger}${e.text}`),
    onLoadError: (error) => log.errors.push(String((error as Error).message)),
    // ?icons: per-item icons through renderItem.
    ...(params.has('icons')
      ? {
          renderItem: ({ item, label }: { item: Person; label: string }) => (
            <span className="demo-person">
              <span className="demo-avatar" aria-hidden="true" data-icon={item.value}>
                {label.charAt(0)}
              </span>
              {label}
            </span>
          ),
        }
      : {}),
    onBeforeInsert: (e) => {
      log.before++;
      if (params.has('veto') && e.item.value === 'bob') e.preventDefault();
    },
  };
  const field =
    params.get('field') === 'input' ? (
      <input id="field" aria-label="Title" style={{ inlineSize: 400 }} />
    ) : params.get('field') === 'salmon' ? (
      params.has('controlled') ? (
        <TextArea
          id="field"
          label="Comment"
          rows={6}
          value={value}
          onValueChange={(next) => {
            log.value = next;
            setValue(next);
          }}
        />
      ) : (
        <TextArea id="field" label="Comment" rows={6} />
      )
    ) : params.has('controlled') ? (
      <textarea
        id="field"
        aria-label="Comment"
        rows={6}
        cols={50}
        value={value}
        onChange={(e) => {
          log.value = e.target.value;
          setValue(e.target.value);
        }}
      />
    ) : (
      <textarea id="field" aria-label="Comment" rows={6} cols={50} />
    );
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24 }}>
        <h1>Mention</h1>
        {params.has('target') ? (
          <>
            <textarea id="field" ref={ref} aria-label="Comment" rows={6} cols={50} />
            {mounted ? <Mention<Person> {...props} target={ref} /> : null}
          </>
        ) : (
          <Mention<Person> {...props}>{field}</Mention>
        )}
        <button type="button" id="after">
          After
        </button>
        {events.length > 0 ? <ol id="events">{events.map((entry, i) => <li key={events.length - i}>{entry}</li>)}</ol> : null}
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (params.has('hydrate')) {
  root.innerHTML = renderToString(<Page />);
  hydrateRoot(root, <Page />, { onRecoverableError: (error) => console.error('recoverable', error) });
  (window as unknown as { __hydrated: boolean }).__hydrated = true;
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
