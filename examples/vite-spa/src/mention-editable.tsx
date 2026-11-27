// Mention on a plain contenteditable target (tests/browser/mention-editable.spec.ts):
// createContentEditableMentionTarget over a
// `role="textbox"` div; people on `@`, tags on `#` (kept, with a space suffix).
//
// window.__mentionEditable records { inserts, html }.
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/dropdowns/mention/styles.css';
import '@salmonui/rich-text/styles.css';
import { Mention, type MentionEditorTarget } from '@salmonui/dropdowns/mention';
import { createContentEditableMentionTarget } from '@salmonui/rich-text';
import { ThemeProvider } from '@salmonui/core/theme';

interface Person {
  readonly value: string;
  readonly label: string;
}

const PEOPLE: readonly Person[] = [
  { value: 'alice', label: 'Alice Smith' },
  { value: 'bob', label: 'Bob Jones' },
  { value: 'dave', label: 'Dave Brown' },
  { value: 'malik', label: 'Malik Ali' },
];
const TAGS: readonly Person[] = [
  { value: 'bug', label: 'bug' },
  { value: 'docs', label: 'docs' },
];

const log = { inserts: [] as { text: string; trigger: string; source: string }[], html: '' };
(window as unknown as { __mentionEditable: typeof log }).__mentionEditable = log;

function App() {
  const ref = useRef<HTMLDivElement | null>(null);
  // The target is created once the element exists and stays stable.
  const [editor, setEditor] = useState<MentionEditorTarget | null>(null);
  useEffect(() => {
    if (ref.current) setEditor(createContentEditableMentionTarget(ref.current));
  }, []);
  return (
    <main data-salmon-a11y-root="" style={{ padding: 24, maxWidth: 560 }}>
      <h1 id="label">Comment</h1>
      <div
        id="editable"
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-labelledby="label"
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => {
          log.html = e.currentTarget.innerHTML;
        }}
        style={{ minHeight: 120, padding: 8, border: '1px solid var(--salmon-border-default, #888)', borderRadius: 6 }}
      />
      <Mention<Person>
        editor={editor}
        data={PEOPLE}
        triggers={[{ char: '@' }, { char: '#', data: TAGS, keepChar: true, suffix: ' ' }]}
        onInsert={(e) => log.inserts.push({ text: e.text, trigger: e.trigger, source: e.source })}
      />
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
