// BlockEditor server rendering: renders with DOM
// globals removed, the content element holds blocksToHtml(value) with the
// textbox role, className / style / dir passthrough, no client UI, and the
// output is deterministic.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'DOMParser', 'requestAnimationFrame', 'getComputedStyle']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const { BlockEditor, BLOCK_EDITOR_DEFAULT_LOCALE_TEXT, blocksToHtml, htmlToBlocks } = await import('@salmonui/rich-text');
type Block = import('@salmonui/rich-text').Block;

const blocks: Block[] = [
  { id: 'h', type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Plan' }] },
  { id: 'a', type: 'checklistItem', props: { checked: true }, content: [{ type: 'text', text: 'Write <spec>' }] },
  { id: 'c', type: 'code', props: { language: 'ts' }, content: [{ type: 'text', text: 'let x = 1;' }] },
];

describe('BlockEditor SSR', () => {
  it('renders the blocks as sanitized HTML in the textbox element, without client UI', () => {
    const html = renderToString(createElement(BlockEditor, { value: blocks, className: 'mine', style: { maxWidth: 640 }, id: 'ed', 'aria-label': 'Notes' }));
    assert.equal(
      html,
      `<div id="ed" class="salmon-block-editor mine" style="max-width:640px"><div class="salmon-block-editor__content salmon-rich-text-content" role="textbox" aria-multiline="true" aria-label="Notes">${blocksToHtml(blocks)}</div></div>`,
    );
    assert.doesNotMatch(html, /salmon-block-editor__handle|role="menu"|listbox|contenteditable/);
  });

  it('defaultValue, readOnly, aria-labelledby and the default label', () => {
    const ro = renderToString(createElement(BlockEditor, { defaultValue: blocks, readOnly: true, 'aria-labelledby': 'lbl' }));
    assert.match(ro, /^<div class="salmon-block-editor salmon-block-editor--readonly"><div class="salmon-block-editor__content salmon-rich-text-content" role="textbox" aria-multiline="true" aria-labelledby="lbl" aria-readonly="true">/);
    const plain = renderToString(createElement(BlockEditor, {}));
    assert.equal(plain, `<div class="salmon-block-editor"><div class="salmon-block-editor__content salmon-rich-text-content" role="textbox" aria-multiline="true" aria-label="${BLOCK_EDITOR_DEFAULT_LOCALE_TEXT.editor}"></div></div>`);
    const localized = renderToString(createElement(BlockEditor, { localeText: { editor: '\u00c9diteur' } }));
    assert.match(localized, /aria-label="\u00c9diteur"/);
  });

  it('is deterministic, and the server HTML parses back to the same blocks', () => {
    const el = createElement(BlockEditor, { value: blocks });
    const a = renderToString(el);
    assert.equal(a, renderToString(el));
    const inner = /role="textbox" aria-multiline="true" aria-label="Editor">(.*)<\/div><\/div>$/s.exec(a)?.[1] ?? '';
    assert.deepEqual(htmlToBlocks(inner), blocks);
  });

  it('exports frozen locale defaults', () => {
    assert.ok(Object.isFrozen(BLOCK_EDITOR_DEFAULT_LOCALE_TEXT));
    assert.equal(BLOCK_EDITOR_DEFAULT_LOCALE_TEXT.slashMenu, 'Insert block');
  });
});
