---
title: Inline edit
description: Click-to-edit values - popover or inline editing, click, double-click or edit-button triggers, an async save action with pending, abort and error states, Data Grid validation rules and a ref API.
category: Components
order: 10
demos: [inline-edit, inline-edit-options, inline-edit-api, inline-edit-rich-text]
---

`InlineEdit` from `@salmonui/editors/inline-edit` shows a value as text and
turns it into an editor when the user activates it.

```tsx
import { InlineEdit } from '@salmonui/editors/inline-edit';
import '@salmonui/editors/inline-edit/styles.css';

<InlineEdit
  label="Title"
  value={title}
  save={async (value, { signal }) => {
    await updateTitle(value, { signal });
    setTitle(value);
  }}
  validation={{ required: true, maxLength: [80, 'At most 80 characters'] }}
  placeholder="Untitled"
/>
```

The stylesheet carries the rules of the Save and Cancel `Button`s, so
`inline-edit/styles.css` is the only stylesheet besides
`@salmonui/core/styles.css` (the theme, once per app).

<!-- demo: inline-edit -->

## Display state

The saved value comes from `value` (controlled) or `defaultValue`
(uncontrolled, default `''`). The preview shows `String(value)`;
`renderPreview({ value, placeholder })` replaces it with any React node, for
example a label lookup for a list editor or a unit suffix. An empty
value shows `placeholder`, or `localeText.empty` (`'Empty'`) when no
placeholder is given. Values render as text: there is no HTML
parsing or sanitizer switch (see [Design notes](#design-notes)).

The preview is a `<button>`. With `label`, a visually hidden `label: ` prefix
inside it makes the accessible name "Title: Quarterly report" while the
visible text stays the value.

## Modes and triggers

- `mode="popover"` (default) opens the editor in a
  non-modal dialog anchored to the preview; `mode="inline"` replaces the
  preview with the editor. The popover mounts only while editing and
  never in server HTML. `popoverProps` sets `placement` (default
  `'bottom-start'`, logical `start` / `end` mirror in RTL) and `offset`
  (default 4 px); the popover fades in with one CSS animation that
  `prefers-reduced-motion` turns off. Below 480 px the popover sits
  at the bottom edge of the viewport (CSS only).
- `trigger` is `'click'` (default), `'doubleClick'` or `'editButton'`.
With `'doubleClick'` a single click only focuses the preview;
  Enter or Space still start editing, and on coarse pointers (touch) a
  visible edit button appears. With `'editButton'` the preview is plain text
  and a pencil button labelled "Edit {label}" starts editing.
- `disabled` makes the preview inert (`aria-disabled`, still focusable).
- `editing` / `defaultEditing` / `onEditingChange(editing, { source, reason })`
  control the editing state: `reason` is `'start'`, `'save'` or
  `'cancel'`.

## Editors

`children` is a render prop. It receives `{ value, setValue, inputProps,
save, cancel, pending, errors }`: `value` is the draft,
`inputProps` wires a text-like input (`value`, `onChange`, Enter and Escape
handling, `aria-invalid`, `aria-describedby`, `aria-label`, `readOnly` while
saving, `autoFocus`). Without `children` a text input is rendered.

```tsx
<InlineEdit<number> label="Quantity" mode="inline" defaultValue={3} validation={{ range: [1, 10] }} renderPreview={({ value }) => `${value} pcs`}>
  {({ value, setValue, inputProps }) => (
    <input {...inputProps} type="number" value={String(value)} onChange={(e) => setValue(e.target.valueAsNumber)} />
  )}
</InlineEdit>
```

There is no editor `type` enum: number, date, date-time, time,
date range, dropdown, autocomplete, multi-select, masked, color and slider
editors are compositions through `children`, so
`@salmonui/editors/inline-edit` imports none of them and an application pays
only for the fields it uses:

```tsx
import { NumberField } from '@salmonui/inputs/number-field';

<InlineEdit<number | null> label="Quantity" value={quantity} validation={{ range: [0, 100] }} save={saveQuantity}>
  {({ value, setValue, inputProps: { value: _text, onChange: _change, ...wiring } }) => (
    <NumberField {...wiring} max={100} value={value} onValueChange={setValue} />
  )}
</InlineEdit>
```

| Value | Salmon field | Bind |
| --- | --- | --- |
| Number | `NumberField` | the `inputProps` wiring without `value` / `onChange`, plus `value` and `setValue` |
| Masked text | `MaskedField` | same; the draft is the raw value |
| Date, DateTime | `DatePicker` (`granularity="minute"` for DateTime) | `aria-label`, `value`, `onValueChange` |
| Time | `TimePicker` | `aria-label`, `value`, `onValueChange` |
| Date range | `DateRangePicker` | `aria-label`, `value`, `onValueChange` |
| One or several options from a list | `Select`, `Select multiple` | `aria-label`, `data`, `value`, `onValueChange` |
| Typed text with suggestions | `Combobox` | `aria-label`, `data`, `value`, `onValueChange` |
| Color | `ColorPicker` | `aria-label`, `value`, `onValueChange` |
| Slider | `Slider` | `label` (it names the thumb), `value`, `onValueChange` |

Give only text-like fields the `inputProps` key handler: a picker or dropdown
keeps Enter for its own list or calendar, and the edit is saved with the Save
action or on blur. Focus or a press inside a field's popup does not end the
edit, and Escape closes the open popup first, then cancels the edit.
`ColorPicker` and `DateRangePicker` keep their Apply step by default, so a
pick reaches the draft on Apply. `NumberField` clamps on blur but not on
Enter: pair `max` / `min` with `validation.range` so Enter cannot save an
out-of-range draft.

The rich text editor is `RichTextEditor`
from `@salmonui/rich-text`, bound to the draft, with `RichTextContent` rendering
the stored HTML (sanitized) as the preview. Turn off `saveOnEnter` so Enter
makes new paragraphs, and use `blurAction="keep"` so the editor's own dialogs
and menus do not save:

```tsx
import { InlineEdit } from '@salmonui/editors/inline-edit';
import { RichTextContent, RichTextEditor } from '@salmonui/rich-text';

<InlineEdit<string>
  label="Description"
  value={html}
  save={setHtml}
  saveOnEnter={false}
  blurAction="keep"
  renderPreview={({ value }) => <RichTextContent value={value} />}
>
  {({ value, setValue }) => <RichTextEditor aria-label="Description" defaultValue={value} onChange={setValue} />}
</InlineEdit>
```

<!-- demo: inline-edit-rich-text -->

## Saving, cancelling and blur

- Enter saves (`saveOnEnter`, default true); in a `<textarea>` Enter adds a
  line and Ctrl+Enter / Cmd+Enter saves. Escape cancels.
- `showActions` (default true) shows Save and Cancel buttons labelled from
  `localeText`; `renderActions({ save, cancel, pending })` replaces them.
- `blurAction` decides what focus leaving the editor does: `'save'`
  (default), `'cancel'` or `'keep'`. Tab out of the editor follows
  it too.
- `save(value, { signal })` persists the value and may return a promise.
While it is pending the editor is `aria-busy`, the input
  is read-only, the Save button shows a spinner and a polite status says
  "Saving". Cancelling aborts `signal`, as does unmounting. A rejection keeps
  the editor open with `localeText.saveFailed`, announced politely, and calls
  `onSaveError({ value, error })`. Without `save` the value is saved
  locally (uncontrolled) or reported through `onSave` (controlled).
- `name` renders a hidden input with the saved value, so an enclosing
  `<form>` submits it.

## Validation

`validation` takes the Data Grid `column.validation` vocabulary and is
evaluated by `@salmonui/core/validation`: `required`,
`min`, `max`, `range`, `minLength`, `maxLength`, `rangeLength`, `number`,
`digits`, `email`, `url`, `date`, `dateIso`, `creditcard`, `tel`, `pattern`,
and `validate(value)` (sync or async, returning a message, or null / true
when valid). Each rule value is the argument or `[argument, message]`;
`messages` overrides the defaults. A failing rule blocks the save, shows the
message under the editor and sets `aria-invalid` and `aria-describedby` on
the input.

## Events and ref

Lifecycle events come in before/after pairs; each before event is
cancellable with `event.preventDefault()`:

| Event | When | Payload |
| --- | --- | --- |
| `onBeforeEditStart` / `onEditStart` | editing starts | `{ source }` |
| `onBeforeSave` / `onSave` | after validation / after the value is saved | `{ value, previousValue, source, trigger }` |
| `onBeforeEditCancel` / `onEditCancel` | the edit is discarded | `{ value, source, trigger }` |
| `onDraftChange` | each draft change | `{ value, previousValue }` |
| `onSaveError` | `save` rejected | `{ value, error }` |

`source` is `'pointer' | 'keyboard' | 'touch' | 'api'`; `trigger` is
`'actions' | 'enter' | 'escape' | 'blur' | 'api'`.

`ref` receives an `InlineEditApi` with the Data Grid method names: `startEdit()`, `save()` (resolves to whether the value was saved),
`cancelEdit()`, `validate()` (resolves to the error list) and `element` (the
root `<span>`).

<!-- demo: inline-edit-api -->

## Keyboard and accessibility

| Key | Action |
| --- | --- |
| Enter, Space on the preview or edit button | Start editing; focus moves into the editor |
| Enter | Save (Ctrl+Enter / Cmd+Enter in a textarea) |
| Escape | Cancel; focus returns to the preview |
| Tab | Moves focus; leaving the editor applies `blurAction` |

Focus returns to the preview after a save or cancel from the keyboard or the
buttons. The popover is a dialog labelled with `label`. Axe and ARIA
snapshots run in light, dark and RTL.

## Styling, RTL and localization

`className` and `style` go to the root `<span class="salmon-inline-edit">`;
`classNames` / `styles` reach the `preview`, `editor`, `actions` and `error`
parts. Direction is inherited: the actions sit at the
inline end and the popover carries the direction it was opened in.
`localeText` overrides `save`, `cancel`, `edit`, `empty`, `saving` and
`saveFailed` (`INLINE_EDIT_DEFAULT_LOCALE_TEXT` holds the English
defaults).

The root is a `<span>`, so an `InlineEdit` may sit inside a paragraph. The
server renders the preview and hidden input only; the editor mounts on the
client when editing starts (or in server HTML with `mode="inline"` and
`defaultEditing`), with no hydration difference. An idle page of
1,000 `InlineEdit`s mounts no editor and no popover.

<!-- demo: inline-edit-options -->

## Design notes

- There is no built-in submit URL: Salmon UI prescribes no backend
  protocol, so saving is the `save(value, { signal })` action, which can
  call `fetch`, a server action or a data source, for example
  `save={(value) => fetch(url, { method: 'POST', body: JSON.stringify({ id, [name]: value }) })}`.
  React to the outcome in `onSave` / `onSaveError`.
- There are no lifecycle events or teardown method: React owns
  mount and unmount, so lifecycle events would duplicate effects; use an
  effect or a ref callback, and unmount the component to remove it.
- There is no HTML parse or sanitize option: values never render as
  HTML strings, so there is no parse or sanitize switch to get wrong; build
  rich display in `renderPreview`, which returns a React node (for stored
  HTML, `RichTextContent` as in the rich text example above).
- There is no built-in persistence: components never write to `localStorage` on
  their own, because hidden persistence breaks server rendering
  consistency; pass a controlled `value` and persist it from `onSave`.

## API reference

[`@salmonui/editors/inline-edit`](/docs/reference/editors/inline-edit) lists
every prop, event payload and type, including `InlineEditApi` and
`INLINE_EDIT_DEFAULT_LOCALE_TEXT`.
