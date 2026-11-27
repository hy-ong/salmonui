---
title: AutoComplete
description: AutoComplete as a Combobox recipe - free text with suggestions from the first character, contains matching, capped and highlighted results.
category: Recipes
order: 40
demos: [autocomplete, autocomplete-remote]
---

AutoComplete is a [`Combobox`](/docs/dropdowns/combobox) whose value is the
text. The recipe sets the AutoComplete defaults:
suggestions from the first character, at most 20 of them, contains
matching, highlighted matches, a clear button and no dropdown button.

```tsx
import { Combobox } from '@salmonui/dropdowns/combobox';
import '@salmonui/dropdowns/combobox/styles.css';

<Combobox
  aria-label="City"
  data={cities}
  creatable
  clearable
  showTrigger={false}
  minSearchLength={1}
  maxResults={20}
  searchOperator="contains"
  highlightMatches
/>
```

<!-- demo: autocomplete -->

With string `data` the committed text is the value: `onValueChange(text,
event)` fires when a suggestion is picked or typed text is committed
(Enter, Tab, blur), with `event.reason` `'select'` or `'create'`.
`onInputChange(text, event)` reports every keystroke, and
`inputValue` / `defaultInputValue` control the text, as on
[Combobox](/docs/dropdowns/combobox), which also covers forms and server
rendering.

| Task | How |
| --- | --- |
| Characters before suggestions show | `minSearchLength` (default 0; the recipe sets 1) |
| Cap the number of suggestions | `maxResults`; for a remote source, the read range |
| Highlight the matched text | `highlightMatches`: `<mark class="salmon-dropdown__match">`; `renderItem` gets `matches` |
| Show a dropdown button | `showTrigger` |

Keys: typing filters and opens the suggestions once the text is
long enough; Arrow Down / Up open them when hidden; Backspace re-filters;
Escape closes and clears the active suggestion.

ARIA: `aria-autocomplete="list"` (`"both"` with `autofill`),
`aria-busy` on the list while remote suggestions load. Templates and
remote loading need no extra ARIA wiring from the application: render props
render inside the option element, which keeps its role and state, and the
result count after a search is announced by the component.

<!-- demo: autocomplete-remote -->

See the [API reference](/docs/reference/dropdowns/combobox) for every prop.
