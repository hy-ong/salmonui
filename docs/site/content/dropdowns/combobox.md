---
title: Combobox
description: The editable dropdown from @salmonui/dropdowns/combobox, with list autocomplete, inline autofill, custom values and IME support.
category: Components
order: 30
demos: [combobox-basics, combobox-options]
---

`Combobox` is the WAI-ARIA APG editable combobox with list autocomplete:
an `<input role="combobox" aria-autocomplete="list">` keeps DOM
focus while the popup is driven through `aria-activedescendant`. It is the
base of [AutoComplete](/docs/dropdowns/autocomplete), the typing
[MultiSelect](/docs/dropdowns/combobox-multiple) and
[MultiColumn ComboBox](/docs/dropdowns/multicolumn-combobox).

```tsx
import { Combobox } from '@salmonui/dropdowns/combobox';
import '@salmonui/dropdowns/combobox/styles.css';

<Combobox aria-label="Fruit" data={fruits} defaultValue="kiwi" />
```

<!-- demo: combobox-basics -->

It shares the [Select](/docs/dropdowns/select) props for data, value,
events, search, templates and forms, except `popupMode`: the popup is
always the anchored popover, since the input is already the search field.
Its own props:

| Prop | Meaning |
| --- | --- |
| `inputValue`, `defaultInputValue`, `onInputChange(text, event)` | The input text; `event.reason` is `'input'`, `'select'`, `'clear'`, `'escape'`, `'blur'` or `'reset'` (the owning form was reset) |
| `creatable` | Committed text without a matching item becomes the value; default `false` |
| `onCreateItem(text)` | Builds the item for created text; `null` rejects it; default: the text itself |
| `autofill` | Completes the first match inline with the completed part selected, `aria-autocomplete="both"` |
| `showTrigger` | The dropdown button, default `true`; it is not in the tab order |
| `openOnClick` | A click in the input opens the popup (default `true`) |
| `clearable` | The clear button, default `true` |
| `ref` | The `<input role="combobox">`; DOM props such as `onFocus` and `aria-label` reach it too |

Typing filters the list and opens it; the input text is the search text
(`searchOperator`, `matchCase`, `ignoreAccents`, `minSearchLength`,
`maxResults`). Committing text that equals a label (ignoring case) selects
that item; other text is created with `creatable`, otherwise it reverts to
the selected label when focus leaves.

<!-- demo: combobox-options -->

## Value and events

Both the value and the text can be controlled or left uncontrolled.
`value` / `defaultValue` / `onValueChange(value, event)` hold one item
value or `null`; `event.reason` is `'select'`, `'create'`, `'clear'` or
`'reset'` and `event.items` holds the new value's items, including created
ones. A controlled `value` vetoes a change by not updating.
`open` / `defaultOpen` / `onOpenChange(open, event)` control the popup.

```tsx
const [city, setCity] = useState<string | null>(null);
const [text, setText] = useState('');

<Combobox
  aria-label="City"
  data={cities}
  creatable
  value={city}
  onValueChange={(next) => setCity(next as string | null)}
  inputValue={text}
  onInputChange={(next) => setText(next)}
/>
```

## Keyboard

| Key | Action |
| --- | --- |
| Arrow Down / Up | Open; move the active option |
| Alt+Down / Alt+Up | Open without moving / close |
| Enter | Commit the active option, or the typed text (`creatable`) |
| Escape | Close; a second Escape clears the input (and the value, with `clearable`) |
| Home / End | Move the caret (the text, not the list) |
| Page Down / Page Up | Move by `maxVisibleItems` while open |
| Tab | Commit or revert the text and move on |

During IME composition there is no filtering, autofill or Enter commit; the
search runs when composition ends.

Opening over 100,000 local items stays within the dropdown open budget
(≤ 50 ms to painted gates the `columns` popup over 100,000 rows):
the popup windows its options and the search index builds after the first
paint.

## Size

`size` (`'sm' | 'md' | 'lg'`, default `'md'`) sets the field to 24, 32 or
40 px with 8, 12 or 16 px of inline padding and 14, 16 or 20 px icons, as
on [Select](/docs/dropdowns/select#size); the AutoComplete and multicolumn
variants take it too. Chips and their remove buttons are 20, 24 or 28 px;
at `sm` the remove button's hit area still covers 24 × 24 px, so touch
targets stay at the WCAG minimum. The popup keeps one size.

## Server rendering

The server renders the input, the selected label and, with `name`, the
hidden form element; the popup and the `columns` grid are lazy chunks
loaded on the client, so a closed Combobox hydrates without a warning.

See the [API reference](/docs/reference/dropdowns/combobox) for every prop and
[Data, search and the popup](/docs/dropdowns/dropdown-popup-data) for the
data model and its limits.
