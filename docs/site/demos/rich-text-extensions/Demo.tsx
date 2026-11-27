'use client';

import { useState } from 'react';
import { BlockEditor, loadRichTextEngine, RICH_TEXT_DEFAULT_TOOLBAR, RichTextEditor, type Block, type RichTextExtension } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';
import { Button } from '@salmonui/buttons/button';

/** A new mark: <kbd> for key names, with a command, a key binding, a toolbar item and its HTML allow-list entry. */
const kbd: RichTextExtension = {
  name: 'kbd',
  marks: { kbd: { parseDOM: [{ tag: 'kbd' }], toDOM: () => ['kbd', 0] } },
  commands: {
    toggleKbd: () => (state, dispatch) => {
      const type = state.schema.marks['kbd'];
      const { from, to, empty } = state.selection;
      if (!type || empty) return false;
      if (dispatch) dispatch(state.doc.rangeHasMark(from, to, type) ? state.tr.removeMark(from, to, type) : state.tr.addMark(from, to, type.create()));
      return true;
    },
  },
  keyBindings: { 'Mod-Shift-k': 'toggleKbd' },
  toolbarItems: [{ id: 'kbd', label: 'Keyboard key', command: 'toggleKbd' }],
  html: { tags: ['kbd'] },
};

/** A command-only extension, shared by both editors: insert a review stamp. */
const stamp: RichTextExtension = {
  name: 'stamp',
  commands: {
    insertStamp: () => (state, dispatch) => {
      if (dispatch) dispatch(state.tr.insertText('[reviewed] ').scrollIntoView());
      return true;
    },
  },
  keyBindings: { 'Mod-Shift-y': 'insertStamp' },
  toolbarItems: [{ id: 'stamp', label: 'Review stamp', command: 'insertStamp' }],
};

const RTE_EXTENSIONS = [kbd, stamp];
const BLOCK_EXTENSIONS = [stamp];
const RTE_TOOLBAR = [...RICH_TEXT_DEFAULT_TOOLBAR.slice(0, 12), '|', 'kbd', 'stamp'];

const initialHtml = '<p>Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save. Select a word and press Ctrl+Shift+K (Cmd+Shift+K) to mark it as a key.</p>';
const initialBlocks: Block[] = [{ id: 'b1', type: 'paragraph', content: [{ type: 'text', text: 'The same stamp command runs here: Ctrl+Shift+Y (Cmd+Shift+Y), or select text and use the toolbar.' }] }];

export default function RichTextExtensionsDemo() {
  const [html, setHtml] = useState(initialHtml);
  const [headless, setHeadless] = useState<string | null>(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <section aria-labelledby="ext-rte" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
        <strong id="ext-rte">RichTextEditor with the kbd and stamp extensions</strong>
        <RichTextEditor aria-labelledby="ext-rte" defaultValue={initialHtml} onChange={setHtml} extensions={RTE_EXTENSIONS} toolbar={RTE_TOOLBAR} style={{ minBlockSize: 160 }} />
        <details>
          <summary>HTML value (the kbd elements survive the sanitizer through the extension&apos;s html entry)</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{html}</pre>
        </details>
      </section>
      <section aria-labelledby="ext-block" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
        <strong id="ext-block">BlockEditor with the stamp extension</strong>
        <BlockEditor
          aria-labelledby="ext-block"
          defaultValue={initialBlocks}
          extensions={BLOCK_EXTENSIONS}
          inlineToolbar={['bold', 'italic', 'code', 'link', { id: 'stamp', label: 'Review stamp', onSelect: ({ actions }) => actions.runCommand('insertStamp') }]}
          // A frame, so the editable area reads as one box like the RichTextEditor above.
          style={{ minBlockSize: 120, paddingBlock: 8, paddingInlineEnd: 12, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
        />
      </section>
      <section aria-labelledby="ext-headless" style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
        <strong id="ext-headless">The engine without React</strong>
        <Button variant="outline"
          type="button"
          onClick={async () => {
            const { createEngine } = await loadRichTextEngine();
            const engine = await createEngine({ html: '<p>Escape</p>', extensions: RTE_EXTENSIONS });
            engine.commands.selectAll();
            engine.run('toggleKbd');
            engine.commands.bold();
            setHeadless(`${engine.getHtml()}  (text: "${engine.getText()}")`);
            engine.destroy();
          }}
        >
          createEngine, select all, toggleKbd, bold, getHtml()
        </Button>
        {headless === null ? null : <code>{headless}</code>}
      </section>
    </div>
  );
}
