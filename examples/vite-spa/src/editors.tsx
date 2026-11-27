// Editors browser page (tests/browser/inline-edit*.spec.ts, markdown-editor*.spec.ts).
//
// InlineEdit (default, `?c=inline`):
//   ?mode=inline|popover  ?trigger=click|doubleClick|editButton  ?blur=save|cancel|keep
//   ?delay=<ms>  ?fail (save rejects)  ?veto (onBeforeSave vetoes "veto")  ?controlled  ?many=<n>
//   ?enter=0  ?actions=0  ?disabled  ?placement=<placement> (popoverProps, offset 12)
// MarkdownEditor (`?c=md`):
//   ?preview=off|tab|split  ?overflow=menu|wrap|scroll  ?width=<px>  ?nonative (execCommand unsupported)
//   ?max=<n>  ?count  ?tab  ?readonly  ?upload  ?big (100 KB document)
// Both: ?dir=rtl  ?scheme=dark  ?hydrate
//
// window.__editors records { events: string[], value, saves, aborted }.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/editors/inline-edit/styles.css';
import '@salmonui/editors/markdown-editor/styles.css';
import { InlineEdit, type InlineEditApi } from '@salmonui/editors/inline-edit';
import { MarkdownEditor, type MarkdownEditorApi } from '@salmonui/editors/markdown-editor';
import { ThemeProvider } from '@salmonui/core/theme';

const log = { events: [] as string[], value: '' as unknown, saves: 0, aborted: 0, uploads: 0 };
(window as unknown as { __editors: typeof log }).__editors = log;
const params = new URLSearchParams(location.search);
const flag = (name: string): boolean => params.has(name);

if (flag('nonative')) {
  // An engine without execCommand('insertText'): commands use the internal history.
  Document.prototype.execCommand = () => false;
}

declare global {
  interface Window {
    __inline?: InlineEditApi | null;
    __md?: MarkdownEditorApi | null;
  }
}

function InlinePage(): ReactNode {
  const [title, setTitle] = useState('Quarterly report');
  const [editing, setEditing] = useState(false);
  const delay = Number(params.get('delay') ?? 0);
  const many = Number(params.get('many') ?? 0);
  if (many) {
    return (
      <div id="many">
        {Array.from({ length: many }, (_, i) => (
          <InlineEdit key={i} defaultValue={`Item ${i}`} label={`Item ${i}`} />
        ))}
      </div>
    );
  }
  return (
    <form id="form" onSubmit={(e) => e.preventDefault()}>
      <p>
        <span id="title-label">Title</span>{' '}
        <InlineEdit
          ref={(api) => {
            window.__inline = api;
          }}
          className="demo-inline"
          label="Title"
          name="title"
          defaultValue={flag('controlled') ? undefined : 'Quarterly report'}
          value={flag('controlled') ? title : undefined}
          editing={flag('controlled') ? editing : undefined}
          onEditingChange={(next, e) => {
            log.events.push(`editing:${next}:${e.reason}:${e.source}`);
            setEditing(next);
          }}
          mode={(params.get('mode') as 'inline' | 'popover' | null) ?? undefined}
          trigger={(params.get('trigger') as 'click' | 'doubleClick' | 'editButton' | null) ?? undefined}
          blurAction={(params.get('blur') as 'save' | 'cancel' | 'keep' | null) ?? undefined}
          saveOnEnter={params.get('enter') !== '0'}
          showActions={params.get('actions') !== '0'}
          disabled={flag('disabled')}
          popoverProps={params.has('placement') ? { placement: params.get('placement') as 'top-start', offset: 12 } : undefined}
          placeholder="Untitled"
          validation={{ required: true, maxLength: [20, 'At most 20 characters'] }}
          save={(value, { signal }) =>
            new Promise<void>((resolve, reject) => {
              log.saves++;
              signal.addEventListener('abort', () => {
                log.aborted++;
                reject(new Error('aborted'));
              });
              setTimeout(() => (flag('fail') ? reject(new Error('offline')) : resolve()), delay);
              if (flag('controlled')) void Promise.resolve().then(() => setTitle(value));
            })
          }
          onBeforeEditStart={(e) => log.events.push(`beforeStart:${e.source}`)}
          onEditStart={(e) => log.events.push(`start:${e.source}`)}
          onBeforeSave={(e) => {
            log.events.push(`beforeSave:${e.value}:${e.trigger}`);
            if (flag('veto') && e.value === 'veto') e.preventDefault();
          }}
          onSave={(e) => {
            log.value = e.value;
            log.events.push(`save:${e.value}:${e.previousValue}:${e.trigger}:${e.source}`);
          }}
          onSaveError={(e) => log.events.push(`saveError:${String((e.error as Error).message)}`)}
          onBeforeEditCancel={(e) => log.events.push(`beforeCancel:${e.trigger}`)}
          onEditCancel={(e) => log.events.push(`cancel:${e.value}:${e.trigger}`)}
          onDraftChange={(e) => log.events.push(`draft:${e.value}`)}
        />
      </p>
      <p>
        <span>Quantity</span>{' '}
        <InlineEdit<number>
          className="demo-number"
          label="Quantity"
          mode="inline"
          defaultValue={3}
          validation={{ range: [1, 10] }}
          renderPreview={({ value }) => `${value} pcs`}
        >
          {({ value, setValue, inputProps }) => <input {...inputProps} type="number" value={String(value)} onChange={(e) => setValue(e.target.valueAsNumber)} />}
        </InlineEdit>
      </p>
      <p>
        <span>Notes</span>{' '}
        <InlineEdit className="demo-notes" label="Notes" mode="inline" defaultValue="Line one">
          {({ inputProps }) => <textarea {...inputProps} rows={3} />}
        </InlineEdit>
      </p>
      <button type="button" id="after">
        After
      </button>
    </form>
  );
}

const BIG = '# Big document\n\n' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n'.repeat(1800);

function MarkdownPage(): ReactNode {
  const ref = useRef<MarkdownEditorApi | null>(null);
  const [value, setValue] = useState(flag('big') ? BIG : 'Hello **world**');
  const width = params.get('width');
  return (
    <form id="form" onSubmit={(e) => e.preventDefault()} style={{ inlineSize: width ? Number(width) : 720 }}>
      <label htmlFor="md">Body</label>
      <MarkdownEditor
        id="md"
        ref={(api) => {
          ref.current = api;
          window.__md = api;
        }}
        className="demo-md"
        name="body"
        value={value}
        onValueChange={(next, e) => {
          log.value = next;
          log.events.push(`change:${e.reason}`);
          setValue(next);
        }}
        defaultPreview={(params.get('preview') as 'off' | 'tab' | 'split' | null) ?? 'off'}
        onPreviewChange={(mode) => log.events.push(`preview:${mode}`)}
        onFullscreenChange={(on) => log.events.push(`fullscreen:${on}`)}
        renderPreview={(md) => <pre className="demo-preview">{md}</pre>}
        toolbarOverflow={(params.get('overflow') as 'menu' | 'wrap' | 'scroll' | null) ?? 'menu'}
        toolbar={[
          'bold',
          'italic',
          'strikethrough',
          '|',
          'heading',
          'blockquote',
          'code',
          'codeBlock',
          'orderedList',
          'unorderedList',
          '|',
          'link',
          'image',
          'table',
          '|',
          'undo',
          'redo',
          'preview',
          'fullscreen',
          { id: 'stamp', label: 'Insert stamp', icon: <span aria-hidden="true">✓</span>, onSelect: (api) => api.insertText('[stamp]') },
        ]}
        maxLength={params.has('max') ? Number(params.get('max')) : undefined}
        showCount={flag('count')}
        tabIndents={flag('tab')}
        readOnly={flag('readonly')}
        onUpload={
          flag('upload')
            ? async (file) => {
                log.uploads++;
                await new Promise((r) => setTimeout(r, 30));
                return { src: `https://cdn.example/${file.name}` };
              }
            : undefined
        }
        onBeforeCommand={(e) => {
          log.events.push(`before:${e.id}:${e.source}`);
          if (e.id === 'strikethrough' && flag('vetoStrike')) e.preventDefault();
        }}
        onCommand={(e) => log.events.push(`command:${e.id}:${e.source}`)}
        rows={8}
      />
      <button type="reset" id="reset">
        Reset
      </button>
      <button type="button" id="after">
        After
      </button>
    </form>
  );
}

function Page(): ReactNode {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24, minBlockSize: '100vh', background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
        <h1>Editors</h1>
        {params.get('c') === 'md' ? <MarkdownPage /> : <InlinePage />}
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (flag('hydrate')) {
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
