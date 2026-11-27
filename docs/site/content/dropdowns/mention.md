---
title: Mention
description: Mention over a textarea or an input - several trigger characters, a suggestion list at the caret, keyboard selection, plain-text insertion that keeps undo, IME-safe detection and remote suggestions.
category: Components
order: 50
demos: [mention, mention-remote, mention-options, mention-editor]
---

`Mention` from `@salmonui/dropdowns/mention` adds `@` mentions (or `#` tags, or
any other trigger) to a plain `<textarea>` or `<input>`. Wrap the
field, or pass a ref to it as `target`:

```tsx
import { Mention } from '@salmonui/dropdowns/mention';
import '@salmonui/dropdowns/mention/styles.css';

<Mention data={people}>
  <textarea aria-label="Comment" />
</Mention>

// or, when the field lives elsewhere in the tree
<textarea ref={commentRef} aria-label="Comment" />
<Mention data={people} target={commentRef} />
```

The field stays your element: `Mention` never clones it, so its own props,
`onChange` and a controlled `value` work as usual. The server renders a
`<div class="salmon-mention">` around the children (or nothing with
`target`); the suggestion list mounts only after typing and is never part of
the server markup. `className`, `style` and the `root` part go to that
`<div>`; `ref` receives it. `target` does not accept a CSS selector string:
a selector resolves outside React's
tree, has no document on the server and can attach to the wrong element.
Wrap the field, or pass a ref to it as `target`.

`Mention` has no value of its own: the text belongs to the field, so
controlled (`value` plus `onChange`) and uncontrolled (`defaultValue`) fields
both work, and insertions reach them as typed input (see Inserting).
Every prop is listed in the
[API reference](/docs/reference/dropdowns/mention).

<!-- demo: mention -->

## Triggers

`triggers` lists the trigger characters, `[{ char: '@' }]` by default.
Each trigger can bring its own `data`; triggers without it use
the `data` prop:

```tsx
<Mention
  triggers={[
    { char: '@', data: people },
    { char: '#', data: tags, keepChar: true, suffix: ' ' },
  ]}
>
  <textarea aria-label="Comment" />
</Mention>
```

- `keepChar` keeps the trigger character in the inserted text (default
  `false`).
- `suffix` is appended after the insertion, such as `' '` or `'\n'`
  (default `''`).
- `requireLeadingSpace` (default `true`) only counts a trigger at the start
  of the text or after whitespace, so `name@example.com` opens nothing.
- `multiWord` lets the search text contain spaces (default
  `false`). A line break always ends the
  search, and a space after a search that matches nothing turns it back
  into plain text.

## Searching

The text typed after the trigger filters the list.
`searchOperator` is `'contains'` by default, or
`'startsWith'`, `'endsWith'` or a predicate `(item, text) => boolean`;
`matchCase` and `ignoreAccents` work as in the other dropdowns.

- `minSearchLength` holds the list until that many characters follow the
  trigger (default 0: the list opens on the trigger
  itself).
- `maxResults` caps the list (default 25).
- `highlightMatches` wraps the matched text of each suggestion in
  `<mark class="salmon-mention-mark">` (the row closes with the shared highlight).
- `onSearchChange({ text, trigger })` reports each search text.

Items default to `{ value, label, disabled }`; a string or number is its
own value and label. `getItemLabel`, `getItemValue` and `isItemDisabled`
read other shapes, and `renderItem({ item, label, active, disabled,
matches, trigger })` renders the content of an option. Disabled items are
shown but skipped by the arrow keys and cannot be inserted.

## Inserting

Enter, Tab or a click inserts the active suggestion: the trigger and the
search text are replaced by `getInsertText(item, trigger)` (the item label
by default), with the trigger kept
when `keepChar` is set and the `suffix` after it, and the caret moves after
the inserted text. The text is inserted as if typed
(`execCommand('insertText')`, with a `setRangeText` fallback), so the
field fires `input`, a controlled field's `onChange` sees the new value, and
Ctrl+Z (Cmd+Z) undoes the insertion. The inserted text is plain;
for mention chips use a contenteditable target (below).

`onBeforeInsert` runs first and cancels the insertion with
`event.preventDefault()` (the list stays open); `onInsert({ item, text,
trigger, source })` reports the insertion. `onOpenChange(open, { reason, source })` reports the
list opening and closing (`'trigger'`, `'insert'`, `'escape'`, `'tab'`,
`'outside'`, `'blur'`, `'caret'`).

There is no method that runs a positioned search: it would
duplicate what typing the
trigger does, and the popup position comes from the caret. To open the list
from code, insert the trigger (and any search text) at the caret, for
example `setRangeText('@a')` plus an `input` event, which also places the
list correctly.

## Contenteditable target

`Mention` also attaches to a rich text surface through `editor` instead of a
field. An editor target reads the text of the current text block
up to the caret, gives the caret rectangle for the list, and inserts the
mention as an atom: a non-editable chip, with the caret restored after it.
`createContentEditableMentionTarget(element)` from `@salmonui/rich-text`
builds one for a plain `contenteditable` element (no editing engine is
loaded); `RichTextEditor` and `BlockEditor` build their own over the
engine through their `mentions` prop.

```tsx
import { Mention, type MentionEditorTarget } from '@salmonui/dropdowns/mention';
import { createContentEditableMentionTarget } from '@salmonui/rich-text';

const ref = useRef<HTMLDivElement>(null);
const [editor, setEditor] = useState<MentionEditorTarget | null>(null);
useEffect(() => setEditor(createContentEditableMentionTarget(ref.current!)), []);

<div ref={ref} role="textbox" aria-multiline="true" aria-label="Comment" contentEditable />
<Mention editor={editor} data={people} />
```

The host gives the element `role="textbox"` and a label; `Mention` adds the
same combobox attributes as on a field while the list is open. The chip is a
`<span class="salmon-mention-chip" contenteditable="false"
data-mention-value data-mention-trigger>` followed by the trigger's `suffix`
(a no-break space when it has none, so the caret has somewhere to sit);
Backspace removes the chip as one unit. The second argument of
`createContentEditableMentionTarget` changes the chip: `chipClassName`,
`spacer` (the text used when there is no suffix) or `createChip(insertion,
document)` to build the element yourself. Keys the open list handles are taken in the capture phase, so
the editor never sees them. Keep the target object stable; `editor={null}`
means it is not created yet and renders nothing. A custom engine implements
`MentionEditorTarget` (`element`, `getTextBeforeCaret()`, `getCaretRect(offset)`,
`insertMention(insertion)`, `subscribe(listener)`) itself.

<!-- demo: mention-options -->

<!-- demo: mention-editor -->

## Popup position

The list opens at the caret of the trigger character: a hidden
mirror element copies the field's box and text styles to find where the
trigger sits, once per trigger, and the list is placed below that line, or
above it when there is no room below, then shifted to stay on screen. It
does not move while the search text grows, follows the field when the page
or the field scrolls, and aligns to the right edge of the caret under
`dir="rtl"`. With an `<input>` the list opens below the field, at the
trigger's horizontal position. The list renders in a portal inside the
closest theme scope (or `container`); it never takes focus.

## Keyboard and accessibility

While the list is open:

| Key | Action |
| --- | --- |
| Arrow Down / Arrow Up | Next / previous enabled suggestion, wrapping |
| Enter | Inserts the active suggestion |
| Tab | Inserts the active suggestion and keeps focus in the field |
| Escape | Closes the list; typing on in the same mention does not reopen it |

Other keys edit the text as usual; moving the caret out of the mention,
clicking elsewhere or leaving the field closes the list.

The field keeps its own role. While the list is open it carries
`aria-autocomplete="list"`, `aria-controls` (the popup) and
`aria-activedescendant` (the active option), and the list is a
`role="listbox"` named by `localeText.listLabel` whose options carry
`aria-selected` and `aria-disabled`. `aria-expanded` is not set, because a
textbox does not support it. Loading, empty and error states are
`role="status"` or `role="alert"` messages inside the popup. The
`localeText` texts (`listLabel`, `noResults`, `loading`, `loadError`)
default to `MENTION_DEFAULT_LOCALE_TEXT`.

Input methods (IME) are safe: while a composition is in progress
nothing is detected or searched, and the keys that commit a composition
never insert a suggestion; detection runs on `compositionend`, so a
full-width `＠` that commits as `@` opens the list.

## Remote suggestions

A trigger's `data` (or the `data` prop) can be any `@salmonui/data` source,
or another object with the structural `read(request)` of the data source
contract. The search text is sent as `query.search` (over `searchFields`,
`['label']` by default, with the operator, `matchCase` and `ignoreAccents`) and `maxResults` as the `range`.
Reads wait `debounce` milliseconds (300 by default); each new search aborts
the previous request through its `AbortSignal`, and an older response never
replaces a newer one. The popup shows `renderLoading()` while a read is
pending (with `aria-busy`), `renderError({ error })` and `onLoadError` when
it fails, and `renderEmpty()` when nothing matches.

<!-- demo: mention-remote -->

## Styling

`@salmonui/dropdowns/mention/styles.css` (or the package aggregate
`@salmonui/dropdowns/styles.css`) styles the popup with the theme colors. The
classes are `.salmon-mention` (root), `.salmon-mention-popup`,
`.salmon-mention-list`, `.salmon-mention-option` (with `data-active` and
`data-disabled`), `.salmon-mention-mark`, `.salmon-mention-status` and the
contenteditable `.salmon-mention-chip`;
`classNames` and `styles` reach the `root`, `popup`, `list` and `option`
parts. Mention has no `size` prop: it wraps your own `<textarea>`,
`<input>` or editable element, which keeps its own size (for example a
`TextField` with `size`).
