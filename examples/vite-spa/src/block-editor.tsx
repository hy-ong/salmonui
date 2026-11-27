// Block Editor browser page (tests/browser/block-editor*.spec.ts):
//
//   ?hydrate        server-renders the page with react-dom/server, then hydrates it
//   ?controlled     controlled `value` mirrored from onChange
//   ?readOnly       ?dir=rtl  ?scheme=dark  ?locale (localeText overrides)
//   ?veto           onBeforeBlockMove cancels moving block "b" and onBeforePaste cancels pastes containing "veto"
//   ?upload         onUpload (100 ms, data URL)
//   ?paste=keep|clean|plainText|prompt
//   ?keys           keyBindings: moveBlockUp on Mod-Alt-ArrowUp, bold removed
//   ?nodrag         draggable={false}
//   ?highlight      highlight hook: const / let / function get the demo-keyword class
//   ?custom         custom slash item, block action, context menu item and inline toolbar item
//
// window.__be records events; window.__beActions is actionsRef.current.
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/rich-text/styles.css';
import { ThemeProvider } from '@salmonui/core/theme';
import { BlockEditor, type Block, type BlockEditorActions, type BlockEditorProps } from '@salmonui/rich-text';

const params = new URLSearchParams(location.search);

const INITIAL: Block[] = [
  { id: 'title', type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Project plan' }] },
  { id: 'a', type: 'paragraph', content: [{ type: 'text', text: 'Alpha paragraph' }] },
  { id: 'b', type: 'paragraph', content: [{ type: 'text', text: 'Beta paragraph' }] },
  {
    id: 'l1',
    type: 'bulletListItem',
    content: [{ type: 'text', text: 'First item' }],
    children: [{ id: 'l1a', type: 'bulletListItem', content: [{ type: 'text', text: 'Nested item' }] }],
  },
  { id: 'l2', type: 'bulletListItem', content: [{ type: 'text', text: 'Second item' }] },
  { id: 'todo', type: 'checklistItem', props: { checked: false }, content: [{ type: 'text', text: 'Review' }] },
  { id: 'code', type: 'code', props: { language: 'ts' }, content: [{ type: 'text', text: 'const x = 1;' }] },
  { id: 'img', type: 'image', props: { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', alt: 'Pixel', caption: 'A pixel', width: 40, height: 40 } },
  { id: 'tbl', type: 'table', props: { headerRow: true, rows: [[[{ type: 'text', text: 'Name' }], [{ type: 'text', text: 'Role' }]], [[{ type: 'text', text: 'Ann' }], [{ type: 'text', text: 'Dev' }]]] } },
  { id: 'end', type: 'paragraph', content: [{ type: 'text', text: 'The end' }] },
];

const log = {
  changes: 0,
  blocks: [] as Block[],
  blockEvents: [] as string[],
  selections: [] as string[],
  focus: 0,
  blur: 0,
  moves: [] as string[],
  vetoed: 0,
  pastes: [] as string[],
  custom: [] as string[],
};
(window as unknown as { __be: typeof log }).__be = log;

const PEOPLE = [
  { value: 'ann', label: 'Ann Lee' },
  { value: 'bob', label: 'Bob Stone' },
];
const LABELS = [
  { value: 'bug', label: 'bug', tone: 'danger' },
  { value: 'docs', label: 'docs', tone: 'info' },
];

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function Page(): ReactNode {
  const actionsRef = useRef<BlockEditorActions | null>(null);
  const [value, setValue] = useState<Block[]>(INITIAL);
  (window as unknown as { __beActions: { current: BlockEditorActions | null } }).__beActions = actionsRef;
  // Mutable while the query string adds options below.
  const props: { -readonly [K in keyof BlockEditorProps]: BlockEditorProps[K] } = {
    'aria-label': 'Project notes',
    className: 'demo-block-editor',
    style: { maxInlineSize: 720 },
    actionsRef,
    readOnly: params.has('readOnly'),
    draggable: !params.has('nodrag'),
    placeholder: 'Type / for blocks',
    mentions: { items: PEOPLE },
    labels: { items: LABELS },
    codeLanguages: [
      { value: 'ts', label: 'TypeScript' },
      { value: 'css', label: 'CSS' },
    ],
    onChange: (blocks) => {
      log.changes++;
      log.blocks = blocks;
      if (params.has('controlled')) setValue(blocks);
    },
    onBlockChange: (e) => log.blockEvents.push(`${e.type}:${e.block.id}`),
    onSelectionChange: (s) => log.selections.push(s ? `${s.blockId}:${s.offset}` : 'null'),
    onFocus: () => log.focus++,
    onBlur: () => log.blur++,
    onBeforeBlockMove: (e) => {
      if (params.has('veto') && e.block.id === 'b') {
        log.vetoed++;
        e.preventDefault();
      }
    },
    onBlockMove: (e) => log.moves.push(`${e.block.id}:${e.source}:${JSON.stringify(e.position)}`),
    onBeforePaste: (e) => {
      if (params.has('veto') && e.text.includes('veto')) e.preventDefault();
    },
    onPaste: (e) => log.pastes.push(e.text),
  };
  if (params.has('upload')) props.onUpload = (file) => new Promise((resolve) => setTimeout(() => void dataUrl(file).then((src) => resolve({ src, alt: 'Uploaded' })), 100));
  const paste = params.get('paste');
  if (paste === 'keep' || paste === 'clean' || paste === 'plainText' || paste === 'prompt') props.pasteCleanup = { mode: paste };
  if (params.has('highlight')) props.highlight = (code) => [...code.matchAll(/\b(const|let|function)\b/g)].map((m) => ({ from: m.index, to: m.index + m[0].length, className: 'demo-keyword' }));
  if (params.has('keys')) props.keyBindings = { moveBlockUp: 'Mod-Alt-ArrowUp', bold: false };
  if (params.has('locale')) props.localeText = { slashMenu: 'Bl\u00f6cke', duplicate: 'Duplizieren' };
  if (params.has('custom')) {
    const custom = (where: string) => ({ id: `hello-${where}`, label: `Hello ${where}`, keywords: ['hello'], onSelect: ({ block }: { block: Block | null }) => log.custom.push(`${where}:${block?.id ?? '-'}`) });
    props.slashMenu = ['paragraph', 'heading1', 'bulletList', 'divider', 'table', custom('slash')];
    props.blockActions = ['duplicate', 'delete', 'moveUp', 'moveDown', 'turnInto', custom('action')];
    props.contextMenu = ['copy', 'duplicate', custom('context')];
    props.inlineToolbar = ['bold', 'italic', custom('toolbar')];
  }
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24 }} data-salmon-a11y-root="">
        <h1 id="heading">Block Editor</h1>
        <button type="button" id="before">
          Before
        </button>
        {params.has('controlled') ? <BlockEditor {...props} value={value} /> : <BlockEditor {...props} defaultValue={INITIAL} />}
        <button type="button" id="after">
          After
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
