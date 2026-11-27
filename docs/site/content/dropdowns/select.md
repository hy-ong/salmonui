---
title: Select
description: The select-only dropdown from @salmonui/dropdowns/select, with search, forms, events, a lazy popup and an adaptive sheet mode.
category: Components
order: 10
demos: [select-basics, select-events, control-sizes]
---

`Select` is the WAI-ARIA APG
select-only combobox: a native `<button type="button" role="combobox">` owns
focus and the keyboard, and the popup is a `role="listbox"` driven through
`aria-activedescendant`, so focus never leaves the
trigger. `aria-controls` names the listbox while it is open.

```tsx
import { Select } from '@salmonui/dropdowns/select';
import '@salmonui/dropdowns/select/styles.css';

<label id="fruit-label">Fruit</label>
<Select aria-labelledby="fruit-label" data={fruits} defaultValue="kiwi" placeholder="Pick a fruit" />
```

<!-- demo: select-basics -->

## Value and events

`value` / `defaultValue` / `onValueChange(value, event)` is the
[components triad](/docs/buttons/toggle-button): `value` is one item value
or `null` (a controlled empty selection); leave `value` out and pass
`defaultValue` for an uncontrolled Select.

```tsx
const [fruit, setFruit] = useState<string | number | null>('kiwi');
<Select aria-label="Fruit" data={fruits} value={fruit} onValueChange={(next) => setFruit(next)} />
```

The event is frozen:
`{ source, reason, previousValue, items }` with `source` `'pointer'`,
`'keyboard'`, `'touch'` or `'api'`, `reason` `'select'`, `'clear'` or
`'reset'`, and `items` read lazily. There is no cancellable
`select` event: a controlled `value` vetoes a change by not updating.
`open` / `defaultOpen` / `onOpenChange(open, event)` open and
close the popup from code and report every open and close; `event.reason` is `'trigger'`, `'keyboard'`,
`'type'`, `'select'`, `'escape'`, `'outside'`, `'tab'` or `'blur'`.

`ref` receives the trigger button (`ref.current.focus()` focuses it), and `onFocus` / `onBlur` and every other DOM prop reach it.
With remote `data` the list shows a spinner and
`aria-busy` while a read is pending; `loading` forces that state.
While loading, the trigger shows a spinner in place of the
chevron (also while closed) and is `aria-busy`; a forced `loading` shows
the loading row over existing items too.

Three kinds of API are not offered:

- Lifecycle events: React owns mounting, and a "data bound"
  event means nothing when `data` is a prop. Run work on creation in a
  `useEffect` in the parent, and work on new data where the data is
  produced (or in the remote source's `onResponse` hook).
- Imperative data methods: the application owns `data`, and a
  copy mutated inside the component would disagree with it. To add an
  item, `setData([...data, item])`; to disable one, an `isItemDisabled`
  predicate; to find one by value, `data.find(...)`; `event.items` carries
  the selected objects.
- Feature registration: features follow props and are
  tree-shaken per subpath, so nothing needs registering and no feature can
  silently go missing.
  `indicator="checkbox"` turns on checkbox selection and virtualization is
  automatic.

<!-- demo: select-events -->

## Keyboard

| Key | Closed | Open |
| --- | --- | --- |
| Arrow Down / Up, Enter, Space, Alt+Down | Open (the value does not change) | Move the active option / select |
| Home / End | Open on the first / last option | First / last option |
| Page Down / Page Up | | Move by `maxVisibleItems` |
| Letters | Select the next matching option (type-ahead, 500 ms buffer, a repeated letter cycles) | Move to the matching option |
| Alt+Up | | Select the active option and close |
| Escape | | Close without a change (with `searchable`, clear the search first) |
| Tab | | Close and move focus on |
| Delete / Backspace | Clear the value with `clearable` | |

Disabled options are skipped. Arrow keys on a closed Select open
the popup and do not change the value: the APG select-only combobox changes the value only by an
explicit choice, and a change per key press would fire change events into
dependent forms. Type-ahead on the closed Select still selects, and Arrow
plus Enter (or Space) picks in two keys. Type-ahead
runs over local `data`; on a remote source it is off.

## Search

`searchable` puts a search field in the popup: DOM focus moves
into it, `aria-activedescendant` moves with it, typing filters with
`searchOperator` (`'startsWith'` by default, `'contains'`, `'endsWith'` or
`(item, text) => boolean`), `matchCase` and `ignoreAccents`, and the first
match becomes active. `searchPlaceholder` labels the field and
`onSearchChange(text, event)` reports the text. `highlightMatches` marks the
matched characters.

## Popup

The popup renders after a user action only, in a portal at the end of the
theme scope, in the top layer, below the trigger (above when there is no
room) and at least as wide; it follows scrolling and closes on an outside
press. `maxVisibleItems` (default 8) sets its height. There is no resize
handle: a resizable popup needs a
pointer drag surface and persisted sizes for a rarely used feature. Size
the popup with a suitable `maxVisibleItems` and a width through
`styles.popup`. The popup code is a lazy chunk loaded after mount,
so a closed Select costs the trigger only.

## Size

`size` (`'sm' | 'md' | 'lg'`, default `'md'`) picks the control metrics,
the same as `Button` and `TextField`: 24, 32 or 40 px tall, 8, 12 or 16 px
of inline padding, and 14, 16 or 20 px icons. The root carries
`data-size`. `Combobox`, `TreeSelect` and the date and time pickers take
the same prop, so a row of mixed controls lines up. The popup and its
option rows keep one size at every control size.

<!-- demo: control-sizes -->

## Server rendering

The server renders the trigger, the value label and (with `name`) the
hidden native `<select>`, never the popup. `defaultOpen` applies after
hydration, so server and client markup match.

`popupMode` is `'popover'` by default. `'sheet'` opens a
full-screen dialog with a title, a close button, a search field and the same
list; `'auto'` picks the sheet on coarse-pointer screens up to 640 px wide,
decided when the popup opens (never during render, so SSR is unaffected).

`placeholder` shows while nothing is selected; it is hidden from
assistive technology, so it is never read as a value.

See [Select multiple](/docs/dropdowns/select-multiple) for multiple selection
without typing, [Templates](/docs/dropdowns/dropdown-templates) for render
props and [Forms and appearance](/docs/dropdowns/dropdown-forms) for forms,
styling and texts. See the [API reference](/docs/reference/dropdowns/select)
for every prop and [Data, search and the
popup](/docs/dropdowns/dropdown-popup-data) for the data model and its
limits.
