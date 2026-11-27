---
title: HTML Sanitizer and Paste Cleanup
description: The always-on, server-safe allow-list sanitizer of the rich text editors, its restriction-only hook, and paste cleanup for Word, Google Docs and plain text.
category: Guides
order: 40
demos: [rich-text-paste]
---

Every HTML string that enters or leaves `RichTextEditor`, `BlockEditor` and
`RichTextContent` goes through one sanitizer. It is always on and
cannot be turned off. It is a pure function from `@salmonui/rich-text`: no
DOM, no dependencies, linear in the input size (a 1 MB document in about
40 ms), and the same on the server and in the browser.

```ts
import { sanitizeHtml } from '@salmonui/rich-text';

sanitizeHtml('<p onclick="x">Hi <b>there</b><script>alert(1)</script></p>');
// '<p>Hi <strong>there</strong></p>'
```

<!-- demo: rich-text-paste -->

## What survives

The allow-list is exactly the editors' vocabulary:

- Blocks: `p`, `h1`..`h6` (with `text-align`, `line-height` and
  `data-indent`), `blockquote`, `hr`, `pre` with one `code`
  (`class="language-*"`), `ul` / `ol` (`start`, `list-style-type`),
  checklists (`ul data-type="checklist"`, `li data-checked`), `figure` with
  `img` and `figcaption`, `audio`, `video`, tables (`td` / `th` with
  `colspan`, `rowspan`, `data-colwidth`; sections become one `<tbody>`),
  callouts (`div data-type="callout" data-tone`), toggles (`details` /
  `summary`).
- Inline: `strong`, `em`, `u`, `s`, `sub`, `sup`, `code`, `mark`, `br`, `a`
  (`href`, `title`, `target="_blank"` with `rel="noopener noreferrer"`
  added), `img` (`src`, `alt`, `title`, integer `width` / `height`), spans
  with one of `font-family`, `font-size`, `color`, `background-color`, and
  mention and label atoms.
- Block ids (`data-block-id`) for `BlockEditor`.

Everything else is removed. Unknown elements are unwrapped and keep their
text; `script`, `style`, `template`, `noscript`, `iframe` (unless its host is
in `embedHosts`), `object`, `embed`, `svg`, `math`, `head`, `title`, form
controls and `select` go with their content. Comments, event handlers and
any other attribute are dropped. `b`, `i`, `del`, `strike`, `ins` and `font`
become their vocabulary equivalents, and `font-weight`, `font-style`,
`text-decoration` and `vertical-align` styles become marks.

URLs: links allow `http`, `https`, `mailto`, `tel`, relative URLs and `#`;
images also `blob:` and `data:image/(png|jpeg|gif|webp|avif)`; audio and
video `blob:`. Whitespace, tabs, newlines and character references are
resolved first, as the browser does, so `jav&#x09;ascript:` or
`&#106;avascript:` are recognized and refused. Style values are validated per
property (colors as hex, `rgb()`, `hsl()`, names or `var(--salmon-*)`;
lengths in `px`, `em`, `rem`, `pt` or `%`; font names only); `url()`,
`expression()`, escapes and comments never pass. Text is always escaped, and
the output re-parses to itself (`sanitizeHtml(sanitizeHtml(x)) ===
sanitizeHtml(x)`), so there is no mutation XSS through a second parse.

`sanitizeUrl(url, 'link' | 'image' | 'media' | 'embed')` exposes the URL
rules on their own, for example to validate a link field.

## Extending it: the `sanitize` hook

`sanitize` runs after the built-in rules,
on every element of the sanitized tree, parents before children. It can only
remove or further restrict content:

```ts
import type { SanitizeHook } from '@salmonui/rich-text';

const noImagesNoNewWindows: SanitizeHook = (element) => {
  if (element.tag === 'img') return null;          // remove with content
  if (element.tag === 'u') return 'unwrap';        // keep the text
  if (element.tag === 'a') return { attrs: { href: element.attrs.href! } }; // drop target and title
  return undefined;                                // keep
};

<RichTextEditor sanitize={noImagesNoNewWindows} />
```

The hook sees a frozen copy (`tag`, `attrs`, `parent`). A returned `attrs`
may only keep names the element already has, and every value is validated
again by the built-in rules: a hook cannot add an `onclick` or turn a link
into `javascript:`. Pass the same hook to the editors, `RichTextContent` and
`sanitizeHtml`, and keep it stable.

## Paste cleanup

`pasteCleanup` on both editors decides what pasted HTML keeps:

| `mode` | Keeps |
| --- | --- |
| `'clean'` (default) | Structure, marks and links; drops fonts, sizes, colors and alignment |
| `'keep'` | Everything the vocabulary allows, validated |
| `'plainText'` | Text only: paragraphs and line breaks |
| `'prompt'` | Asks each time (keep, clean or plain text) |

`allowedTags` / `deniedTags` (vocabulary names: `strong`, not `b`) unwrap
other elements, keeping their text; `allowedAttributes` /
`deniedAttributes` remove attributes (`style` counts as one; a link without
`href` is unwrapped). `keepWordFormatting: true` keeps Word and Google Docs
formatting in `'clean'` mode.

Word content (desktop and online) is normalized: `mso-*` styles, `o:p`,
`Mso*` classes, conditional comments and VML go, and list paragraphs
(`MsoListParagraph` with `mso-list` levels) become real nested `ul` / `ol`
with their start number and numbering style. Google Docs content loses the
`docs-internal-guid` wrapper, its styled spans become marks, nested lists
move into their items, and checkbox lists become checklists. Office link
styling (blue, underlined) is not kept as an underline.

The same functions work outside the editors, for an import pipeline or a
server:

```ts
import { cleanPastedHtml, detectPasteSource, pasteNeedsPrompt, plainTextToHtml, htmlToText } from '@salmonui/rich-text';

detectPasteSource(html);                        // 'word' | 'googleDocs' | 'html'
cleanPastedHtml(html, { mode: 'clean', deniedTags: ['table'] });
plainTextToHtml('Line 1\nLine 2\n\nNext');      // '<p>Line 1<br>Line 2</p><p>Next</p>'
htmlToText('<p>a</p><ul><li>b</li></ul>');      // 'a\nb' (what the character count counts)
```

With `mode: 'prompt'` an editor calls `pasteNeedsPrompt(html, options)`,
asks, and passes the chosen mode; `cleanPastedHtml` itself never asks and
treats `'prompt'` as `'clean'`. Every mode ends in the sanitizer.
