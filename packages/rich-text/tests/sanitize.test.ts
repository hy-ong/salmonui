// Allow-list sanitizer: the vocabulary survives, everything
// else is unwrapped or dropped, the XSS corpus never yields script, the hook
// only restricts, and the pass is linear on a 1 MB document.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeHtml, sanitizeUrl, embedAllowed, parseHtml, type SanitizeHook, type HtmlNode } from '@salmonui/rich-text';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

const s = (html: string, embedHosts?: string[]) => sanitizeHtml(html, embedHosts ? { embedHosts } : {});

// Anything that could execute or load script once the output is parsed by a browser.
function assertInert(html: string): void {
  const out = sanitizeHtml(html);
  const tree = parseHtml(out);
  const walk = (nodes: readonly HtmlNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'comment') assert.fail(`comment survived: ${out}`);
      if (n.type !== 'element') continue;
      assert.ok(!['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'base', 'meta', 'link', 'form', 'input', 'textarea', 'button', 'template', 'noscript', 'title', 'frame', 'frameset'].includes(n.tag), `${n.tag} survived: ${out}`);
      for (const [name, value] of Object.entries(n.attrs)) {
        assert.ok(!name.startsWith('on'), `${name} survived: ${out}`);
        assert.ok(!['srcdoc', 'formaction', 'action', 'xlink:href', 'background', 'poster', 'srcset', 'id', 'name', 'dir'].includes(name), `${name} survived: ${out}`);
        if (name === 'href' || name === 'src') assert.ok(!/^\s*(?:javascript|vbscript|data:(?!image\/(?:png|jpeg|gif|webp|avif)))/i.test(value.replace(/[\t\n\r]/g, '')), `${name}=${value} survived: ${out}`);
        if (name === 'style') assert.ok(!/url|expression|javascript|\\|@import|behavior/i.test(value), `style=${value} survived: ${out}`);
      }
      walk(n.children);
    }
  };
  walk(tree);
  // Idempotent: a second pass changes nothing (no mutation XSS through re-parsing).
  assert.equal(sanitizeHtml(out), out, `not idempotent for ${html}`);
}

const XSS: readonly string[] = [
  '<script>alert(1)</script>',
  '<SCRIPT SRC=//x.example/x.js></SCRIPT>',
  '<img src=x onerror=alert(1)>',
  '<img src="x" ONERROR="alert(1)">',
  '<img/src=x/onerror=alert(1)>',
  '<body onload=alert(1)>',
  '<svg onload=alert(1)><script>alert(1)</script></svg>',
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>',
  '<math href="javascript:alert(1)">x</math>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="java\nscript:alert(1)">x</a>',
  '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
  '<a href="&#x6A;avascript&colon;alert(1)">x</a>',
  '<a href="javascript&#x3A;alert(1)">x</a>',
  '<a href="jav&#x09;ascript:alert(1)">x</a>',
  '<a href="jav&Tab;ascript:alert(1)">x</a>',
  '<a href="&#0000106avascript:alert(1)">x</a>',
  '<a href="\x01javascript:alert(1)">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<img src="data:text/html,<script>alert(1)</script>">',
  '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
  '<a href="livescript:alert(1)">x</a>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)">',
  '<base href="javascript:alert(1)//">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<link rel="stylesheet" href="javascript:alert(1)">',
  '<form action="javascript:alert(1)"><input type="submit"><button formaction="javascript:alert(1)">b</button></form>',
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<span style="color:expression(alert(1))">x</span>',
  '<span style="color:red;background-image:url(x)">x</span>',
  '<span style="font-family:x;}body{background:url(x)">x</span>',
  '<span style="color:\\72 ed">x</span>',
  '<span style="behavior:url(x.htc)">x</span>',
  '<div style="-moz-binding:url(x)">x</div>',
  '<style>@import "x";</style><p>y</p>',
  '<a href="https://ok.example" onclick="alert(1)" onmouseover=alert(1)>x</a>',
  '<p title="</p><script>alert(1)</script>">x</p>',
  '<img alt="<script>alert(1)</script>" src="ok.png">',
  '<a title="&quot;onmouseover=alert(1)">x</a>',
  '<!--<img src=x onerror=alert(1)>-->',
  '<!-- --!><img src=x onerror=alert(1)> -->',
  '<!--><img src=x onerror=alert(1)>-->',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  '<template><img src=x onerror=alert(1)></template>',
  '<textarea><img src=x onerror=alert(1)></textarea>',
  '<title><img src=x onerror=alert(1)></title>',
  '<xmp><img src=x onerror=alert(1)></xmp>',
  '<style><img src=x onerror=alert(1)></style>',
  '<select><option><img src=x onerror=alert(1)></option></select>',
  '<table><tr><td><img src=x onerror=alert(1)></td></tr></table>',
  '<p><svg><style><img src=x onerror=alert(1)></style></svg></p>',
  '<details open ontoggle=alert(1)><summary>x</summary></details>',
  '<video src=x onerror=alert(1) poster="javascript:alert(1)"></video>',
  '<audio src="javascript:alert(1)"></audio>',
  '<img srcset="javascript:alert(1) 1x" src="ok.png">',
  '<a href="#" id="x" name="y" dir="rtl">x</a>',
  '<span data-type="mention" data-id="1" data-trigger="@" onclick="alert(1)">@<img src=x onerror=alert(1)>A</span>',
  '<div data-type="callout" data-tone="javascript:alert(1)" onmouseover="alert(1)">x</div>',
  '<li data-checked="javascript:alert(1)">x</li>',
  '<code class="language-js\" onmouseover=\"alert(1)">x</code>',
  '<a href="https://x.example"<img src=x onerror=alert(1)>>y</a>',
  '<<script>script>alert(1)<</script>/script>',
  '<scr<script>ipt>alert(1)</script>',
  '<img src="x`onerror=alert(1)`">',
  '<p>\u2028<script>alert(1)</script></p>',
  '<isindex action="javascript:alert(1)" type=image>',
  '<frameset onload=alert(1)><frame src="javascript:alert(1)"></frameset>',
  '<marquee onstart=alert(1)>x</marquee>',
  '<applet code="x"></applet>',
  '<portal src="javascript:alert(1)"></portal>',
];

describe('sanitizeHtml: XSS corpus', () => {
  for (const html of XSS) {
    it(`neutralizes ${JSON.stringify(html).slice(0, 80)}`, () => assertInert(html));
  }

  it('removes script-bearing URLs while keeping the link text', () => {
    assert.equal(s('<a href="jav&#x09;ascript:alert(1)">x</a>'), 'x');
    assert.equal(s('<a href="&#x6A;avascript&colon;alert(1)">y</a>'), 'y');
    assert.equal(s('<img src="data:image/svg+xml;base64,PHN2Zz4=">'), '');
  });
});

describe('sanitizeHtml: vocabulary', () => {
  it('keeps blocks with their schema attributes', () => {
    const html =
      '<h2 style="text-align:center;color:red" data-indent="2" data-block-id="h1">T</h2>' +
      '<p style="line-height:1.5;text-align:justify">p</p><blockquote data-block-id="q"><p>q</p></blockquote><hr data-block-id="d">' +
      '<pre data-block-id="c"><code class="language-ts">let a = 1 &lt; 2;</code></pre>';
    assert.equal(
      s(html),
      '<h2 style="text-align:center" data-indent="2" data-block-id="h1">T</h2>' +
        '<p style="text-align:justify;line-height:1.5">p</p><blockquote data-block-id="q"><p>q</p></blockquote><hr data-block-id="d">' +
        '<pre data-block-id="c"><code class="language-ts">let a = 1 &lt; 2;</code></pre>',
    );
  });

  it('keeps lists, checklists, start and list styles; moves a list directly in a list into the previous item', () => {
    assert.equal(s('<ul style="list-style-type:square"><li>a</li><ul><li>b</li></ul></ul>'), '<ul style="list-style-type:square"><li>a<ul><li>b</li></ul></li></ul>');
    assert.equal(s('<ol start="3" style="list-style-type:lower-roman" reversed><li>x</li></ol>'), '<ol start="3" style="list-style-type:lower-roman"><li>x</li></ol>');
    assert.equal(s('<ul data-type="checklist"><li data-checked="true">a</li><li>b</li></ul>'), '<ul data-type="checklist"><li data-checked="true">a</li><li data-checked="false">b</li></ul>');
    assert.equal(s('<ul><li data-checked="true">a</li>loose</ul>'), '<ul><li>a</li><li>loose</li></ul>');
    assert.equal(s('<ol style="list-style-type:disc"><li>x</li></ol>'), '<ol><li>x</li></ol>');
  });

  it('keeps marks and normalizes b, i, del, strike, ins', () => {
    assert.equal(s('<b>b</b><i>i</i><u>u</u><s>s</s><del>d</del><strike>k</strike><ins>n</ins><sub>2</sub><sup>3</sup><code>c</code><mark>m</mark>'), '<strong>b</strong><em>i</em><u>u</u><s>s</s><s>d</s><s>k</s><u>n</u><sub>2</sub><sup>3</sup><code>c</code><mark>m</mark>');
  });

  it('links: http(s), mailto, tel, relative and #; target only _blank, which adds rel', () => {
    assert.equal(s('<a href="https://x.example/a?b=1&amp;c" title="t" target="_blank" rel="opener">x</a>'), '<a href="https://x.example/a?b=1&amp;c" title="t" target="_blank" rel="noopener noreferrer">x</a>');
    assert.equal(s('<a href="mailto:a@b.c">m</a><a href="tel:+1">t</a><a href="/rel">r</a><a href="#top" target="_self">h</a><a href="//cdn.example/x">p</a>'), '<a href="mailto:a@b.c">m</a><a href="tel:+1">t</a><a href="/rel">r</a><a href="#top">h</a><a href="//cdn.example/x">p</a>');
    assert.equal(s('<a href="ftp://x">f</a><a>no href</a>'), 'fno href');
  });

  it('images: src schemes, alt, title, integer width and height; audio and video get controls', () => {
    assert.equal(s('<img src="a.png" alt="A" title="T" width="10px" height="20" style="x" class="y">'), '<img src="a.png" alt="A" title="T" height="20">');
    assert.equal(s('<img src="data:image/png;base64,iVBORw0KGgo=">'), '<img src="data:image/png;base64,iVBORw0KGgo=">');
    assert.equal(s('<img src="blob:https://x/1">'), '<img src="blob:https://x/1">');
    assert.equal(s('<img src="file:///C:/x.png"><img>'), '');
    assert.equal(s('<audio src="a.mp3" autoplay></audio><video width="320" autoplay muted><source src="v.mp4"></video>'), '<audio controls src="a.mp3"></audio><video controls src="v.mp4" width="320"></video>');
  });

  it('iframes only for embedHosts (exact or *.suffix), never with credentials, other schemes or backslashes', () => {
    const yt = '<iframe src="https://www.youtube-nocookie.com/embed/x" width="560" height="315" allowfullscreen sandbox="" srcdoc="x"></iframe>';
    assert.equal(s(yt), '');
    assert.equal(s(yt, ['www.youtube-nocookie.com']), '<iframe src="https://www.youtube-nocookie.com/embed/x" width="560" height="315" allowfullscreen></iframe>');
    assert.equal(s('<iframe src="https://player.vimeo.com/v/1">fallback</iframe>', ['*.vimeo.com']), '<iframe src="https://player.vimeo.com/v/1"></iframe>');
    assert.equal(embedAllowed('https://www.youtube-nocookie.com@evil.example/', ['www.youtube-nocookie.com']), false);
    assert.equal(embedAllowed('https://evil.example\\@www.youtube-nocookie.com/', ['www.youtube-nocookie.com']), false);
    assert.equal(embedAllowed('https://vimeo.com/x', ['*.vimeo.com']), false);
    assert.equal(embedAllowed('https://www.youtube-nocookie.com:443/x', ['www.youtube-nocookie.com']), true);
    assert.equal(s('<iframe src="//www.youtube-nocookie.com/embed/x"></iframe>', ['www.youtube-nocookie.com']), '');
  });

  it('tables: sections become one tbody, cells keep colspan / rowspan / data-colwidth, variants keep their class', () => {
    assert.equal(
      s('<table class="salmon-rich-text-table--striped x" border="1"><caption>Cap</caption><colgroup><col width="10"></colgroup><thead><tr><th colspan="2" style="x">H</th></tr></thead><tbody><tr><td rowspan="2" data-colwidth="120,80" width="5">a</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot></table>'),
      '<p>Cap</p><table><tbody><tr><th colspan="2">H</th></tr><tr><td rowspan="2" data-colwidth="120,80">a</td></tr><tr><td>f</td></tr></tbody></table>',
    );
    assert.equal(s('<table class="salmon-rich-text-table--bordered"><tr><td>x</td></tr></table>'), '<table class="salmon-rich-text-table--bordered"><tbody><tr><td>x</td></tr></tbody></table>');
    assert.equal(s('<table>text<tr><td>x</td></tr></table>'), 'text<table><tbody><tr><td>x</td></tr></tbody></table>');
    assert.equal(s('<table></table>'), '');
  });

  it('callouts, toggles, figures and mention / label atoms', () => {
    assert.equal(s('<div data-type="callout" data-tone="warning" class="x"><p>c</p></div>'), '<div data-type="callout" data-tone="warning"><p>c</p></div>');
    assert.equal(s('<div data-type="callout" data-tone="pink">c</div>'), '<div data-type="callout" data-tone="info">c</div>');
    assert.equal(s('<details open><summary>S</summary><p>b</p></details>'), '<details open><summary>S</summary><p>b</p></details>');
    assert.equal(s('<details><p>b</p></details>'), '<details><summary></summary><p>b</p></details>');
    assert.equal(s('<figure><p><img src="a.png"></p><figcaption>C <b>b</b></figcaption></figure>'), '<figure><img src="a.png"><figcaption>C <strong>b</strong></figcaption></figure>');
    assert.equal(s('<span data-type="mention" data-id="42" data-trigger="@" class="x">@<b>Alice</b></span>'), '<span data-type="mention" data-id="42" data-trigger="@">@Alice</span>');
    assert.equal(s('<span data-type="label" data-id="bug" data-trigger="#" data-tone="danger">#bug</span>'), '<span data-type="label" data-id="bug" data-trigger="#" data-tone="danger">#bug</span>');
    assert.equal(s('<span data-type="mention">@nobody</span>'), '@nobody');
  });

  it('spans: one validated style property each, mark styles become marks, plain spans unwrap', () => {
    assert.equal(
      s('<span style="font-family:\'Segoe UI\', Arial;font-size:14px;color:#ff0000;background-color:rgb(1, 2, 3);font-weight:700;font-style:italic;text-decoration:underline line-through;vertical-align:super;margin:0">x</span>'),
      '<span style="font-family:\'Segoe UI\', Arial"><span style="font-size:14px"><span style="color:#ff0000"><span style="background-color:rgb(1, 2, 3)"><strong><em><u><s><sup>x</sup></s></u></em></strong></span></span></span></span>',
    );
    assert.equal(s('<span style="color:var(--salmon-danger)">v</span><span style="color:var(--evil)">e</span>'), '<span style="color:var(--salmon-danger)">v</span>e');
    assert.equal(s('<span style="font-size:huge;color:red !important">x</span>'), '<span style="color:red">x</span>');
    assert.equal(s('<span lang="en" class="x">plain</span>'), 'plain');
    assert.equal(s('<b style="font-weight:normal" id="docs-internal-guid-1">not bold</b>'), 'not bold');
    assert.equal(s('<font face="Arial" color="blue" size="7">f</font>'), '<span style="font-family:Arial"><span style="color:blue">f</span></span>');
  });

  it('unwraps unknown elements keeping their text, drops script-like elements with content, removes comments', () => {
    assert.equal(s('<section><article><custom-el>t</custom-el></article></section>'), 't');
    assert.equal(s('<div>inline</div><div><p>block</p></div>'), '<p>inline</p><p>block</p>');
    assert.equal(s('a<script>x</script><style>y</style><template>z</template><noscript>n</noscript><object>o</object><head><title>t</title></head>b<!-- c -->'), 'ab');
    assert.equal(s('<html><body><p>x</p></body></html>'), '<p>x</p>');
    assert.equal(s('<li>stray</li><summary>s</summary><figcaption>f</figcaption><td>c</td>'), '<p>stray</p><p>s</p><p>f</p>c');
  });

  it('normalizes <pre> to one <code> with text only', () => {
    assert.equal(s('<pre><b>x</b><br>y</pre>'), '<pre><code>x\ny</code></pre>');
    assert.equal(s('<pre><code class="language-js" style="x">a &lt; b</code></pre>'), '<pre><code class="language-js">a &lt; b</code></pre>');
    assert.equal(s('<pre><code class="evil x">a</code></pre>'), '<pre><code>a</code></pre>');
  });

  it('data-block-id is validated, and dropped with blockIds: false', () => {
    assert.equal(s('<p data-block-id="ok-1_a:b.c">a</p><p data-block-id="bad id">b</p><span data-block-id="x">c</span>'), '<p data-block-id="ok-1_a:b.c">a</p><p>b</p>c');
    assert.equal(sanitizeHtml('<p data-block-id="x">a</p>', { blockIds: false }), '<p>a</p>');
  });

  it('escapes text always', () => {
    assert.equal(s('&lt;script&gt;alert(1)&lt;/script&gt;'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(s('<p>a & b < c > d</p>'), '<p>a &amp; b &lt; c &gt; d</p>');
  });

  it('is idempotent on valid content', () => {
    const html = '<h1>a</h1><p><strong>b</strong> <a href="https://x" target="_blank" rel="noopener noreferrer">c</a></p><ul data-type="checklist"><li data-checked="true"><p>d</p></li></ul><table><tbody><tr><td>e</td></tr></tbody></table><video controls src="v.mp4"></video>';
    assert.equal(s(html), html);
  });
});

describe('sanitizeUrl', () => {
  it('applies the scheme allow-list per use', () => {
    assert.equal(sanitizeUrl(' https://x.example/a ', 'link'), 'https://x.example/a');
    assert.equal(sanitizeUrl('java\nscript:alert(1)', 'link'), null);
    assert.equal(sanitizeUrl('mailto:a@b', 'image'), null);
    assert.equal(sanitizeUrl('blob:https://x/1', 'media'), 'blob:https://x/1');
    assert.equal(sanitizeUrl('data:image/webp;base64,AA==', 'media'), null);
    assert.equal(sanitizeUrl('data:image/avif;base64,AA==', 'image'), 'data:image/avif;base64,AA==');
    assert.equal(sanitizeUrl('\\\\evil/x', 'link'), null);
    assert.equal(sanitizeUrl('page?x=a:b', 'link'), 'page?x=a:b');
  });
});

describe('sanitize hook: restriction only', () => {
  it('can remove, unwrap and narrow attributes', () => {
    const hook: SanitizeHook = (el) => {
      if (el.tag === 'img') return null;
      if (el.tag === 'u') return 'unwrap';
      if (el.tag === 'a') return { attrs: { href: el.attrs.href as string } };
      return undefined;
    };
    assert.equal(sanitizeHtml('<p><img src="a.png">x<u>u</u><a href="https://x" target="_blank" title="t">l</a></p>', { sanitize: hook }), '<p>xu<a href="https://x">l</a></p>');
  });

  it('cannot add attributes or re-enable refused values', () => {
    const hook: SanitizeHook = (el) => {
      if (el.tag === 'a') return { attrs: { ...el.attrs, href: 'javascript:alert(1)', onclick: 'alert(1)' } };
      if (el.tag === 'p') return { attrs: { onclick: 'alert(1)', style: 'background:url(x)' } };
      if (el.tag === 'span') return { attrs: { style: 'color:expression(alert(1))' } };
      return undefined;
    };
    const out = sanitizeHtml('<p style="text-align:left"><a href="https://x">l</a><span style="color:red">s</span></p>', { sanitize: hook });
    assert.equal(out, '<p>ls</p>');
  });

  it('sees parents before children with the sanitized parent tag, and the result is re-normalized', () => {
    const seen: string[] = [];
    const out = sanitizeHtml('<ul><li>a</li></ul><table><tr><td>x</td></tr></table>', {
      sanitize: (el) => {
        seen.push(`${el.parent ?? '-'}>${el.tag}`);
        return el.tag === 'tr' ? 'unwrap' : undefined;
      },
    });
    assert.deepEqual(seen, ['->ul', 'ul>li', '->table', 'table>tbody', 'tbody>tr', 'tbody>td']);
    assert.equal(out, '<ul><li>a</li></ul><table><tbody><tr><td>x</td></tr></tbody></table>');
  });
});

describe('sanitizeHtml performance', () => {
  const unit = '<p style="text-align:center">Lorem <strong>ipsum</strong> <a href="https://x.example/p?q=1&amp;r=2" target="_blank">dolor</a> sit <span style="color:#336699;font-size:12pt">amet</span>, &amp; <em>consectetur</em> <img src="a.png" alt="x"> &nbsp;elit.<br></p><ul><li>one</li><li>two <code>x</code></li></ul><table><tr><td>a</td><td>b</td></tr></table>';
  const doc = (bytes: number) => unit.repeat(Math.ceil(bytes / unit.length));

  it('sanitizes a 1 MB document well within budget (generous bound: 500 ms) @perf', () => {
    const big = doc(1_000_000);
    assert.ok(big.length >= 1_000_000);
    sanitizeHtml(big);
    const t = performance.now();
    const out = sanitizeHtml(big);
    const ms = performance.now() - t;
    assert.ok(out.length > 500_000);
    assertBudget(ms, 500, 'sanitize 1 MB document', { strict: true });
  });

  it('is not quadratic: 4x the input takes well under 16x the time, also for deep nesting and long attribute runs @perf', () => {
    const time = (html: string) => {
      sanitizeHtml(html);
      const t = performance.now();
      for (let i = 0; i < 3; i++) sanitizeHtml(html);
      return (performance.now() - t) / 3;
    };
    const small = time(doc(250_000));
    const large = time(doc(1_000_000));
    assertBudget(large, small * 10 + 20, 'sanitize 1 MB vs 10x 250 KB plus 20 ms', { strict: true });
    const deep = (n: number) => '<div><span><b>'.repeat(n) + 'x' + '</b></span></div>'.repeat(n);
    const d1 = time(deep(5_000));
    const d4 = time(deep(20_000));
    assertBudget(d4, d1 * 10 + 20, 'sanitize deep nesting 4x vs 10x 1x plus 20 ms', { strict: true });
    const lt = (n: number) => '<'.repeat(n) + '&'.repeat(n) + '<a '.repeat(n);
    const l1 = time(lt(50_000));
    const l4 = time(lt(200_000));
    assertBudget(l4, l1 * 10 + 20, 'sanitize long token runs 4x vs 10x 1x plus 20 ms', { strict: true });
  });
});
