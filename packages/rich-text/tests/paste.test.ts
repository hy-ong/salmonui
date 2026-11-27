// Paste cleanup: Word and Google Docs clipboard HTML into the
// shared vocabulary, the four modes, tag and attribute filters, plain text.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanPastedHtml, detectPasteSource, pasteNeedsPrompt, plainTextToHtml, htmlToText } from '@salmonui/rich-text';

// Word for Windows (desktop) clipboard HTML, trimmed from a real copy: header
// with Office namespaces and a style sheet, StartFragment markers, MsoNormal
// paragraphs, mso styles, o:p, a bulleted list with a nested level (both the
// downlevel-revealed `<![if !supportLists]>` and the comment form), a
// numbered list, a hyperlink, a table and a heading.
const WORD = `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=ProgId content=Word.Document><meta name=Generator content="Microsoft Word 15">
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->
<style><!-- p.MsoNormal {margin:0in; font-size:11.0pt; font-family:"Calibri",sans-serif;} @list l0:level1 {mso-level-number-format:bullet;} --></style></head>
<body lang=EN-US link="#0563C1" vlink="#954F72" style='tab-interval:.5in;word-wrap:break-word'>
<!--StartFragment-->
<h1 style='margin-top:12.0pt'><span style='mso-fareast-font-family:"Times New Roman"'>Quarterly report<o:p></o:p></span></h1>
<p class=MsoNormal><b><span style='font-size:12.0pt;color:#C00000'>Bold red</span></b><span style='font-size:12.0pt'> and <i>italic</i> and <u>underlined</u> text.<o:p></o:p></span></p>
<p class=MsoNormal style='text-align:center'><span style='font-family:"Segoe UI",sans-serif;mso-bidi-font-family:Arial'>Centered</span><o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-fareast-font-family:Symbol;mso-bidi-font-family:Symbol'><span style='mso-list:Ignore'>\u00b7<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>First bullet<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-add-space:auto;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>Nested bullet<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><!--[if !supportLists]--><span style='font-family:Symbol'><span style='mso-list:Ignore'>\u00b7<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span></span><!--[endif]-->Second bullet<o:p></o:p></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>Step one<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;text-indent:-.25in;mso-list:l1 level2 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>a.<span>&nbsp;&nbsp; </span></span><![endif]>Sub step<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>2.<span>&nbsp;&nbsp; </span></span><![endif]>Step two<o:p></o:p></p>
<p class=MsoNormal>See <a href="https://example.com/report"><span style='color:#0563C1'>the report</span></a>.<o:p></o:p></p>
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;mso-yfti-tbllook:1184'>
 <tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'><td width=312 valign=top style='width:233.75pt;padding:0in 5.4pt 0in 5.4pt'><p class=MsoNormal><b>Q1</b><o:p></o:p></p></td><td width=312 valign=top><p class=MsoNormal>42<o:p></o:p></p></td></tr>
</table>
<p class=MsoNormal><![if !vml]><img width=64 height=32 src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png" v:shapes="Picture_x0020_1"><![endif]><o:p></o:p></p>
<!--EndFragment-->
</body></html>`;

// Google Docs clipboard HTML (Chrome), trimmed from a real copy.
const GDOCS =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-7a1b2c3d-7fff-4e5f-a6b7-1234567890ab">' +
  '<h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"><span style="font-size:16pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Heading</span></h2>' +
  '<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Bold</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:italic;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> italic</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#ff0000;background-color:#ffff00;font-weight:400;font-style:normal;font-variant:normal;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> red</span><span style="font-size:6.6pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;vertical-align:super;white-space:pre-wrap;">2</span></p>' +
  '<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial,sans-serif;color:#000000;" aria-level="1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation"><span style="font-size:11pt;font-family:Arial,sans-serif;font-weight:400;">One</span></p></li>' +
  '<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:circle;" aria-level="2"><p dir="ltr" role="presentation"><span style="font-weight:400;">One A</span></p></li></ul>' +
  '<li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" role="presentation"><span style="font-weight:400;">Two</span></p></li></ul>' +
  '<ul style="margin-top:0;margin-bottom:0;"><li dir="ltr" role="checkbox" aria-checked="true" style="list-style-type:none;" aria-level="1"><p dir="ltr" role="presentation"><span>Done</span></p></li><li dir="ltr" role="checkbox" aria-checked="false" aria-level="1"><p dir="ltr" role="presentation"><span>Todo</span></p></li></ul>' +
  '<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><a href="https://www.google.com/url?q=https://example.com&amp;sa=D" style="text-decoration:none;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#1155cc;background-color:transparent;font-weight:400;text-decoration:underline;-webkit-text-decoration-skip:none;vertical-align:baseline;white-space:pre-wrap;">a link</span></a></p>' +
  '<div dir="ltr" style="margin-left:0pt;" align="left"><table style="border:none;border-collapse:collapse;"><colgroup><col width="100"><col width="100"></colgroup><tbody><tr style="height:0pt"><td style="border-left:solid #000000 1pt;vertical-align:top;padding:5pt 5pt 5pt 5pt;overflow:hidden;overflow-wrap:break-word;"><p dir="ltr" style="line-height:1.2;margin-top:0pt;margin-bottom:0pt;"><span style="font-weight:400;">c1</span></p></td><td><p dir="ltr"><span style="font-weight:400;">c2</span></p></td></tr></tbody></table></div>' +
  '</b><br class="Apple-interchange-newline">';

describe('detectPasteSource / pasteNeedsPrompt', () => {
  it('detects Word and Google Docs clipboard HTML', () => {
    assert.equal(detectPasteSource(WORD), 'word');
    assert.equal(detectPasteSource('<p class="MsoNormal">x</p>'), 'word');
    assert.equal(detectPasteSource(GDOCS), 'googleDocs');
    assert.equal(detectPasteSource('<p>plain <b>html</b></p>'), 'html');
  });

  it("'prompt' asks only for formatted HTML; the editor then passes the chosen mode", () => {
    assert.equal(pasteNeedsPrompt('<p>x</p>', { mode: 'prompt' }), true);
    assert.equal(pasteNeedsPrompt('just text', { mode: 'prompt' }), false);
    assert.equal(pasteNeedsPrompt('<p>x</p>', { mode: 'clean' }), false);
    assert.equal(cleanPastedHtml('<p><span style="color:red">x</span></p>', { mode: 'prompt' }), cleanPastedHtml('<p><span style="color:red">x</span></p>', { mode: 'clean' }));
  });
});

describe('cleanPastedHtml: Word', () => {
  it("'clean' keeps structure, marks, links and tables; Word lists become nested ul / ol; mso, o:p, classes and local images go", () => {
    const out = cleanPastedHtml(WORD, { mode: 'clean' });
    assert.doesNotMatch(out, /mso|Mso|o:p|<!--|xml|class=|style="(?!list-style-type)|file:|\u00b7|Symbol/);
    assert.match(out, /^<h1>Quarterly report<\/h1>/);
    assert.match(out, /<p><strong>Bold red<\/strong> and <em>italic<\/em> and <u>underlined<\/u> text\.<\/p>/);
    assert.match(out, /<p>Centered<\/p>/);
    assert.match(out, /<ul><li><p>First bullet<\/p><ul><li><p>Nested bullet<\/p><\/li><\/ul><\/li><li><p>Second bullet<\/p><\/li><\/ul>/);
    assert.match(out, /<ol><li><p>Step one<\/p><ol style="list-style-type:lower-alpha"><li><p>Sub step<\/p><\/li><\/ol><\/li><li><p>Step two<\/p><\/li><\/ol>/);
    assert.match(out, /<p>See <a href="https:\/\/example\.com\/report">the report<\/a>\.<\/p>/);
    assert.match(out, /<table><tbody><tr><td><p><strong>Q1<\/strong><\/p><\/td><td><p>42<\/p><\/td><\/tr><\/tbody><\/table>/);
    assert.doesNotMatch(out, /<img/);
  });

  it("'keep' also keeps validated fonts, sizes, colors and alignment", () => {
    const out = cleanPastedHtml(WORD, { mode: 'keep' });
    assert.match(out, /<strong><span style="font-size:12\.0pt"><span style="color:#C00000">Bold red<\/span><\/span><\/strong>/);
    assert.match(out, /<p style="text-align:center"><span style="font-family:&quot;Segoe UI&quot;, sans-serif">Centered<\/span><\/p>/);
    assert.doesNotMatch(out, /mso|tab-interval|text-indent|margin/);
    // The link color is office link styling, not formatting.
    assert.match(out, /<a href="https:\/\/example\.com\/report">the report<\/a>/);
  });

  it('keepWordFormatting keeps the Word formatting in clean mode', () => {
    assert.equal(cleanPastedHtml(WORD, { mode: 'clean', keepWordFormatting: true }), cleanPastedHtml(WORD, { mode: 'keep' }));
  });

  it('numbered Word lists keep their start number and roman / alpha styles', () => {
    const html = "<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>iii.<span>&nbsp; </span></span>Third</p><p class=MsoListParagraph style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>iv.<span>&nbsp; </span></span>Fourth</p><p class=MsoListParagraph style='mso-list:l2 level1 lfo3'><span style='mso-list:Ignore'>C)<span>&nbsp; </span></span>Gamma</p>";
    assert.equal(cleanPastedHtml(html), '<ol start="3" style="list-style-type:lower-roman"><li><p>Third</p></li><li><p>Fourth</p></li></ol><ol start="3" style="list-style-type:upper-alpha"><li><p>Gamma</p></li></ol>');
  });
});

describe('cleanPastedHtml: Google Docs', () => {
  it("'clean': the guid wrapper is not bold, styled spans become marks, nested lists move into items, checkboxes become a checklist", () => {
    const out = cleanPastedHtml(GDOCS, { mode: 'clean' });
    assert.doesNotMatch(out, /docs-internal-guid|style=|dir=|role=|aria-/);
    assert.match(out, /^<h2>Heading<\/h2>/);
    assert.match(out, /<p><strong>Bold<\/strong><em> italic<\/em><u> red<\/u><sup>2<\/sup><\/p>/);
    assert.match(out, /<ul><li><p>One<\/p><ul><li><p>One A<\/p><\/li><\/ul><\/li><li><p>Two<\/p><\/li><\/ul>/);
    assert.match(out, /<ul data-type="checklist"><li data-checked="true"><p>Done<\/p><\/li><li data-checked="false"><p>Todo<\/p><\/li><\/ul>/);
    assert.match(out, /<p><a href="https:\/\/www\.google\.com\/url\?q=https:\/\/example\.com&amp;sa=D">a link<\/a><\/p>/);
    assert.match(out, /<table><tbody><tr><td><p>c1<\/p><\/td><td><p>c2<\/p><\/td><\/tr><\/tbody><\/table>/);
    assert.doesNotMatch(out, /<strong>(?:Heading|One|Two|c1)/);
  });

  it("'keep' keeps the validated span styles one per span", () => {
    const out = cleanPastedHtml(GDOCS, { mode: 'keep' });
    assert.match(out, /<span style="font-family:Arial, sans-serif"><span style="font-size:11pt"><span style="color:#ff0000"><span style="background-color:#ffff00"><u> red<\/u><\/span><\/span><\/span><\/span>/);
    assert.match(out, /<p style="line-height:1\.38">/);
    assert.doesNotMatch(out, /white-space|font-variant|margin|padding/);
  });
});

describe('cleanPastedHtml: modes and filters', () => {
  it("'plainText' keeps only text, one paragraph per block and line breaks", () => {
    assert.equal(cleanPastedHtml('<h1>T</h1><p>a <b>b</b><br>c</p><ul><li>x</li></ul><script>s</script>', { mode: 'plainText' }), '<p>T</p><p>a b<br>c</p><p>x</p>');
    const out = cleanPastedHtml(WORD, { mode: 'plainText' });
    assert.match(out, /^<p>Quarterly report<\/p><p>Bold red and italic and underlined text\.<\/p><p>Centered<\/p><p>First bullet<\/p><p>Nested bullet<\/p>/);
    assert.doesNotMatch(out, /<(?!\/?p>|br>)/);
  });

  it('allowedTags / deniedTags unwrap (text kept); b and i name the vocabulary marks', () => {
    assert.equal(cleanPastedHtml('<h2>h</h2><p><b>b</b> <i>i</i> <u>u</u></p>', { allowedTags: ['p', 'b', 'i'] }), 'h<p><strong>b</strong> <em>i</em> u</p>');
    assert.equal(cleanPastedHtml('<p><b>b</b> <a href="https://x">l</a></p>', { deniedTags: ['a', 'strong'] }), '<p>b l</p>');
  });

  it('allowedAttributes / deniedAttributes; dropping href unwraps the link', () => {
    assert.equal(cleanPastedHtml('<p style="text-align:right"><a href="https://x" title="t" target="_blank">l</a></p>', { mode: 'keep', allowedAttributes: ['href'] }), '<p><a href="https://x">l</a></p>');
    assert.equal(cleanPastedHtml('<p><a href="https://x" title="t">l</a><img src="a.png" alt="A"></p>', { deniedAttributes: ['title', 'alt'] }), '<p><a href="https://x">l</a><img src="a.png"></p>');
    assert.equal(cleanPastedHtml('<p><a href="https://x">l</a></p>', { deniedAttributes: ['href'] }), '<p>l</p>');
  });

  it('every mode is sanitized and block ids from the clipboard are dropped', () => {
    for (const mode of ['keep', 'clean', 'plainText', 'prompt'] as const) {
      const out = cleanPastedHtml('<p data-block-id="b1" onclick="x"><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><script>alert(1)</script></p>', { mode });
      assert.doesNotMatch(out, /onerror|onclick|javascript|script|data-block-id/, mode);
    }
  });

  it('a user sanitize hook runs after the filters', () => {
    assert.equal(cleanPastedHtml('<p><u>u</u> <s>s</s></p>', { deniedTags: ['u'], sanitize: (el) => (el.tag === 's' ? null : undefined) }), '<p>u </p>');
  });
});

describe('plainTextToHtml / htmlToText', () => {
  it('paragraphs on blank lines, <br> on single newlines, escaped, spaces kept', () => {
    assert.equal(plainTextToHtml('Line 1\nLine 2\n\n  <b>x</b> &  y\r\n\r\n\n'), '<p>Line 1<br>Line 2</p><p>&nbsp;&nbsp;&lt;b&gt;x&lt;/b&gt; &amp; &nbsp;y</p>');
    assert.equal(plainTextToHtml(''), '');
    assert.equal(plainTextToHtml('a\tb'), '<p>a&nbsp;&nbsp;&nbsp;&nbsp;b</p>');
  });

  it('htmlToText counts what renders: blocks, breaks, cells, mentions; collapses whitespace outside pre', () => {
    assert.equal(htmlToText('<h1> Title </h1><p>a  <b>b</b>\n c<br>d</p><p></p><ul><li><p>x</p><ul><li>y</li></ul></li></ul><pre>  keep\n  this</pre><table><tr><td>1</td><td><p>2</p></td></tr></table><p><span data-type="mention" data-id="1" data-trigger="@">@Ann</span></p><script>no</script>'), 'Title\na b c\nd\n\nx\ny\n  keep\n  this\n1\t2\n@Ann');
    assert.equal(htmlToText('<p>a</p><p>b</p>', { blockSeparator: '\n\n' }), 'a\n\nb');
    assert.equal(htmlToText(''), '');
  });
});
