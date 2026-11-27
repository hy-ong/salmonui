// Block JSON model: HTML serializers with
// round trips for every block type and inline content, deterministic ids,
// and the immutable array helpers with structural sharing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  blocksToHtml,
  htmlToBlocks,
  findBlock,
  findParentId,
  forEachBlock,
  insertBlocks,
  removeBlocks,
  updateBlock,
  moveBlock,
  type Block,
} from '@salmonui/rich-text';

const ALL: Block[] = [
  { id: 'h', type: 'heading', props: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Title' }] },
  {
    id: 'p',
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Plain ' },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' all', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }, { type: 'strike' }, { type: 'code' }] },
      { type: 'text', text: '2', marks: [{ type: 'superscript' }] },
      { type: 'text', text: 'x', marks: [{ type: 'subscript' }] },
      { type: 'text', text: ' styled', marks: [{ type: 'bold' }, { type: 'fontFamily', value: 'Georgia, serif' }, { type: 'fontSize', value: '18px' }, { type: 'color', value: '#c00' }, { type: 'backgroundColor', value: 'yellow' }] },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://example.com/?a=1&b=2', target: '_blank', content: [{ type: 'text', text: 'link ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
      { type: 'hardBreak' },
      { type: 'mention', id: '42', label: 'Alice', trigger: '@' },
      { type: 'text', text: ' ' },
      { type: 'label', id: 'bug', label: 'bug', trigger: '#', tone: 'danger' },
      { type: 'text', text: ' <escaped> & "quoted"' },
    ],
  },
  { id: 'pa', type: 'paragraph', props: { textAlign: 'right' }, content: [] },
  {
    id: 'l1',
    type: 'bulletListItem',
    content: [{ type: 'text', text: 'one' }],
    children: [
      { id: 'l1a', type: 'bulletListItem', content: [{ type: 'text', text: 'one a' }] },
      { id: 'l1b', type: 'numberedListItem', content: [{ type: 'text', text: 'one b' }], children: [{ id: 'l1b1', type: 'paragraph', content: [{ type: 'text', text: 'para in item' }] }] },
    ],
  },
  { id: 'l2', type: 'bulletListItem', content: [{ type: 'text', text: 'two' }] },
  { id: 'n1', type: 'numberedListItem', props: { start: 3 }, content: [{ type: 'text', text: 'three' }] },
  { id: 'n2', type: 'numberedListItem', content: [{ type: 'text', text: 'four' }] },
  { id: 'n3', type: 'numberedListItem', props: { start: 10 }, content: [{ type: 'text', text: 'ten' }] },
  { id: 'c1', type: 'checklistItem', props: { checked: true }, content: [{ type: 'text', text: 'done' }] },
  { id: 'c2', type: 'checklistItem', props: { checked: false }, content: [] },
  { id: 'q', type: 'quote', content: [{ type: 'text', text: 'quoted' }], children: [{ id: 'q1', type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
  { id: 'co', type: 'callout', props: { tone: 'warning' }, content: [{ type: 'text', text: 'careful' }] },
  { id: 'code', type: 'code', props: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1 < 2;\n  return  a;\n' }] },
  { id: 'code2', type: 'code', content: [] },
  { id: 'img', type: 'image', props: { src: 'https://example.com/a.png', alt: 'An image', caption: 'Caption', width: 320, height: 200 } },
  { id: 'img2', type: 'image', props: { src: 'data:image/png;base64,iVBORw0KGgo=' } },
  {
    id: 't',
    type: 'table',
    props: {
      headerRow: true,
      rows: [
        [[{ type: 'text', text: 'H1' }], [{ type: 'text', text: 'H2' }]],
        [[{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }], []],
      ],
      variant: 'striped',
    },
  },
  { id: 't2', type: 'table', props: { headerRow: false, rows: [[[{ type: 'text', text: 'x' }, { type: 'hardBreak' }, { type: 'text', text: 'y' }]]] } },
  { id: 'd', type: 'divider' },
  { id: 'tg', type: 'toggle', props: { open: true }, content: [{ type: 'text', text: 'Summary' }], children: [{ id: 'tg1', type: 'paragraph', content: [{ type: 'text', text: 'hidden' }] }] },
  { id: 'tg2', type: 'toggle', content: [] },
  { id: 'au', type: 'audio', props: { src: 'https://example.com/a.mp3' } },
  { id: 'vi', type: 'video', props: { src: 'blob:https://example.com/1', width: 640, height: 360 } },
];

describe('blocksToHtml / htmlToBlocks', () => {
  it('round-trips every block type and inline content type', () => {
    const html = blocksToHtml(ALL);
    assert.deepEqual(htmlToBlocks(html), ALL);
    assert.equal(blocksToHtml(htmlToBlocks(html)), html);
  });

  it('writes the shared vocabulary with data-block-id on block elements (li for list items)', () => {
    const html = blocksToHtml(ALL);
    assert.match(html, /^<h2 style="text-align:center" data-block-id="h">Title<\/h2>/);
    assert.match(html, /<ul><li data-block-id="l1"><p>one<\/p><ul><li data-block-id="l1a"><p>one a<\/p><\/li><\/ul><ol><li data-block-id="l1b"><p>one b<\/p><p data-block-id="l1b1">para in item<\/p><\/li><\/ol><\/li><li data-block-id="l2"><p>two<\/p><\/li><\/ul>/);
    assert.match(html, /<ol start="3"><li data-block-id="n1"><p>three<\/p><\/li><li data-block-id="n2"><p>four<\/p><\/li><\/ol><ol start="10"><li data-block-id="n3">/);
    assert.match(html, /<ul data-type="checklist"><li data-checked="true" data-block-id="c1"><p>done<\/p><\/li><li data-checked="false" data-block-id="c2"><p><\/p><\/li><\/ul>/);
    assert.match(html, /<span data-type="mention" data-id="42" data-trigger="@">@Alice<\/span> <span data-type="label" data-id="bug" data-trigger="#" data-tone="danger">#bug<\/span> &lt;escaped&gt; &amp; "quoted"/);
    assert.match(html, /<a href="https:\/\/example\.com\/\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">link <strong>bold<\/strong><\/a><br>/);
    assert.match(html, /<span style="font-family:Georgia, serif"><span style="font-size:18px"><span style="color:#c00"><span style="background-color:yellow"><strong> styled<\/strong><\/span><\/span><\/span><\/span>/);
    assert.match(html, /<pre data-block-id="code"><code class="language-ts">const a = 1 &lt; 2;\n {2}return {2}a;\n<\/code><\/pre>/);
    assert.match(html, /<figure data-block-id="img"><img src="https:\/\/example\.com\/a\.png" alt="An image" width="320" height="200"><figcaption>Caption<\/figcaption><\/figure>/);
    assert.match(html, /<table class="salmon-rich-text-table--striped" data-block-id="t"><tbody><tr><th><p>H1<\/p><\/th><th><p>H2<\/p><\/th><\/tr><tr><td><p><strong>a<\/strong><\/p><\/td><td><p><\/p><\/td><\/tr><\/tbody><\/table>/);
    assert.match(html, /<hr data-block-id="d"><details data-block-id="tg" open><summary>Summary<\/summary><p data-block-id="tg1">hidden<\/p><\/details>/);
    assert.match(html, /<div data-type="callout" data-tone="warning" data-block-id="co"><p>careful<\/p><\/div>/);
    assert.match(html, /<audio controls src="https:\/\/example\.com\/a\.mp3" data-block-id="au"><\/audio><video controls src="blob:https:\/\/example\.com\/1" width="640" height="360" data-block-id="vi"><\/video>$/);
  });

  it('assigns deterministic index-path ids when data-block-id is missing, and dedupes', () => {
    const html = '<p>a</p><ul><li>b<ul><li>c</li></ul></li></ul><p data-block-id="b0">explicit</p><p data-block-id="b0">dupe</p>';
    const blocks = htmlToBlocks(html);
    assert.deepEqual(blocks.map((b) => b.id), ['b0_2', 'b1', 'b0', 'b3']);
    assert.equal((blocks[1] as Block).children?.[0]?.id, 'b1-0');
    assert.deepEqual(htmlToBlocks(html), blocks);
  });

  it('parses foreign HTML: implicit paragraphs, lone images, whitespace collapse, merged marks, dropped embeds', () => {
    const blocks = htmlToBlocks('  text <b>bold</b><b> more</b>\n<p>  <img src="a.png" alt="A">  </p><h7>x</h7><iframe src="https://x"></iframe><p>a  <i>\n b </i> </p><blockquote>inline quote</blockquote>');
    assert.deepEqual(blocks, [
      { id: 'b0', type: 'paragraph', content: [{ type: 'text', text: 'text ' }, { type: 'text', text: 'bold more', marks: [{ type: 'bold' }] }] },
      { id: 'b1', type: 'image', props: { src: 'a.png', alt: 'A' } },
      { id: 'b2', type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
      { id: 'b3', type: 'paragraph', content: [{ type: 'text', text: 'a ' }, { type: 'text', text: 'b', marks: [{ type: 'italic' }] }] },
      { id: 'b4', type: 'quote', content: [{ type: 'text', text: 'inline quote' }] },
    ]);
  });

  it('is sanitized in both directions', () => {
    const html = blocksToHtml([
      { id: 'x', type: 'paragraph', content: [{ type: 'link', href: 'javascript:alert(1)', content: [{ type: 'text', text: 'click' }] }, { type: 'text', text: 'red', marks: [{ type: 'color', value: 'expression(alert(1))' }] }] },
      { id: 'bad id', type: 'image', props: { src: 'javascript:alert(1)' } },
    ]);
    assert.equal(html, '<p data-block-id="x">clickred</p>');
    assert.deepEqual(htmlToBlocks('<p onclick="x">a<script>b</script></p>'), [{ id: 'b0', type: 'paragraph', content: [{ type: 'text', text: 'a' }] }]);
  });
});

describe('block helpers', () => {
  const doc: Block[] = [
    { id: 'a', type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
    { id: 'b', type: 'bulletListItem', content: [], children: [{ id: 'b1', type: 'bulletListItem', content: [] }, { id: 'b2', type: 'bulletListItem', content: [] }] },
    { id: 'c', type: 'paragraph', content: [] },
  ];
  const ids = (blocks: readonly Block[]): string[] => {
    const out: string[] = [];
    forEachBlock(blocks, (b, parent) => out.push(parent ? `${parent.id}/${b.id}` : b.id));
    return out;
  };

  it('findBlock and findParentId search the whole tree', () => {
    assert.equal(findBlock(doc, 'b2'), doc[1]?.children?.[1]);
    assert.equal(findBlock(doc, 'zz'), undefined);
    assert.equal(findParentId(doc, 'b2'), 'b');
    assert.equal(findParentId(doc, 'a'), null);
    assert.equal(findParentId(doc, 'zz'), undefined);
  });

  it('insertBlocks before / after / into parent / at the end, sharing untouched subtrees', () => {
    const n: Block = { id: 'n', type: 'divider' };
    const before = insertBlocks(doc, [n], { before: 'b2' });
    assert.deepEqual(ids(before), ['a', 'b', 'b/b1', 'b/n', 'b/b2', 'c']);
    assert.equal(before[0], doc[0]);
    assert.equal(before[2], doc[2]);
    assert.notEqual(before[1], doc[1]);
    assert.deepEqual(ids(insertBlocks(doc, [n], { after: 'a' })), ['a', 'n', 'b', 'b/b1', 'b/b2', 'c']);
    assert.deepEqual(ids(insertBlocks(doc, [n], { parent: 'c' })), ['a', 'b', 'b/b1', 'b/b2', 'c', 'c/n']);
    assert.deepEqual(ids(insertBlocks(doc, [n], { parent: 'b', index: 0 })), ['a', 'b', 'b/n', 'b/b1', 'b/b2', 'c']);
    assert.deepEqual(ids(insertBlocks(doc, [n])), ['a', 'b', 'b/b1', 'b/b2', 'c', 'n']);
    assert.equal(insertBlocks(doc, [n], { before: 'missing' }), doc);
    assert.deepEqual(ids(doc), ['a', 'b', 'b/b1', 'b/b2', 'c']);
  });

  it('removeBlocks removes subtrees and drops emptied children arrays', () => {
    const out = removeBlocks(doc, ['b1', 'b2', 'c']);
    assert.deepEqual(ids(out), ['a', 'b']);
    assert.equal('children' in (out[1] as Block), false);
    assert.equal(out[0], doc[0]);
    assert.equal(removeBlocks(doc, ['missing']), doc);
  });

  it('updateBlock merges props and replaces type / content / children; a function keeps the id', () => {
    const out = updateBlock(doc, 'b1', { type: 'checklistItem', props: { checked: true }, content: [{ type: 'text', text: 'x' }] });
    assert.deepEqual(findBlock(out, 'b1'), { id: 'b1', type: 'checklistItem', props: { checked: true }, content: [{ type: 'text', text: 'x' }] });
    assert.equal(out[0], doc[0]);
    const merged = updateBlock(out, 'b1', { props: { other: 1 } });
    assert.deepEqual(findBlock(merged, 'b1')?.props, { checked: true, other: 1 });
    const fn = updateBlock(doc, 'a', (b) => ({ ...b, id: 'changed', type: 'heading', props: { level: 1 } }));
    assert.deepEqual(fn[0], { id: 'a', type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'A' }] });
    assert.equal(updateBlock(doc, 'a', (b) => b), doc);
  });

  it('moveBlock moves with children, refuses moving into its own subtree or to a missing anchor', () => {
    assert.deepEqual(ids(moveBlock(doc, 'c', { before: 'a' })), ['c', 'a', 'b', 'b/b1', 'b/b2']);
    assert.deepEqual(ids(moveBlock(doc, 'b', { after: 'c' })), ['a', 'c', 'b', 'b/b1', 'b/b2']);
    assert.deepEqual(ids(moveBlock(doc, 'b2', { before: 'a' })), ['b2', 'a', 'b', 'b/b1', 'c']);
    assert.deepEqual(ids(moveBlock(doc, 'a', { parent: 'b', index: 1 })), ['b', 'b/b1', 'b/a', 'b/b2', 'c']);
    assert.equal(moveBlock(doc, 'b', { parent: 'b1' }), doc);
    assert.equal(moveBlock(doc, 'b', { after: 'b' }), doc);
    assert.equal(moveBlock(doc, 'a', { after: 'missing' }), doc);
    assert.equal(moveBlock(doc, 'missing', { after: 'a' }), doc);
  });
});
