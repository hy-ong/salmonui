---
title: MultiColumn ComboBox
description: A multi-column lookup as Combobox columns - a lightweight grid popup with column widths, alignment, formats, templates, sorting and multi-field search.
category: Recipes
order: 60
demos: [multicolumn-combobox, multicolumn-templates]
---

`Combobox columns={[...]}` turns the popup into a `role="grid"` table on the
shared fixed-height virtual window. It is not an embedded
`DataGrid`: the grid engine, editing and grouping would miss the open budget
of a lookup popup. The grid popup is a lazy chunk loaded on first open.

```tsx
import { Combobox } from '@salmonui/dropdowns/combobox';
import '@salmonui/dropdowns/combobox/styles.css';

<Combobox
  aria-label="Person"
  data={people}
  getItemValue={(p) => p.id}
  getItemLabel={(p) => p.name}
  columns={[
    { field: 'id', header: 'ID', width: 60, align: 'end' },
    { field: 'name', header: 'Name', width: '35%' },
    { field: 'joined', header: 'Joined', format: { dateStyle: 'medium' } },
    { field: 'active', header: 'Active', displayAsCheckbox: true },
  ]}
  searchFields={['name', 'city']}
/>
```

<!-- demo: multicolumn-combobox -->

| Task | How |
| --- | --- |
| Column data and title | `field`, `header` |
| Column width (px or %) | `width`: a number (px) or `'40%'`; columns without a width share the rest |
| Alignment | `align: 'start' \| 'end' \| 'center'` |
| Number and date formats | `Intl.NumberFormatOptions` (numbers), `Intl.DateTimeFormatOptions` (dates) in `locale`, or `(value, item) => string` |
| Cell and header templates | `renderCell({ item, value, text })`, `renderHeader({ column })` |
| Booleans as checkboxes | `displayAsCheckbox` |
| Cell attributes | `cellProps`: an object or `(item) => props` with `className`, `style`, `data-*` |
| Row height | `rowHeight` |
| Grid lines | `gridLines`: `'default'`, `'both'`, `'none'`, `'horizontal'`, `'vertical'` |
| Alternate row shading | `striped` |
| Wrap long text | One row height; long text ends in an ellipsis with the full text as `title` |
| Resize columns | Widths come from `columns` |
| Sort by a column | `sorting` (default `true`): header buttons cycle ascending, descending, none with `aria-sort`; `sortable: false` on a column turns it off there |
| Sort by several columns | `sorting={{ multiple: true }}`: Ctrl / Cmd + click adds a level |
| Initial sort | `sorting={{ sortBy: [{ columnId: 'name', direction: 'asc' }] }}` (reactive) |
| Search | Typing searches `searchFields` (default: the label) |

Keys are the Combobox keys with rows as the navigable unit, no cell
navigation. ARIA: the input has `aria-haspopup="grid"`,
`aria-controls` and `aria-activedescendant` on the active `row`; rows carry
`aria-selected` and `aria-rowindex`, the grid `aria-rowcount`. The header
row stays visible while the rows scroll.

<!-- demo: multicolumn-templates -->

Rows do not wrap text and columns do not resize.
Wrapped rows would have varying heights, which breaks the
fixed-height virtual window that keeps a lookup popup fast; instead long
text ends in an ellipsis with the full text as `title`. To show more
text, use wider columns, or a larger `rowHeight` with a two-line
`renderCell`. Resizing inside a transient popup would need pointer drag
handling and width state that resets on close, for a feature lookup popups
rarely need; set widths in `columns`.

Remote data under virtualization is never fetched in full:
`data` can be any `@salmonui/data` source,
and the grid reads ranges of at most 100 rows as it scrolls or jumps, with
pending rows shown as placeholders until their range arrives. The release
gate scrolls a 100,000-row remote source and checks that every read is a
range and the frame budget holds.

Value, events, forms and server rendering are those of
[Combobox](/docs/dropdowns/combobox); see the
[API reference](/docs/reference/dropdowns/combobox) for `ComboboxColumn`.
