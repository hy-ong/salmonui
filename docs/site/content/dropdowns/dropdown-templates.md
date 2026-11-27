---
title: Templates
description: Render props for options, the value, chips, group headers, the popup header and footer, and the empty, error and loading states of Select and Combobox.
category: Guides
order: 60
demos: [dropdown-templates]
---

Every template is a function render prop or a `ReactNode`. The
table covers `Select` and `Combobox` (both take the same render props);
`Listbox`, `TreeSelect` and `Mention` have their own `renderItem`,
`renderEmpty`, `renderError` and `renderLoading`, described in their API
references.

| Part | Template |
| --- | --- |
| Option | `renderItem({ item, label, selected, active, disabled, matches })`, rendered inside the `role="option"` element, which keeps its role and state; `getItemIcon(item)` adds an icon; `getItemProps(item)` adds `className`, `style` and `data-*` to rendered options |
| Selected value | `renderValue({ items, labels })`; chips of `Combobox multiple`: `renderChip({ item, label, remove, disabled })`, and `getChipProps(item)` adds `className`, `style` and `data-*` |
| Group header | `renderGroupHeader({ group })` for inline and sticky headers |
| Popup header and footer | `popupHeader`, `popupFooter` |
| Empty list | `renderEmpty({ reason: 'noData' \| 'noMatch' })`; default `localeText.noData` / `noResults` |
| Load error | `renderError({ error, retry })`; default `localeText.loadError` with a Retry button; `onLoadError(error)` |
| Loading | `renderLoading()`; the list carries `aria-busy` while loading |

```tsx
import { Select } from '@salmonui/dropdowns/select';
import '@salmonui/dropdowns/select/styles.css';

<Select
  aria-label="Owner"
  data={people}
  getItemValue={(p) => p.id}
  getItemLabel={(p) => p.name}
  getItemIcon={(p) => <img src={p.photo} alt="" width={20} height={20} />}
  renderItem={({ item, label }) => (
    <>
      {label} <small>{item.role}</small>
    </>
  )}
  renderValue={({ items }) => <strong>{items[0]?.name}</strong>}
  renderEmpty={({ reason }) => (reason === 'noMatch' ? 'Nobody by that name' : 'No people yet')}
/>
```

`matches` holds `[start, end)` ranges of the search text in `label`, so a
custom option can mark matches the way `highlightMatches` does. Render props
run for rendered options only (the list is windowed above 100 items).

## No string templates

- String and element-id templates:
  `'${Name}'` and `'#template'` need a runtime template compiler (string
  evaluation, blocked by a strict CSP) and cannot be type-checked, so
  templates are render props only. To bold a field, write
  `renderItem={({ item }) => <b>{item.Name}</b>}`.
- HTML sanitizing and encoding: React
  escapes text and no dropdown renders HTML strings, so there is nothing to
  sanitize or encode and no option for it. Build markup in a render prop,
  and own any `dangerouslySetInnerHTML` call for trusted HTML.

See the API reference of [`select`](/docs/reference/dropdowns/select) and
[`combobox`](/docs/reference/dropdowns/combobox).

<!-- demo: dropdown-templates -->
