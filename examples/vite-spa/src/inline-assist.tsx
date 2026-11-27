// InlineAssist browser page (tests/browser/inline-assist*.spec.ts):
//
//   ?mode=inline          inline mode (rendered below the editor)
//   ?anchor=point         anchored at a viewport point (default: the selection range, else the editor)
//   ?promise              the adapter returns a Promise (one final response)
//   ?veto                 onBeforeSend cancels prompts containing "veto"
//   ?keep                 onResponseActionClick cancels the built-in Discard
//   ?custom               a custom "Shorter" response action
//   ?toolbar=inline|bottom  a toolbar slot with a "Tone" button
//   ?composer             renderComposer: a custom single-line <input>
//   ?markdown             renderContent: a tiny app renderer (**bold**), no HTML strings
//   ?dictation            InlineAssist.Dictation with a fake recognizer (window.__speech)
//   ?controlled           value and messages owned by the page
//   ?dir=rtl  ?scheme=dark
//   ?hydrate              server-renders the page with react-dom/server, then hydrates it
//
// The fake adapter streams the reply word by word every 15 ms ("slow" in the
// prompt: 150 ms; "fail": throws after one word). window.__ia records events;
// window.__iaApi is the InlineAssistApi.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/chat/inline-assist/styles.css';
import { InlineAssist, type InlineAssistAdapter, type InlineAssistAnchor, type InlineAssistApi, type InlineAssistMessage } from '@salmonui/chat/inline-assist';
import type { SpeechRecognizer } from '@salmonui/inputs/speech-to-text';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);

interface Log {
  open: string[];
  sends: { prompt: string; command?: string; selection: string; history: number }[];
  accepts: string[];
  discards: string[];
  actions: string[];
  commands: string[];
  messages: { reason: string; items: InlineAssistMessage[] }[];
  values: string[];
  errors: string[];
  aborted: number;
  renders: number;
}

const log: Log = { open: [], sends: [], accepts: [], discards: [], actions: [], commands: [], messages: [], values: [], errors: [], aborted: 0, renders: 0 };
(window as unknown as { __ia: Log }).__ia = log;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

const reply = (prompt: string, selection: string): string => `Reply to "${prompt}" about "${selection || 'nothing'}".\nSecond line of the reply.`;

const streaming: InlineAssistAdapter = async function* (request, { signal }) {
  signal.addEventListener('abort', () => log.aborted++, { once: true });
  const delay = request.prompt.includes('slow') ? 150 : 15;
  const words = reply(request.prompt, request.selection).split(/(?<= )/u);
  for (const [index, word] of words.entries()) {
    await wait(delay, signal);
    if (signal.aborted) return;
    if (index === 1 && request.prompt.includes('fail')) throw new Error('adapter failed');
    yield word;
  }
};
const promised: InlineAssistAdapter = (request) => new Promise((resolve) => setTimeout(() => resolve(reply(request.prompt, request.selection)), 30));

const COMMANDS = [
  { id: 'summarize', label: 'Summarize', prompt: 'Summarize the selection', keywords: ['shorter'] },
  { id: 'translate', label: 'Translate to French' },
  { id: 'formal', label: 'Make it formal' },
  { id: 'grammar', label: 'Fix grammar', disabled: true },
];

// A fake recognizer driven by window.__speech (no microphone).
class FakeRecognizer implements SpeechRecognizer {
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: SpeechRecognizer['onstart'] = null;
  onresult: SpeechRecognizer['onresult'] = null;
  onerror: SpeechRecognizer['onerror'] = null;
  onend: SpeechRecognizer['onend'] = null;
  start(): void {
    speech.last = this;
    queueMicrotask(() => this.onstart?.({}));
  }
  stop(): void {
    queueMicrotask(() => this.onend?.({}));
  }
  abort(): void {
    queueMicrotask(() => this.onend?.({}));
  }
}
const speech = {
  last: null as FakeRecognizer | null,
  emit(text: string, isFinal: boolean) {
    const list = [{ isFinal, length: 1, 0: { transcript: text } }];
    speech.last?.onresult?.({ results: Object.assign(list, { length: 1 }) });
  },
};
(window as unknown as { __speech: typeof speech }).__speech = speech;

/** `**bold**` to <strong> with React elements (the app's renderer; never HTML strings). */
function renderMarkdown(text: string, streaming: boolean): ReactNode {
  return (
    <div className="md" data-streaming={streaming ? '' : undefined}>
      {text.split(/(\*\*[^*]+\*\*)/u).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}
    </div>
  );
}

function Page() {
  log.renders++;
  const editorRef = useRef<HTMLDivElement | null>(null);
  const api = useRef<InlineAssistApi | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<InlineAssistAnchor | null>(null);
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState<readonly InlineAssistMessage[]>([]);
  const controlled = params.has('controlled');
  const toolbar = params.get('toolbar');
  const openAssist = (): void => {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 && !selection.isCollapsed && editorRef.current?.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    setAnchor(params.get('anchor') === 'point' ? { x: 200, y: 300 } : (range ?? editorRef.current));
    setOpen(true);
  };
  const assist = (
    <InlineAssist
      ref={(handle) => {
        api.current = handle;
        (window as unknown as { __iaApi: InlineAssistApi | null }).__iaApi = handle;
      }}
      anchor={anchor}
      open={open}
      onOpenChange={(next, event) => {
        log.open.push(`${next}:${event.reason}`);
        setOpen(next);
      }}
      mode={params.get('mode') === 'inline' ? 'inline' : 'popover'}
      adapter={params.has('promise') ? promised : streaming}
      commands={COMMANDS}
      onCommandSelect={(e) => log.commands.push(e.command.id)}
      placeholder="Ask AI to edit or write"
      {...(controlled
        ? {
            value,
            onValueChange: (v: string) => {
              log.values.push(v);
              setValue(v);
            },
            messages,
          }
        : { onValueChange: (v: string) => log.values.push(v) })}
      onMessagesChange={(next, event) => {
        log.messages.push({ reason: event.reason, items: [...next] });
        if (controlled) setMessages(next);
      }}
      onBeforeSend={(e) => {
        if (params.has('veto') && e.request.prompt.includes('veto')) e.preventDefault();
      }}
      onSend={(e) => log.sends.push({ prompt: e.request.prompt, ...(e.request.command ? { command: e.request.command.id } : {}), selection: e.request.selection, history: e.request.messages.length })}
      onError={(error) => log.errors.push(String((error as Error).message))}
      responseActions={params.has('custom') ? ['accept', 'discard', 'retry', { id: 'shorter', label: 'Shorter' }] : undefined}
      onResponseActionClick={(e) => {
        log.actions.push(e.action);
        if (params.has('keep') && e.action === 'discard') e.preventDefault();
      }}
      onAccept={(e) => {
        log.accepts.push(e.text);
        const editor = editorRef.current;
        if (editor) editor.append(document.createTextNode(` ${e.text.split('\n')[0]}`));
      }}
      onDiscard={(e) => log.discards.push(e.message.id)}
      toolbar={
        toolbar ? (
          <button type="button" id="tone">
            Tone
          </button>
        ) : undefined
      }
      toolbarPlacement={toolbar === 'bottom' ? 'bottom' : 'inline'}
      renderComposer={params.has('composer') ? ({ inputProps }) => <input {...(inputProps as object)} className="custom-composer" /> : undefined}
      renderContent={params.has('markdown') ? (text, { streaming: s }) => renderMarkdown(text, s) : undefined}
    >
      {params.has('dictation') ? <InlineAssist.Dictation recognizer={() => new FakeRecognizer()} interimResults /> : null}
    </InlineAssist>
  );
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 16, maxInlineSize: 720 }}>
        <h1>Inline assist</h1>
        <button type="button" id="ask" onClick={openAssist}>
          Ask AI
        </button>
        <div id="editor" ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-label="Editor" aria-multiline="true" tabIndex={0} style={{ border: '1px solid #999', padding: 8, minBlockSize: 80, marginBlock: 8 }}>
          The quick brown fox jumps over the lazy dog.
        </div>
        {params.get('mode') === 'inline' ? assist : null}
        <button type="button" id="after">
          After
        </button>
        {params.get('mode') === 'inline' ? null : assist}
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
