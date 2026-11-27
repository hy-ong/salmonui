// TagGroup browser page (tests/browser/tag-group.spec.ts).
//
//   ?dir=rtl  ?scheme=dark
//   ?veto            the #removable group ignores onRemove (the removal is cancelled)
//   ?cancelDrag      onTagDragStart calls preventDefault()
//   ?hydrate         server-renders the page, then hydrates it
//
// window.__tags records every callback: { id, type, ...payload }.
import { StrictMode, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/tag-group/styles.css';
import { Tag, TagGroup, moveTags } from '@salmonui/buttons/tag-group';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __tags?: Record<string, unknown>[];
    __formData?: [string, string][];
  }
}

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const veto = params.has('veto');
const cancelDrag = params.has('cancelDrag');
window.__tags = [];
const log = (id: string, type: string, payload: object) => window.__tags?.push({ id, type, ...payload });

function Removable() {
  const [tags, setTags] = useState(['Design', 'Docs', 'Bug', 'Perf', 'Old']);
  return (
    <TagGroup
      id="removable"
      aria-label="Removable labels"
      onRemove={(values, event) => {
        log('removable', 'remove', { values, ...event });
        if (!veto) setTags((t) => t.filter((v) => !values.includes(v)));
      }}
    >
      {tags.map((tag) => (
        <Tag key={tag} value={tag} disabled={tag === 'Old'}>
          {tag}
        </Tag>
      ))}
    </TagGroup>
  );
}

function Selectable() {
  const [tags, setTags] = useState(['Red', 'Green', 'Blue', 'Cyan']);
  const [value, setValue] = useState<readonly string[]>(['Green']);
  return (
    <form
      id="form"
      onSubmit={(event) => {
        event.preventDefault();
        window.__formData = [...new FormData(event.currentTarget).entries()].map(([k, v]) => [k, String(v)]);
      }}
    >
      <TagGroup
        id="selectable"
        aria-label="Colors"
        selectionMode="multiple"
        value={value}
        onValueChange={(next, event) => {
          log('selectable', 'value', { value: next, ...event });
          setValue(next);
        }}
        onRemove={(values) => {
          log('selectable', 'remove', { values });
          setTags((t) => t.filter((v) => !values.includes(v)));
          setValue((v) => v.filter((x) => !values.includes(x)));
        }}
        name="colors"
        tone="primary"
      >
        {tags.map((tag) => (
          <Tag key={tag} value={tag}>
            {tag}
          </Tag>
        ))}
      </TagGroup>
      <TagGroup id="single" aria-label="Size" selectionMode="single" defaultValue={['m']} name="size">
        <Tag value="s">Small</Tag>
        <Tag value="m">Medium</Tag>
        <Tag value="l">Large</Tag>
      </TagGroup>
      <TagGroup id="all" aria-label="Recipients" name="to">
        <Tag value="ann@example.com">Ann</Tag>
        <Tag value="bo@example.com">Bo</Tag>
      </TagGroup>
      <button id="submit" type="submit">
        Submit
      </button>
      <button id="reset" type="reset">
        Reset
      </button>
    </form>
  );
}

function Reorder() {
  const [a, setA] = useState(['One', 'Two', 'Three', 'Four']);
  const [b, setB] = useState(['Alpha', 'Beta']);
  const handlers = (id: string) => ({
    onTagDragStart: (event: { values: readonly string[]; source: string; preventDefault(): void }) => {
      log(id, 'dragstart', { values: event.values, source: event.source });
      if (cancelDrag) event.preventDefault();
    },
    onTagDrag: (event: { values: readonly string[]; toIndex: number | null; overGroup: string | null }) => log(id, 'drag', { values: event.values, toIndex: event.toIndex, overGroup: event.overGroup }),
    onTagDragEnd: (event: { values: readonly string[]; dropped: boolean }) => log(id, 'dragend', { ...event }),
  });
  return (
    <div style={{ display: 'grid', gap: 24, maxInlineSize: 360 }}>
      <TagGroup
        id="list-a"
        aria-label="List A"
        reorderable
        dragGroup="lists"
        onReorder={(event) => {
          log('list-a', 'reorder', { ...event });
          setA((t) => moveTags(t, event.values, event.toIndex));
        }}
        onTagDrop={(event) => {
          log('list-a', 'drop', { ...event });
          setB((t) => t.filter((v) => !event.values.includes(v)));
          setA((t) => [...t.slice(0, event.toIndex), ...event.values, ...t.slice(event.toIndex)]);
        }}
        {...handlers('list-a')}
      >
        {a.map((tag) => (
          <Tag key={tag} value={tag}>
            {tag}
          </Tag>
        ))}
      </TagGroup>
      <TagGroup
        id="list-b"
        aria-label="List B"
        reorderable
        dragGroup="lists"
        empty="Drop here"
        onReorder={(event) => setB((t) => moveTags(t, event.values, event.toIndex))}
        onTagDrop={(event) => {
          log('list-b', 'drop', { ...event });
          setA((t) => t.filter((v) => !event.values.includes(v)));
          setB((t) => [...t.slice(0, event.toIndex), ...event.values, ...t.slice(event.toIndex)]);
        }}
        {...handlers('list-b')}
      >
        {b.map((tag) => (
          <Tag key={tag} value={tag}>
            {tag}
          </Tag>
        ))}
      </TagGroup>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider theme={{ colorScheme: scheme }}>
      <main id="page" dir={dir} data-salmon-a11y-root="" style={{ display: 'grid', gap: 24, padding: 24 }}>
        <h1>TagGroup</h1>
        <Removable />
        <Selectable />
        <Reorder />
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root') as HTMLElement;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app);
} else createRoot(root).render(app);
