---
title: Field list
description: The popup and standalone PivotFieldList bound to the shared store, field search, field order and folders, drag and drop with the keyboard Move-to alternative, field menus, deferUpdate, field move events, the Values item and small screens.
category: Fields and filters
order: 40
demos: [pivot-table-field-list]
---

The field list shows every field of the data and four axis lists: Filters,
Columns, Rows and Values. A checked field is on the report.

## Popup and standalone

The popup field list opens in a dialog from the
toolbar item `'fieldList'` or the instance API:

```tsx
const ref = useRef<PivotTableApi<Sale>>(null);

<PivotTable ref={ref} pivot={pivot} fieldList="popup" toolbar={['fieldList']} />
<button onClick={() => ref.current?.openFieldList()}>Fields</button>
```

The standalone field list is `PivotFieldList` placed anywhere in the page, bound to the same store as
the table. There is nothing to synchronize: both read and write one
`PivotController`.

```tsx
const pivot = usePivot({ data, fields, defaultPivotModel: model });

<aside><PivotFieldList pivot={pivot} /></aside>
<PivotTable pivot={pivot} />
```

`PivotFieldList` props: `pivot` (required), `deferUpdate`, `searchable`,
`fieldOrder`, `aggregateOptions`, `localeText`, `onDone` (after Apply or
Cancel), `className`, `style` and `aria-label`. The popup of
`<PivotTable fieldList="popup">` is the same component in a dialog.

## Search, order and folders

| Prop or field option | Default |
| --- | --- |
| `searchable` | `true` |
| `fieldOrder` | `'none'` (definition order) |
| `PivotFieldDefinition.folder` | none |
| `PivotFieldDefinition.hidden` | `false` |
| `PivotFieldDefinition.caption` | the field name |

```ts
const fields: PivotFieldDefinition<Order>[] = [
  { field: 'region', caption: 'Region', folder: 'Geography' },
  { field: 'country', caption: 'Country', folder: 'Geography' },
  { field: 'revenue', caption: 'Revenue', type: 'number', folder: 'Measures' },
  { field: 'internalId', hidden: true },
];
```

## Moving fields

- Check a field to add it: numbers go to Values, other fields to Rows.
  Uncheck it to remove it.
- Drag a field from the list or an axis to another axis, or within an axis
  to reorder it.
- Keyboard: arrows move between items of a list; Space checks or unchecks a
  field; Enter (or Shift+F10) opens the field menu with "Move to Rows",
  "Move to Columns", "Move to Values", "Move to Filters", Move up, Move down
  and Remove; Alt+ArrowUp / Alt+ArrowDown reorders inside an axis; Delete
  removes the field.
- Per-field `draggable: false` disables moving and `removable: false`
  disables removing.

The field menu also holds the field's sort, member filter
([Filtering UI](/docs/pivot-table/filtering-ui)), grouping and, on value
fields, the aggregation ("Summarize values by") and number format
([Editors](/docs/pivot-table/editors)). These menus are the same as on the
[axis bar](/docs/pivot-table/axis-bar).

### Aggregation menu

A value field's menu lists the aggregates offered by `aggregateOptions`
(default every built-in aggregate valid for
the field type, `count` and `distinctCount` for non-numbers):

```tsx
<PivotFieldList pivot={pivot} aggregateOptions={['sum', 'average', 'min', 'max', 'count']} />
```

`onBeforeAggregateMenuOpen` receives `{ field, index, items }` and can edit
`items`, or call `preventDefault()` to leave the submenu out. `PivotTable` and `PivotAxisBar` take the same
`aggregateOptions`.

## The Values item

With more than one value field (or `showValueHeader`), the Rows or Columns
list holds a Values item. Moving it changes
`pivotModel.valuesPlacement`: the measure headers move between the column
and the row headers, and its position among the axis fields is the level of
the measure headers.

## Deferred update

`deferUpdate` makes the field list
edit a draft model. The table keeps the applied report until Apply; Cancel
discards the draft.

```tsx
<PivotFieldList pivot={pivot} deferUpdate onDone={() => setOpen(false)} />
```

The draft is `usePivotState(pivot, (s) => s.draft)` (null when nothing is
pending); `pivot.applyDraft()` and `pivot.cancelDraft()` do the same from
code. Every command takes `{ draft: true }` to edit the draft.

## Events

| Event | Payload |
| --- | --- |
| `onBeforeFieldMove` | `{ field, from, to, index, source }`; `preventDefault()` cancels |
| `onFieldMove` | the same, after the move; `to: null` is a removal |
| `onPivotModelChange` | `{ action: 'moveField' \| 'removeField', model, previousModel, field }` |

`from: null` means the field was not on the report. The events are options
of `usePivot()` (or props of `PivotTable` when it owns the store), so the
field list, the axis bar and code all report through the same handlers.
No manual update call is needed: the shared store updates every part.

## Small screens

Below 640 px the popup field list and every pivot dialog become full-screen
sheets and the field list stacks its lists in one column. On touch, the
field menu's "Move to" items are the primary way to move fields; drag and
drop still works.
