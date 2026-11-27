// RichTextEditor server rendering: react-dom/server
// with DOM globals removed. The server renders the toolbar shell and the
// sanitized value in the content element the engine mounts on later; it
// never loads ProseMirror.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

// Records every module the server render resolves.
const resolved: string[] = [];
registerHooks({
  resolve(specifier, context, next) {
    resolved.push(specifier);
    return next(specifier, context);
  },
});

const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const { RichTextEditor, RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT } = await import('@salmonui/rich-text');

const render = (props: Record<string, unknown>) => renderToString(createElement(RichTextEditor, props));

describe('RichTextEditor SSR', () => {
  it('renders the sanitized value in the textbox content element', () => {
    const html = render({ defaultValue: '<h2>Hi</h2><p onclick="x()">A <b>b</b><script>alert(1)</script><a href="javascript:alert(1)">l</a></p>', 'aria-label': 'Body' });
    const content = /<div id="[^"]+" class="salmon-rich-text__content salmon-rich-text-content" role="textbox" aria-multiline="true" aria-label="Body">(.*?)<\/div><\/div>/.exec(html);
    assert.ok(content, html);
    assert.equal(content[1], '<h2>Hi</h2><p>A <strong>b</strong>l</p>');
    assert.doesNotMatch(html, /script|onclick|javascript|contenteditable/);
  });

  it('renders the toolbar shell (APG toolbar, labelled, controls the content) and is deterministic', () => {
    const element = createElement(RichTextEditor, { value: '<p>x</p>', toolbar: ['bold', 'italic', '|', 'formats'], id: 'body' });
    const html = renderToString(element);
    assert.equal(html, renderToString(element));
    assert.match(html, /<div data-overflow="menu" role="toolbar" aria-label="Formatting" aria-controls="body" class="salmon-rich-text__toolbar">/);
    assert.match(html, /data-item-id="bold"[^>]*aria-label="Bold"|aria-label="Bold"[^>]*data-item-id="bold"/);
    assert.match(html, /role="separator"/);
    assert.match(html, /aria-haspopup="menu"/);
    // Items are disabled until the engine mounts; the same markup hydrates.
    assert.match(html, /<button[^>]*disabled=""[^>]*data-item-id="bold"|data-item-id="bold"[^>]*disabled=""/);
  });

  it('className, style, toolbar position, count, hidden input and locale text on the server', () => {
    const html = render({
      defaultValue: '<p>Hello</p>',
      className: 'mine',
      style: { inlineSize: 400 },
      toolbarPosition: 'bottom',
      showCount: true,
      maxLength: 10,
      name: 'body',
      localeText: { content: 'Corps', charactersOf: '{count} sur {max}' },
    });
    assert.match(html, /^<div class="salmon-rich-text mine" style="inline-size:400px" data-toolbar-position="bottom">/);
    assert.match(html, /aria-label="Corps"/);
    assert.match(html, /<span class="salmon-rich-text__count">5 sur 10<\/span>/);
    assert.match(html, /<input type="hidden" name="body" value="&lt;p&gt;Hello&lt;\/p&gt;"\/>/);
    assert.ok(html.indexOf('salmon-rich-text__body') < html.indexOf('role="toolbar"'));
  });

  it('every default toolbar button draws its own icon, never the fallback glyph', () => {
    const html = render({ 'aria-label': 'Body', toolbar: ['formats', 'bold', 'image'] });
    const paths = [...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>.*?<path d="([^"]+)"/g)].map((m) => [m[1], m[2]] as const);
    assert.ok(paths.length >= 3, html);
    // The fallback (edit image pencil) belongs to no toolbar item of this set.
    const fallback = 'M10.5 2.5l3 3L6 13H3v-3z';
    for (const [label, d] of paths) assert.notEqual(d, fallback, `${label} falls back to the default icon`);
  });

  it('readOnly, disabled, required, invalid and placeholder become ARIA state', () => {
    const html = render({ readOnly: true, disabled: true, required: true, invalid: true, placeholder: 'Write', name: 'b' });
    assert.match(html, /aria-readonly="true" aria-disabled="true" aria-required="true" aria-invalid="true" aria-placeholder="Write"/);
    assert.match(html, /data-disabled="" data-readonly="" data-invalid=""/);
    assert.match(html, /<input type="text" class="salmon-rich-text__validator" tabindex="-1" aria-hidden="true" required="" name="b" value=""\/>/);
  });

  it('toolbar="floating" and toolbar={false} render no fixed toolbar; embeds follow embedHosts', () => {
    assert.doesNotMatch(render({ toolbar: 'floating' }), /role="toolbar"/);
    assert.doesNotMatch(render({ toolbar: false }), /role="toolbar"/);
    const iframe = '<iframe src="https://www.youtube-nocookie.com/embed/1"></iframe>';
    assert.doesNotMatch(render({ defaultValue: iframe }), /iframe/);
    assert.match(render({ defaultValue: iframe, embedHosts: ['www.youtube-nocookie.com'] }), /<iframe src="https:\/\/www.youtube-nocookie.com\/embed\/1"/);
  });

  it("enterKey: 'div' writes paragraphs as <div> on the server, like getHtml", () => {
    const html = render({ defaultValue: '<p>a</p><h2>b</h2>', enterKey: 'div', name: 'body', toolbar: false });
    assert.match(html, /role="textbox"[^>]*><div>a<\/div><h2>b<\/h2><\/div>/);
    assert.match(html, /<input type="hidden" name="body" value="&lt;div&gt;a&lt;\/div&gt;&lt;h2&gt;b&lt;\/h2&gt;"\/>/);
  });

  it('extension elements declared in `html` survive the server render', () => {
    const ext = { name: 'note', html: { tags: ['x-note'], attributes: { 'x-note': ['data-kind'] } } };
    assert.match(render({ defaultValue: '<x-note data-kind="tip" onclick="x()">n</x-note>', extensions: [ext], toolbar: false }), /<x-note data-kind="tip">n<\/x-note>/);
    assert.doesNotMatch(render({ defaultValue: '<x-note data-kind="tip">n</x-note>', toolbar: false }), /x-note/);
  });

  it('the root entry never loads ProseMirror on the server', () => {
    assert.ok(resolved.some((s) => s.includes('RichTextEditor') || s.includes('react/index')), 'hook sees the package modules');
    assert.deepEqual(resolved.filter((s) => s.includes('prosemirror') || s.includes('engine/load') || s.includes('engine/core')), []);
    assert.equal(RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT.bold, 'Bold');
    assert.ok(Object.isFrozen(RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT));
  });
});
