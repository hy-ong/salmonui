// InlineEdit with RichTextEditor as its editor (tests/browser/rich-text-inline-edit.spec.ts):
// the preview renders the stored HTML with RichTextContent,
// the editor is a RichTextEditor bound to the InlineEdit draft.
//
// window.__inlineRte records { saves }.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/editors/inline-edit/styles.css';
import '@salmonui/rich-text/styles.css';
import { InlineEdit } from '@salmonui/editors/inline-edit';
import { ThemeProvider } from '@salmonui/core/theme';
import { RichTextContent, RichTextEditor } from '@salmonui/rich-text';

const log = { saves: [] as string[] };
(window as unknown as { __inlineRte: typeof log }).__inlineRte = log;

const params = new URLSearchParams(location.search);

function App() {
  const [value, setValue] = useState('<p>Release <strong>notes</strong></p><script>alert(1)</script>');
  return (
    <main data-salmon-a11y-root="" style={{ padding: 24, maxWidth: 640 }}>
      <InlineEdit<string>
        label="Description"
        value={value}
        mode={params.get('mode') === 'inline' ? 'inline' : 'popover'}
        saveOnEnter={false}
        blurAction="keep"
        save={(next) => {
          log.saves.push(next);
          setValue(next);
        }}
        renderPreview={({ value: html }) => <RichTextContent value={html} />}
      >
        {({ value: draft, setValue: setDraft }) => (
          <RichTextEditor aria-label="Description" defaultValue={draft} onChange={setDraft} toolbar={['bold', 'italic', 'link']} style={{ minInlineSize: 420 }} />
        )}
      </InlineEdit>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
