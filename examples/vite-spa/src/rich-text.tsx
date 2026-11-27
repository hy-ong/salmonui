// Rich Text Editor browser page (tests/browser/rich-text*.spec.ts):
//
//   ?hydrate              server-renders the page with react-dom/server, then hydrates it
//   ?controlled           controlled `value` (the page mirrors onChange into state)
//   ?value=<html>         initial value      ?empty   start empty
//   ?toolbar=floating|none|custom   ?overflow=menu|scroll|wrap   ?position=bottom   ?sticky
//   ?count  ?max=<n>      showCount / maxLength
//   ?readOnly ?disabled ?placeholder=<text>
//   ?upload[=fail]        onUpload (150 ms, data URL)   ?base64   imageInsert="base64"
//   ?paste=keep|clean|plainText|prompt
//   ?slash ?mentions ?ai ?import ?browse ?emoji
//   ?enter=br ?shiftEnter=p ?tab=indent ?undoLimit=<n> ?changeDelay=<ms>
//   ?veto                 onBeforeCommand cancels "bold"; onBeforePopupOpen cancels the table quick toolbar
//   ?extension            a custom extension (mark, command, key binding, async plugin, toolbar item)
//   ?form                 inside a <form> with name, required and a reset button
//   ?quick=custom         quickToolbars: text on a fixed toolbar, custom video items, link hidden
//   ?field                inside a Salmon Field (label, description, required rule) in a <form>
//   ?embed                embedHosts: ['www.youtube-nocookie.com']   ?highlight   ?code
//   ?dir=rtl ?scheme=dark ?narrow ?resizable ?print
//   ?keys                 keyBindings: Mod-b removed, Mod-Shift-x strikethrough, Mod-Alt-p a function
//   ?locale               localeText overrides
//
// window.__rte records events; window.__rteActions is actionsRef.current.
import { StrictMode, useRef, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/rich-text/styles.css';
import { ThemeProvider } from '@salmonui/core/theme';
import { Field } from '@salmonui/inputs/form';
import '@salmonui/inputs/form/styles.css';
import { RichTextEditor, type RichTextEditorActions, type RichTextEditorProps, type RichTextExtension, type RichTextToolbarItem } from '@salmonui/rich-text';

const params = new URLSearchParams(location.search);
const has = (key: string) => params.has(key);

const log = {
  changes: [] as string[],
  blurs: [] as string[],
  commands: [] as { command: string; applied: boolean }[],
  before: [] as string[],
  toolbar: [] as string[],
  dialogs: [] as string[],
  closed: [] as string[],
  popups: [] as string[],
  states: 0,
  ready: false,
  uploads: [] as string[],
  fullscreen: [] as boolean[],
  ai: [] as { prompt: string; selectionHtml: string }[],
  browse: [] as string[],
  imports: [] as string[],
  extension: [] as string[],
  uploadErrors: 0,
};
(window as unknown as { __rte: typeof log }).__rte = log;

const INITIAL =
  '<h2>Release notes</h2><p>Hello <strong>world</strong>, this is <a href="https://example.com">a link</a>.</p><p>Second paragraph with some text.</p><script>window.__xss = 1</script><p><img src="x" onerror="window.__xss = 2" alt="bad"></p>';

const PEOPLE = [
  { value: 'alice', label: 'Alice Smith' },
  { value: 'bob', label: 'Bob Jones' },
  { value: 'carol', label: 'Carol White' },
];

const toDataUrl = (file: File) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

const highlightExtension: RichTextExtension = {
  name: 'demo-highlight',
  marks: {
    demoMark: {
      parseDOM: [{ tag: 'mark[data-demo]' }],
      toDOM: () => ['mark', { 'data-demo': '' }, 0],
    },
  },
  commands: {
    insertSignature: () => (state, dispatch) => {
      dispatch?.(state.tr.insertText('-- Signed'));
      return true;
    },
  },
  keyBindings: { 'Mod-Alt-s': 'insertSignature' },
  plugins: async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const { Plugin } = await import('prosemirror-state');
    return [
      new Plugin({
        view: () => {
          log.extension.push('plugin-view');
          return {};
        },
      }),
    ];
  },
  toolbarItems: [{ id: 'signature', label: 'Signature', command: 'insertSignature' }],
};

function toolbarItems(): NonNullable<RichTextEditorProps['toolbar']> {
  const kind = params.get('toolbar');
  if (kind === 'floating') return 'floating';
  if (kind === 'none') return false;
  const base: RichTextToolbarItem[] = [
    'undo', 'redo', '|', 'formats', 'bold', 'italic', 'underline', 'strikethrough', 'superscript', 'subscript', 'inlineCode', '|',
    'fontColor', 'alignments', 'orderedList', 'unorderedList', 'checklist', 'indent', 'outdent', '|',
    'link', 'image', 'audio', 'video', 'embed', 'table', 'codeBlock', 'blockquote', 'horizontalRule', 'clearFormat', '|',
    'findReplace', 'formatPainter', 'emoji', 'sourceCode', 'fullscreen', 'print',
  ];
  if (has('import')) base.push('import');
  if (has('ai')) base.push('aiAssistant');
  if (has('extension')) base.push('signature');
  if (kind === 'custom') base.push({ id: 'shout', label: 'Shout', command: 'uppercase' }, { id: 'italic', disabled: true });
  return base;
}

function Editor(props: { actions: React.RefObject<RichTextEditorActions | null> }) {
  const initial = params.get('value') ?? (has('empty') ? '' : INITIAL);
  const [value, setValue] = useState(initial);
  const max = params.get('max');
  const editorProps: RichTextEditorProps = {
    ...(has('controlled') ? { value } : { defaultValue: initial }),
    onChange: (html) => {
      log.changes.push(html);
      if (has('controlled')) setValue(html);
    },
    onBlur: (html) => log.blurs.push(html),
    toolbar: toolbarItems(),
    // The wide page wraps so every item is reachable; ?narrow keeps the default overflow menu.
    ...(params.get('overflow') ? { toolbarOverflow: params.get('overflow') as 'menu' } : has('narrow') ? {} : { toolbarOverflow: 'wrap' as const }),
    ...(params.get('quick') === 'custom' ? { quickToolbars: { text: ['bold', 'italic'], video: ['alignments', 'removeNode'], link: false } } : {}),
    ...(params.get('position') ? { toolbarPosition: params.get('position') as 'bottom' } : {}),
    stickyToolbar: has('sticky'),
    showCount: has('count'),
    ...(max ? { maxLength: Number(max) } : {}),
    readOnly: has('readOnly'),
    disabled: has('disabled'),
    ...(params.get('placeholder') ? { placeholder: params.get('placeholder')! } : {}),
    ...(has('upload')
      ? {
          onUpload: async (file: File) => {
            log.uploads.push(file.name);
            await new Promise((resolve) => setTimeout(resolve, 150));
            if (params.get('upload') === 'fail') throw new Error('upload failed');
            // Images as data URLs; audio and video as object URLs (the sanitizer allows blob: for media).
            return file.type.startsWith('image/') ? { src: await toDataUrl(file), alt: `uploaded ${file.name}` } : { src: URL.createObjectURL(file) };
          },
        }
      : {}),
    onUploadError: () => void log.uploadErrors++,
    ...(has('base64') ? { imageInsert: 'base64' as const } : {}),
    ...(params.get('paste') ? { pasteCleanup: { mode: params.get('paste') as 'keep' } } : {}),
    slashMenu: has('slash'),
    ...(has('mentions') ? { mentions: { items: PEOPLE } } : {}),
    ...(has('ai')
      ? {
          aiAssistant: {
            onRequest: (request) => {
              log.ai.push({ prompt: request.prompt, selectionHtml: request.selectionHtml });
              return (async function* () {
                for (const chunk of ['Generated ', '<b>text</b> ', 'for ', request.prompt]) {
                  await new Promise((resolve) => setTimeout(resolve, 30));
                  yield chunk;
                }
              })();
            },
          },
        }
      : {}),
    ...(has('import')
      ? {
          onImport: async (file: File) => {
            log.imports.push(file.name);
            return `<p>Imported <em>${(await file.text()).replace(/[<>&]/g, '')}</em></p><script>window.__xss = 3</script>`;
          },
        }
      : {}),
    ...(has('browse')
      ? {
          onBrowseFiles: async (kind: 'image' | 'audio' | 'video') => {
            log.browse.push(kind);
            return { src: 'https://example.com/picked.png', alt: 'Picked image' };
          },
        }
      : {}),
    ...(has('emoji') ? { emojiList: [{ emoji: '😀', name: 'grinning', keywords: ['smile'] }, { emoji: '🎉', name: 'tada', keywords: ['party'] }, { emoji: '🚀', name: 'rocket' }] } : {}),
    ...(params.get('enter') ? { enterKey: params.get('enter') as 'br' } : {}),
    ...(params.get('shiftEnter') ? { shiftEnterKey: params.get('shiftEnter') as 'p' } : {}),
    ...(params.get('tab') ? { tabKey: params.get('tab') as 'indent' } : {}),
    ...(params.get('undoLimit') ? { undoLimit: Number(params.get('undoLimit')) } : {}),
    ...(params.get('changeDelay') ? { changeDelay: Number(params.get('changeDelay')) } : {}),
    ...(has('extension') ? { extensions: [highlightExtension] } : {}),
    ...(has('embed') ? { embedHosts: ['www.youtube-nocookie.com'] } : {}),
    ...(has('code') || has('highlight') ? { codeLanguages: ['javascript', 'css', { value: 'html', label: 'HTML' }] } : {}),
    ...(has('highlight')
      ? {
          highlight: (code: string) => [...code.matchAll(/\b(const|let|function)\b/g)].map((m) => ({ from: m.index, to: m.index + m[0].length, className: 'demo-keyword' })),
        }
      : {}),
    resizable: has('resizable'),
    ...(has('keys') ? { keyBindings: { 'Mod-b': false, 'Mod-Shift-x': 'strikethrough', 'Mod-Alt-p': () => (props.actions.current?.commands.insertText('!'), true) } } : {}),
    ...(has('locale') ? { localeText: { bold: 'Gras', toolbar: 'Mise en forme', content: 'Éditeur' } } : {}),
    onBeforeCommand: (event) => {
      log.before.push(event.command);
      if (has('veto') && event.command === 'bold') event.preventDefault();
    },
    onCommand: (event) => log.commands.push({ command: event.command, applied: event.applied }),
    onToolbarItemClick: (event) => log.toolbar.push(event.id),
    onBeforeDialogOpen: (event) => log.dialogs.push(event.dialog),
    onDialogClose: (event) => log.closed.push(event.dialog),
    onBeforePopupOpen: (event) => {
      log.popups.push(event.popup);
      if (has('veto') && event.popup === 'table') event.preventDefault();
    },
    onToolbarStateChange: () => void log.states++,
    onFullscreenChange: (next) => log.fullscreen.push(next),
    onReady: () => {
      log.ready = true;
    },
    actionsRef: props.actions,
    'aria-label': 'Article body',
    className: 'demo-editor',
    style: has('narrow') ? { inlineSize: 360 } : { maxInlineSize: 900 },
  };
  if (has('field')) {
    const { 'aria-label': _label, ...fieldEditorProps } = editorProps;
    return (
      <form
        id="form"
        onSubmit={(event) => {
          event.preventDefault();
          (window as unknown as { __submitted: string }).__submitted = String(new FormData(event.currentTarget).get('body'));
        }}
      >
        <Field label="Article body" description="Shown on the front page" name="body" validation={{ required: true }} value={value}>
          {() => (
            <RichTextEditor
              {...fieldEditorProps}
              onChange={(html) => {
                log.changes.push(html);
                setValue(html);
              }}
              name="body"
              required
            />
          )}
        </Field>
        <button type="submit">Submit</button>
      </form>
    );
  }
  if (has('form')) {
    return (
      <form
        id="form"
        onSubmit={(event) => {
          event.preventDefault();
          (window as unknown as { __submitted: string }).__submitted = String(new FormData(event.currentTarget).get('body'));
        }}
      >
        <RichTextEditor {...editorProps} name="body" required={has('required')} invalid={has('invalid')} />
        <button type="submit">Submit</button>
        <button type="reset">Reset</button>
      </form>
    );
  }
  return <RichTextEditor {...editorProps} />;
}

function Page() {
  const actions = useRef<RichTextEditorActions | null>(null);
  (window as unknown as { __rteRef: typeof actions }).__rteRef = actions;
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : undefined} data-salmon-a11y-root="" style={{ padding: 16 }}>
        <h1 style={{ fontSize: 18 }}>Rich Text Editor</h1>
        <Editor actions={actions} />
        <p>
          <button type="button" id="outside">
            Outside
          </button>
        </p>
      </main>
    </ThemeProvider>
  );
}

Object.defineProperty(window, '__rteActions', { get: () => (window as unknown as { __rteRef: { current: unknown } }).__rteRef?.current ?? null });

const root = document.getElementById('root')!;
if (has('hydrate')) {
  root.innerHTML = renderToString(<Page />);
  (window as unknown as { __serverHtml: string }).__serverHtml = root.innerHTML;
  hydrateRoot(root, <Page />, { onRecoverableError: (error) => console.error('recoverable', error) });
  (window as unknown as { __hydrated: boolean }).__hydrated = true;
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
