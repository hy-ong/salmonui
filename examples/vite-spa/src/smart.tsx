// Smart components browser page (tests/browser/smart.spec.ts):
// TextArea `suggest` over a local phrase list, and a
// React-controlled form filled by `useSmartPaste` with a Button.
//
//   ?display=inline|popover|auto   suggestionDisplay (default: the prop is not set, so 'auto')
//   ?delay=<ms>                    suggestDelay (default 50)
//   ?slow                          suggest answers after 300 ms (honouring the signal)
//   ?veto                          onBeforeSuggestionShow cancels suggestions containing "regards"
//   ?controlled                    the TextArea value is React state
//   ?pasteDelay=<ms>               the smart paste adapter answers after this delay (default 0)
//   ?hydrate                       server-renders the page with react-dom/server, then hydrates it
//
// window.__smart records events; window.__paste(text?) runs a paste and stores the result.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/chat/text-suggest/styles.css';
import '@salmonui/inputs/text-field/styles.css';
import { Button } from '@salmonui/buttons/button';
import { useSmartPaste, type SmartPasteAdapter, type SmartPasteRequest, type SmartPasteResult } from '@salmonui/chat/smart-paste';
import { TextArea } from '@salmonui/inputs/text-field';
import { useTextSuggest, type SuggestFunction } from '@salmonui/chat/text-suggest';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const num = (key: string, fallback: number): number => (params.has(key) ? Number(params.get(key)) : fallback);

const log = {
  requests: [] as string[],
  aborted: 0,
  shown: [] as string[],
  accepted: [] as string[],
  inputs: 0,
  value: '',
  pasteRequests: [] as SmartPasteRequest[],
  pasteAborted: 0,
  results: [] as SmartPasteResult[],
  errors: [] as string[],
  form: {} as Record<string, unknown>,
};
if (typeof window !== 'undefined') (window as unknown as { __smart: typeof log }).__smart = log;

const PHRASES = ['Thank you for your message', 'Kind regards', 'Looking forward to hearing from you'];

/** Local phrase matcher (the recipe): completes the longest phrase prefix the text ends with. */
const suggest: SuggestFunction = async ({ textBeforeCaret }, { signal }) => {
  log.requests.push(textBeforeCaret);
  if (params.has('slow')) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 300);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        log.aborted++;
        reject(signal.reason);
      });
    });
  }
  const before = textBeforeCaret.toLowerCase();
  for (const phrase of PHRASES) {
    for (let k = phrase.length - 1; k > 0; k--) {
      const head = phrase.slice(0, k).toLowerCase();
      const start = before.length - k;
      if (before.endsWith(head) && (start === 0 || /\s/.test(before[start - 1]!))) return phrase.slice(k);
    }
  }
  return null;
};

/** A fake model: reads `key: value` lines and answers in a fenced JSON block, as a chat model would. */
const adapter: SmartPasteAdapter = async (request, { signal }) => {
  log.pasteRequests.push(request);
  const delay = num('pasteDelay', 0);
  if (delay > 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        log.pasteAborted++;
        reject(signal.reason);
      });
    });
  }
  const answer: Record<string, string> = {};
  for (const line of request.clipboardText.split('\n')) {
    const m = /^\s*([\w-]+)\s*:\s*(.+)$/.exec(line);
    if (m) answer[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  return `Here you go:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``;
};

function SuggestSection(): ReactNode {
  const [value, setValue] = useState('');
  const controlled = params.has('controlled');
  const display = params.get('display') as 'inline' | 'popover' | 'auto' | null;
  const suggestion = useTextSuggest({
    suggest,
    ...(display ? { suggestionDisplay: display } : {}),
    suggestDelay: num('delay', 50),
    onBeforeSuggestionShow: (event) => {
      if (params.has('veto') && event.text.includes('regards')) event.preventDefault();
    },
    onSuggestionShow: (event) => log.shown.push(event.text),
    onSuggestionAccept: (event) => log.accepted.push(event.text),
  });
  return (
    <section aria-labelledby="suggest-title" style={{ maxInlineSize: 480 }}>
      <h2 id="suggest-title">TextArea suggest</h2>
      <form id="suggest-form">
        <TextArea
          id="message"
          name="message"
          label="Message"
          rows={4}
          description="Try: Thank, Kind or Looking"
          ref={suggestion.ref}
          {...(controlled ? { value, onValueChange: (next: string) => setValue(next) } : {})}
          onInput={(event) => {
            log.inputs++;
            log.value = event.currentTarget.value;
          }}
        />
        {controlled ? <output id="controlled-value">{value}</output> : null}
      </form>
      <button type="button" id="after-suggest">
        After
      </button>
    </section>
  );
}

function PasteForm(): ReactNode {
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState({ name: '', email: '', notes: '', country: '', plan: 'free', news: false, secret: '' });
  log.form = form;
  const { paste, pending } = useSmartPaste(formRef, adapter);
  const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const run = (text?: string): void => {
    paste(text).then(
      (result) => log.results.push(result),
      (error: unknown) => log.errors.push(error instanceof Error ? error.name : String(error)),
    );
  };
  if (typeof window !== 'undefined') (window as unknown as { __paste: typeof run }).__paste = run;
  return (
    <form ref={formRef} id="paste-form" aria-labelledby="paste-title">
      <h2 id="paste-title">Smart paste</h2>
      <label>
        Full name <input name="name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
      </label>
      <label>
        Email <input name="email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
      </label>
      <TextArea name="notes" label="Notes" description="Anything else the customer said" value={form.notes} onValueChange={(v) => set('notes')(v)} />
      <label>
        Country
        <select name="country" value={form.country} onChange={(e) => set('country')(e.target.value)}>
          <option value="">Choose</option>
          <option value="nl">Netherlands</option>
          <option value="my">Malaysia</option>
        </select>
      </label>
      <fieldset>
        <legend>Plan</legend>
        {['free', 'pro'].map((plan) => (
          <label key={plan}>
            <input type="radio" name="plan" value={plan} checked={form.plan === plan} onChange={() => set('plan')(plan)} /> {plan}
          </label>
        ))}
      </fieldset>
      <label>
        <input type="checkbox" name="news" checked={form.news} onChange={(e) => set('news')(e.target.checked)} /> Newsletter
      </label>
      <label>
        Password <input name="password" type="password" defaultValue="" />
      </label>
      <label data-salmon-paste="off">
        Internal code <input name="secret" value={form.secret} onChange={(e) => set('secret')(e.target.value)} />
      </label>
      <Button id="smart-paste" variant="solid" loading={pending} onClick={() => run()}>
        Smart paste
      </Button>
      <output id="paste-state">{JSON.stringify(form)}</output>
    </form>
  );
}

function Page(): ReactNode {
  const [mounted, setMounted] = useState(true);
  return (
    <ThemeProvider>
      <main data-salmon-a11y-root style={{ display: 'grid', gap: 24, padding: 16 }}>
        <SuggestSection />
        {mounted ? <PasteForm /> : null}
        <button type="button" id="unmount" onClick={() => setMounted((m) => !m)}>
          Toggle paste form
        </button>
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
