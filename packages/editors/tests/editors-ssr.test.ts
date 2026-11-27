// Editors server rendering: renders through react-dom/server with
// DOM globals removed. InlineEdit renders its preview (and hidden input)
// only; MarkdownEditor renders its toolbar, textarea and split preview.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle', 'ResizeObserver']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement } = await import('react');
const h = createElement as unknown as (type: unknown, props?: unknown, ...children: unknown[]) => import('react').ReactElement;
const { renderToString } = await import('react-dom/server');
const { InlineEdit } = await import('@salmonui/editors/inline-edit');
const { MarkdownEditor } = await import('@salmonui/editors/markdown-editor');

describe('InlineEdit SSR', () => {
  it('renders the preview button with the value, label, part classes and passthrough; no editor', () => {
    const html = renderToString(h(InlineEdit, { defaultValue: 'Quarterly report', label: 'Title', name: 'title', className: 'extra', style: { maxWidth: 300 }, classNames: { preview: 'pv' }, 'data-testid': 'ie' }));
    assert.match(html, /^<span data-testid="ie" class="salmon-inline-edit extra" style="max-width:300px" data-mode="popover" data-trigger="click">/);
    assert.match(html, /<input type="hidden" name="title" value="Quarterly report"\/>/);
    assert.match(html, /<button type="button" class="salmon-inline-edit-preview pv" aria-haspopup="dialog" aria-expanded="false"><span class="salmon-inline-edit-label">Title: <\/span>Quarterly report<\/button>/);
    assert.doesNotMatch(html, /salmon-inline-edit-editor|role="dialog"|<input type="text"/);
    assert.equal(html, renderToString(h(InlineEdit, { defaultValue: 'Quarterly report', label: 'Title', name: 'title', className: 'extra', style: { maxWidth: 300 }, classNames: { preview: 'pv' }, 'data-testid': 'ie' })));
  });

  it('shows the placeholder (or the localized empty text) for an empty value', () => {
    assert.match(renderToString(h(InlineEdit, { placeholder: 'Untitled' })), /data-empty=""[^>]*>Untitled<\/button>/);
    assert.match(renderToString(h(InlineEdit, {})), /data-empty=""[^>]*>Empty<\/button>/);
    assert.match(renderToString(h(InlineEdit, { localeText: { empty: 'Leer' } })), />Leer<\/button>/);
  });

  it('renderPreview owns the display; disabled sets aria-disabled', () => {
    const html = renderToString(h(InlineEdit<number>, { value: 3, disabled: true, renderPreview: ({ value }: { value: number }) => h('b', null, `${value} items`) }));
    assert.match(html, /data-disabled=""/);
    assert.match(html, /aria-disabled="true"><b>3 items<\/b><\/button>/);
  });

  it('editButton mode renders a span preview and a labelled edit button', () => {
    const html = renderToString(h(InlineEdit, { defaultValue: 'x', trigger: 'editButton', label: 'Name', mode: 'inline' }));
    assert.match(html, /<span class="salmon-inline-edit-preview">x<\/span>/);
    assert.match(html, /<button aria-label="Edit Name" class="salmon-button salmon-inline-edit-edit-button"/);
  });

  it('inline mode with defaultEditing server-renders the editor with the default input and actions', () => {
    const html = renderToString(h(InlineEdit, { defaultValue: 'abc', mode: 'inline', defaultEditing: true, label: 'Code' }));
    assert.match(html, /class="salmon-inline-edit-editor"/);
    assert.match(html, /<input type="text" class="salmon-inline-edit-input" id="[^"]+" aria-label="Code" autofocus="" value="abc"/);
    assert.match(html, />Save<\/span><\/button>/);
    assert.match(html, />Cancel<\/span><\/button>/);
    assert.doesNotMatch(html, /salmon-inline-edit-preview/);
    const bare = renderToString(h(InlineEdit, { defaultValue: 'abc', mode: 'inline', defaultEditing: true, showActions: false, localeText: { save: 'Speichern' } }));
    assert.doesNotMatch(bare, /salmon-inline-edit-actions/);
  });

  it('the children render prop receives the draft and input props', () => {
    const html = renderToString(
      h(InlineEdit, { defaultValue: 'note', mode: 'inline', editing: true }, (ctx: { inputProps: Record<string, unknown>; value: string }) => h('textarea', { ...ctx.inputProps, 'data-draft': ctx.value })),
    );
    assert.match(html, /<textarea[^>]*data-draft="note"[^>]*>note<\/textarea>/);
  });

  it('popover mode never renders the popover on the server, even while editing', () => {
    const html = renderToString(h(InlineEdit, { defaultValue: 'x', defaultEditing: true }));
    assert.doesNotMatch(html, /role="dialog"|salmon-inline-edit-editor/);
    assert.match(html, /aria-expanded="true"/);
  });
});

describe('MarkdownEditor SSR', () => {
  it('renders the toolbar, the native textarea with the value and passthrough attributes', () => {
    const html = renderToString(h(MarkdownEditor, { defaultValue: '# Hi', name: 'body', required: true, placeholder: 'Write', className: 'extra', style: { height: 300 }, classNames: { textarea: 'ta', toolbar: 'tb' } }));
    assert.match(html, /^<div class="salmon-markdown-editor extra" style="height:300px" data-preview="off">/);
    assert.match(html, /<div role="toolbar" aria-label="Formatting" aria-controls="([^"]+)" class="salmon-markdown-editor-toolbar tb" data-overflow="menu">/);
    const controls = /aria-controls="([^"]+)"/.exec(html)![1];
    assert.match(html, new RegExp(`<textarea dir="auto" aria-label="Markdown source" name="body" required="" placeholder="Write" id="${controls}" class="salmon-markdown-editor-textarea ta" data-resizable="">\\# Hi</textarea>`.replace('\\#', '#')));
    // Toolbar: one tab stop, labelled icon buttons, separators.
    assert.equal(html.match(/tabindex="0"/g)?.length, 1);
    assert.match(html, /aria-label="Bold" title="Bold \(Mod\+B\)"/);
    assert.equal(html.match(/role="separator"/g)?.length, 3);
    assert.doesNotMatch(html, /role="region"/, 'no preview while it is off');
  });

  it('split preview renders the preview region on the server', () => {
    const html = renderToString(h(MarkdownEditor, { defaultValue: '**x**', defaultPreview: 'split', renderPreview: (md: string) => h('p', null, `rendered ${md}`) }));
    assert.match(html, /data-preview="split"/);
    assert.match(html, /<div id="[^"]+" role="region" aria-label="Preview" aria-live="off" dir="auto" class="salmon-markdown-editor-preview"><p>rendered \*\*x\*\*<\/p><\/div>/);
    assert.match(html, /aria-pressed="true"/);
  });

  it('readOnly, disabled and maxLength reach the textarea; showCount renders the count', () => {
    const html = renderToString(h(MarkdownEditor, { value: 'abcd', readOnly: true, maxLength: 10, showCount: true, toolbar: ['bold', 'fullscreen'] }));
    assert.match(html, /maxLength="10" readOnly=""/);
    assert.match(html, /class="salmon-markdown-editor-count">4 \/ 10<span class="salmon-markdown-editor-status" role="status"><\/span><\/div>/);
    // Read-only disables the text commands, not fullscreen.
    assert.match(html, /aria-label="Bold"[^>]*disabled=""/);
    assert.doesNotMatch(html, /aria-label="Full screen"[^>]*disabled=""/);
    const near = renderToString(h(MarkdownEditor, { value: 'abcdefghi', maxLength: 10, showCount: true }));
    assert.match(near, /role="status">Approaching the character limit</);
    const disabled = renderToString(h(MarkdownEditor, { defaultValue: '', disabled: true, toolbar: [] }));
    assert.match(disabled, /disabled=""/);
    assert.doesNotMatch(disabled, /role="toolbar"/, 'an empty toolbar hides the toolbar');
  });

  it('custom items, localeText and an explicit label', () => {
    const html = renderToString(
      h(MarkdownEditor, { 'aria-labelledby': 'lbl', toolbar: ['bold', { id: 'sig', label: 'Signature', onSelect: () => {} }], localeText: { bold: 'Fett', toolbar: 'Format' } }),
    );
    assert.match(html, /aria-label="Format"/);
    assert.match(html, /aria-label="Fett" title="Fett \(Mod\+B\)"/);
    assert.match(html, /aria-label="Signature" title="Signature"/);
    assert.match(html, /<textarea dir="auto" aria-labelledby="lbl"/);
    assert.doesNotMatch(html, /aria-label="Markdown source"/);
  });

  it('is deterministic', () => {
    const el = h(MarkdownEditor, { defaultValue: 'x', showCount: true });
    assert.equal(renderToString(el), renderToString(el));
  });
});
