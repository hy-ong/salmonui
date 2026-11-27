// Server-safe HTML parser and serializer: the tree builder
// rules editor HTML relies on, character references, attributes, comments,
// raw text, and the plain / XHTML serializer.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHtml, serializeHtml, escapeHtml, escapeAttribute, type HtmlNode } from '@salmonui/rich-text';

const roundTrip = (html: string, xhtml = false): string => serializeHtml(parseHtml(html), { xhtml });

function shape(nodes: readonly HtmlNode[]): unknown[] {
  return nodes.map((n) => (n.type === 'element' ? { [n.tag]: shape(n.children) } : n.type === 'text' ? n.value : `<!--${n.value}-->`));
}

describe('parseHtml', () => {
  it('builds elements, lowercases names and keeps attribute order', () => {
    const [p] = parseHtml('<P CLASS="a" Data-X=1 title=\'q "x"\' hidden>Hi</P>');
    assert.ok(p && p.type === 'element');
    assert.equal(p.tag, 'p');
    assert.deepEqual(p.attrs, { class: 'a', 'data-x': '1', title: 'q "x"', hidden: '' });
    assert.deepEqual(p.children, [{ type: 'text', value: 'Hi' }]);
  });

  it('treats void elements as empty and ignores self-closing slashes on non-void elements', () => {
    assert.deepEqual(shape(parseHtml('<p>a<br>b<img src=x/>c<hr/>')), [{ p: ['a', { br: [] }, 'b', { img: [] }, 'c'] }, { hr: [] }]);
    assert.deepEqual(shape(parseHtml('<div/>text</div>')), [{ div: ['text'] }]);
  });

  it('applies implied end tags for p, li, dt/dd, td/th, tr, table sections, option and headings', () => {
    assert.deepEqual(shape(parseHtml('<p>a<p>b<div>c</div>')), [{ p: ['a'] }, { p: ['b'] }, { div: ['c'] }]);
    assert.deepEqual(shape(parseHtml('<ul><li>one<li>two<ul><li>x</ul><li>three</ul>')), [
      { ul: [{ li: ['one'] }, { li: ['two', { ul: [{ li: ['x'] }] }] }, { li: ['three'] }] },
    ]);
    assert.deepEqual(shape(parseHtml('<dl><dt>t<dd>d<dt>u</dl>')), [{ dl: [{ dt: ['t'] }, { dd: ['d'] }, { dt: ['u'] }] }]);
    assert.deepEqual(shape(parseHtml('<table><thead><tr><th>h<th>i<tbody><tr><td>1<td>2<tr><td>3</table>')), [
      { table: [{ thead: [{ tr: [{ th: ['h'] }, { th: ['i'] }] }] }, { tbody: [{ tr: [{ td: ['1'] }, { td: ['2'] }] }, { tr: [{ td: ['3'] }] }] }] },
    ]);
    assert.deepEqual(shape(parseHtml('<select><option>a<option>b</select>')), [{ select: [{ option: ['a'] }, { option: ['b'] }] }]);
    assert.deepEqual(shape(parseHtml('<h1>a<h2>b</h1>c')), [{ h1: ['a'] }, { h2: ['b'] }, 'c']);
    assert.deepEqual(shape(parseHtml('<p><table><tr><td>x</td></tr></table>')), [{ p: [] }, { table: [{ tr: [{ td: ['x'] }] }] }]);
  });

  it('handles stray and misnested end tags without throwing', () => {
    assert.deepEqual(shape(parseHtml('a</p>b')), ['a', { p: [] }, 'b']);
    assert.deepEqual(shape(parseHtml('x</br>y')), ['x', { br: [] }, 'y']);
    assert.deepEqual(shape(parseHtml('<b><i>x</b>y</i>')), [{ b: [{ i: ['x'] }] }, 'y']);
    assert.deepEqual(shape(parseHtml('</div></span>t')), ['t']);
    assert.deepEqual(shape(parseHtml('<td>cell</td>')), [{ td: ['cell'] }]);
  });

  it('decodes numeric and named character references, with the HTML replacement rules', () => {
    const text = (html: string) => (parseHtml(html)[0] as { value: string }).value;
    assert.equal(text('&lt;b&gt; &amp; &quot;q&quot; &#39;s&#x27; &nbsp;'), '<b> & "q" \'s\' \u00a0');
    assert.equal(text('&copy; &mdash; &hellip; &euro; &rsquo;'), '\u00a9 \u2014 \u2026 \u20ac \u2019');
    // Names outside the short table stay literal (always safe: the serializer re-escapes `&`).
    assert.equal(text('&eacute;&alpha;'), '&eacute;&alpha;');
    assert.equal(text('&#0; &#xD800; &#x110000; &#128; &#x1F600;'), '\ufffd \ufffd \ufffd \u20ac \u{1F600}');
    assert.equal(text('&amp &lt3 &unknown; &'), '& <3 &unknown; &');
    const [a] = parseHtml('<a href="?a=1&copy=2&amp;b=&#x3A;">x</a>');
    assert.ok(a && a.type === 'element');
    assert.equal(a.attrs.href, '?a=1&copy=2&b=:');
  });

  it('parses quoted, unquoted and valueless attributes; first duplicate wins; NUL becomes U+FFFD', () => {
    const [e] = parseHtml('<img src=a.png alt = "x y" width=10 width=20 data-a="&lt;" ismap data-n="a\0b">');
    assert.ok(e && e.type === 'element');
    assert.deepEqual(e.attrs, { src: 'a.png', alt: 'x y', width: '10', 'data-a': '<', ismap: '', 'data-n': 'a\ufffdb' });
    const [g] = parseHtml('<a href=x>y');
    assert.ok(g && g.type === 'element' && g.attrs.href === 'x');
  });

  it('keeps comments (including abrupt ones), skips doctype, turns CDATA into text and drops a tag cut off at the end', () => {
    assert.deepEqual(shape(parseHtml('<!DOCTYPE html><!-- c -->a<!-->b<!--->c<!--x--!>d')), ['<!-- c -->', 'a', '<!---->', 'b', '<!---->', 'c', '<!--x-->', 'd']);
    assert.deepEqual(shape(parseHtml('<![CDATA[<b>]]>x')), ['<b>x']);
    assert.deepEqual(shape(parseHtml('<![if !supportLists]>m<![endif]>')), ['<!--[if !supportLists]-->', 'm', '<!--[endif]-->']);
    assert.deepEqual(shape(parseHtml('ok<p class="x')), ['ok']);
    assert.deepEqual(shape(parseHtml('a < b <3')), ['a < b <3']);
  });

  it('reads raw-text and RCDATA elements up to their own end tag', () => {
    assert.deepEqual(shape(parseHtml('<script>if (a < b) document.write("</p>")</script>x')), [{ script: ['if (a < b) document.write("</p>")'] }, 'x']);
    assert.deepEqual(shape(parseHtml('<style>p{}</STYLE >y')), [{ style: ['p{}'] }, 'y']);
    assert.deepEqual(shape(parseHtml('<textarea>\n&lt;b&gt;<i></textarea>')), [{ textarea: ['<b><i>'] }]);
    assert.deepEqual(shape(parseHtml('<title>a &amp; b</title>')), [{ title: ['a & b'] }]);
    assert.deepEqual(shape(parseHtml('<script>never closed')), [{ script: ['never closed'] }]);
  });

  it('drops the newline after <pre> and normalizes CRLF', () => {
    assert.deepEqual(shape(parseHtml('<pre>\nline\r\nnext</pre>')), [{ pre: ['line\nnext'] }]);
  });

  it('flattens nesting deeper than the depth limit instead of recursing without bound', () => {
    const deep = '<div>'.repeat(5000) + 'x' + '</div>'.repeat(5000);
    let depth = 0;
    let node: HtmlNode | undefined = parseHtml(deep)[0];
    while (node && node.type === 'element') {
      depth++;
      node = node.children[0];
    }
    assert.ok(depth <= 256, `depth ${depth}`);
    assert.ok(roundTrip(deep).includes('x'));
  });
});

describe('serializeHtml', () => {
  it('escapes text and attribute values and writes void elements without end tags', () => {
    assert.equal(roundTrip('<p title="a&quot;b&lt;">1 &lt; 2 &amp;&nbsp;3<br></p>'), '<p title="a&quot;b&lt;">1 &lt; 2 &amp;&nbsp;3<br></p>');
    assert.equal(escapeHtml('<a> & "b"'), '&lt;a&gt; &amp; "b"');
    assert.equal(escapeAttribute('"<&>'), '&quot;&lt;&amp;&gt;');
  });

  it('xhtml: self-closing voids, boolean attributes with values, numeric nbsp', () => {
    assert.equal(roundTrip('<p>a<br>b<img src="x" alt="">&nbsp;</p><details open><summary>s</summary></details><hr>', true), '<p>a<br />b<img src="x" alt="" />&#160;</p><details open="open"><summary>s</summary></details><hr />');
  });

  it('keeps the leading newline of <pre> content and raw text of script', () => {
    assert.equal(roundTrip('<pre>\n\nx</pre>'), '<pre>\n\nx</pre>');
    assert.equal(roundTrip('<script>a<b</script>'), '<script>a<b</script>');
  });

  it('never lets a comment close early', () => {
    assert.equal(serializeHtml([{ type: 'comment', value: 'a-->b<script>' }]), '<!--ab<script>-->');
  });
});
