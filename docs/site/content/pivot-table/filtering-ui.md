---
title: Filtering UI
description: The member editor dialog with search, select all and a virtualized member list without a node limit, the label and value filter forms, and the onBeforeFilterChange, onFilterChange and onBeforeMemberEditorOpen events.
category: Fields and filters
order: 50
demos: [pivot-table-filtering]
---

Filters are model data: `pivotModel.filterBy[field]` holds one filter per
field, a member filter (`{ include }` or `{ exclude }`), a label filter or
a value filter. Their semantics are in
[Filtering and sorting](/docs/pivot-table/filtering-and-sorting); this page
covers the dialog that edits them.

## Member editor

"Filter…" in a field menu (field list, axis bar) opens the member editor
for that field, a modal `dialog`:

- Include (member filter): a search box, "Select all" (indeterminate when
  some members are checked; with a search it toggles only the matching
  members) and a checkbox list of every member with its row count.
- Label filter: an operator (`equal`, `notEqual`, `contains`,
  `doesNotContain`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`,
  `between`, ...) and one or two values.
- Value filter: a measure (its measure id: `field`, or `field#aggregate`
  when one field is summarized twice), an operator (`greaterThan`,
  `between`, `top`, `bottom`, ...) and one or two numbers.

OK writes the filter; an empty label or value input clears it. Checking
every member writes no filter; unchecking a few writes an `exclude` filter
so members that appear later stay visible. OK is disabled with no member
checked. Escape or Cancel closes without a change, and focus returns to the
field button. "Clear filter" in the field menu removes the filter.

```ts
pivot.setFilter('country', { include: ['Japan', 'France'] });
pivot.setFilter('product', { label: { operator: 'startsWith', value: 'B' } });
pivot.setFilter('country', { value: { measure: 'amount', operator: 'top', value: 3 } });
pivot.setFilter('country', null); // clear
```

### Large member lists

The member list is virtualized (only the visible checkboxes are mounted),
so a field with 100,000 members opens as fast as one with ten. There is no
`maxNodeLimitInMemberEditor` and no load-on-demand mode: members come from
the engine's field index, or from one `facet` request for a
[remote pivot](/docs/pivot-table/remote-pivot).

The list is a multi-select `listbox`: ArrowUp / ArrowDown, Home / End and
PageUp / PageDown move through the members and Space checks the active one.
The three filter kinds are a radio group above it.

## Events

| Event | Payload |
| --- | --- |
| `onBeforeMemberEditorOpen` | `{ field, source }`; `preventDefault()` keeps the dialog closed |
| `onBeforeFilterChange` | `{ field, filter, previousFilter, source }`; `preventDefault()` cancels |
| `onFilterChange` | the same, after the change |

```tsx
const pivot = usePivot({
  data,
  defaultPivotModel: model,
  onBeforeMemberEditorOpen: (event) => {
    if (event.field === 'internalCode') event.preventDefault();
  },
  onBeforeFilterChange: (event) => {
    // Keep at least one region visible.
    if (event.field === 'region' && event.filter && 'include' in event.filter && event.filter.include.length === 0) event.preventDefault();
  },
});
```

A filter also fires `onBeforePivotModelChange` / `onPivotModelChange` with
`action: 'filter'` ([State and events](/docs/pivot-table/state)).
