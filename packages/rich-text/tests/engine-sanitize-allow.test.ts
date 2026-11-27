// Extension allow-lists on the always-on sanitizer and
// paragraphs written as <div> (`enterKey: 'div'`).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanPastedHtml, sanitizeHtml, type SanitizeAllow } from '@salmonui/rich-text';
import { createEngineSync } from '../dist/engine/load.js';
import type { RichTextExtension } from '@salmonui/rich-text';

describe('sanitizer allow-lists from extensions', () => {
  it('keeps an allowed extension element and its allowed attributes; everything else stays sanitized', () => {
    const allow: SanitizeAllow = { tags: ['x-note'], attributes: { 'x-note': ['data-kind', 'title'] } };
    const html = '<x-note data-kind="tip" title="T" data-other="1" onclick="x()">Hi <b>there</b><script>alert(1)</script></x-note>';
    assert.equal(sanitizeHtml(html), 'Hi <strong>there</strong>');
    assert.equal(sanitizeHtml(html, { allow }), '<x-note data-kind="tip" title="T">Hi <strong>there</strong></x-note>');
  });

  it('can never allow script, style, iframe, object, embed, forms or foreign markup', () => {
    const allow: SanitizeAllow = { tags: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math', 'template', 'SCRIPT', 'x:y'] };
    const html = '<script>a()</script><style>p{}</style><iframe src="https://e.x/"></iframe><object data="x"></object><embed src="x"><form><input value="v"></form><svg><g/></svg><template>t</template><p>ok</p>';
    assert.equal(sanitizeHtml(html, { allow }), '<p>ok</p>');
  });

  it('can never allow on* handlers, style or URL carriers that skip the URL rules', () => {
    const allow: SanitizeAllow = {
      tags: ['x-card'],
      attributes: { 'x-card': ['onclick', 'onmouseover', 'style', 'srcset', 'srcdoc', 'formaction', 'background', 'data-ok'], p: ['onclick', 'style', 'data-x'], span: ['style', 'data-kind'] },
    };
    const out = sanitizeHtml('<x-card onclick="a()" onmouseover="b()" style="background:url(x)" srcset="javascript:x 1x" srcdoc="<script>" formaction="javascript:x" background="javascript:x" data-ok="1">c</x-card><p onclick="a()" style="color:red" data-x="1">p</p><span style="position:fixed" data-kind="k">s</span>', { allow });
    assert.equal(out, '<x-card data-ok="1">c</x-card><p data-x="1">p</p><span data-kind="k">s</span>');
  });

  it('allowed URL attributes go through the URL rules', () => {
    const allow: SanitizeAllow = { tags: ['x-ref', 'x-pic'], attributes: { 'x-ref': ['href', 'cite'], 'x-pic': ['src', 'poster'] } };
    const out = sanitizeHtml(
      '<x-ref href="javascript:alert(1)" cite=" JaVa&#x09;script:x">a</x-ref><x-ref href="https://ok.dev/a">b</x-ref><x-pic src="data:text/html,<script>" poster="https://ok.dev/p.png">c</x-pic><x-pic src="data:image/png;base64,AAAA">d</x-pic>',
      { allow },
    );
    assert.equal(out, '<x-ref>a</x-ref><x-ref href="https://ok.dev/a">b</x-ref><x-pic poster="https://ok.dev/p.png">c</x-pic><x-pic src="data:image/png;base64,AAAA">d</x-pic>');
  });

  it('cannot redefine vocabulary elements; the sanitize hook stays restrict-only', () => {
    const allow: SanitizeAllow = { tags: ['a', 'img'], attributes: { a: ['data-preview'] } };
    assert.equal(sanitizeHtml('<a href="javascript:x" data-preview="1">t</a>', { allow }), 't');
    // The hook can drop an allowed attribute but not add one back.
    const hooked = sanitizeHtml('<p data-x="1" data-y="2">p</p>', {
      allow: { attributes: { p: ['data-x', 'data-y'] } },
      sanitize: (el) => (el.tag === 'p' ? { attrs: { 'data-x': el.attrs['data-x'] ?? '', onclick: 'a()' } } : undefined),
    });
    assert.equal(hooked, '<p data-x="1">p</p>');
    assert.equal(sanitizeHtml('<x-a>t</x-a>', { allow: { tags: ['x-a'] }, sanitize: (el) => (el.tag === 'x-a' ? 'unwrap' : undefined) }), 't');
  });

  it('paste cleanup honours the allow-list', () => {
    const allow: SanitizeAllow = { tags: ['x-note'] };
    assert.equal(cleanPastedHtml('<x-note>n</x-note><script>x</script>', { mode: 'keep', allow }), '<x-note>n</x-note>');
    assert.equal(cleanPastedHtml('<x-note>n</x-note>', { mode: 'keep' }), 'n');
  });

  it('an extension node survives value in and getHtml out', () => {
    const note: RichTextExtension = {
      name: 'note',
      nodes: {
        note: {
          group: 'block',
          content: 'inline*',
          attrs: { kind: { default: 'tip' } },
          parseDOM: [{ tag: 'x-note', getAttrs: (dom) => ({ kind: (dom as HTMLElement).getAttribute('data-kind') ?? 'tip' }) }],
          toDOM: (node) => ['x-note', { 'data-kind': node.attrs['kind'] }, 0],
        },
      },
      html: { tags: ['x-note'], attributes: { 'x-note': ['data-kind'] } },
    };
    const value = '<p>a</p><x-note data-kind="warn" onclick="x()">Careful <em>here</em></x-note>';
    const engine = createEngineSync({ html: value, extensions: [note] });
    assert.equal(engine.state.doc.child(1).type.name, 'note');
    assert.equal(engine.state.doc.child(1).attrs['kind'], 'warn');
    assert.equal(engine.getHtml(), '<p>a</p><x-note data-kind="warn">Careful <em>here</em></x-note>');
    // Without the declaration the same node cannot get in.
    const { html: _html, ...bare } = note;
    assert.equal(createEngineSync({ html: value, extensions: [bare] }).getHtml(), '<p>a</p><p>Careful <em>here</em></p>');
  });
});

describe("enterKey: 'div' writes paragraphs as <div>", () => {
  it('getHtml writes <div>, xhtml too, and <div> parses back to a paragraph with its attributes', () => {
    const engine = createEngineSync({ html: '<p style="text-align:center" data-indent="2">a</p><ul><li><p>b</p></li></ul><h2>c</h2>', paragraphTag: 'div' });
    assert.equal(engine.getHtml(), '<div style="text-align:center" data-indent="2">a</div><ul><li><div>b</div></li></ul><h2>c</h2>');
    assert.equal(engine.getHtml({ xhtml: true }), '<div style="text-align:center" data-indent="2">a</div><ul><li><div>b</div></li></ul><h2>c</h2>');
    const back = createEngineSync({ html: engine.getHtml() });
    assert.equal(back.getHtml(), '<p style="text-align:center" data-indent="2">a</p><ul><li><p>b</p></li></ul><h2>c</h2>');
    assert.equal(back.state.doc.firstChild!.type.name, 'paragraph');
  });
});
