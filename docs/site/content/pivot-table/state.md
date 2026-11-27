---
title: State and events
description: Controlled and uncontrolled report models, the cancellable command and event model with onBeforePivotModelChange and onError, getState and restoreState, persistState and saved reports.
category: Pivot Table
order: 75
---

## Controlled and uncontrolled

```tsx
// Uncontrolled: the store owns the report after mount.
const pivot = usePivot({ data, defaultPivotModel: model });

// Controlled: the app owns the report.
const [model, setModel] = useState<PivotModelInput>(initialModel);
const pivot = usePivot({ data, pivotModel: model, onPivotModelChange: (event) => setModel(event.model) });
```

`pivotModel` is applied when its content changes; a fresh literal equal to
the current model does nothing, so passing an inline object does not reset
the user's changes on every render.

## Commands and events

Every change, from a part or from code, is a command on the store:
`pivot.setModel`, `moveField`, `setFilter`, `setSort`, `setValueSort`,
`setAggregate`, `setCalculatedField`, `setFormat`, `setConditionalFormats`,
`setGrouping`, `setTotals`, `expand`, `collapse`, `expandAll`,
`collapseAll`, `restoreState`. Each command fires a cancellable before-event
and an after-event; it returns `false` when it was cancelled.

| Event | Payload |
| --- | --- |
| `onBeforePivotModelChange` | `{ action, model, previousModel, field, source }`; `preventDefault()` cancels |
| `onPivotModelChange` | the same, after the change |
| `onError` | `{ error, action }` |

`action` names what happened: `set`, `prop`, `moveField`, `removeField`,
`filter`, `sort`, `valueSort`, `aggregate`, `expand`, `collapse`,
`expandAll`, `collapseAll`, `calculatedField`, `format`,
`conditionalFormat`, `group`, `totals`, `apply` (a deferred field list
draft) and `restore`. `source` is `pointer`, `keyboard` or `api`. The
specific events (`onBeforeFieldMove`, `onBeforeFilterChange`,
`onBeforeSortChange`, `onBeforeExpandedChange`,
`onBeforeCalculatedFieldChange`, ...) fire before the generic one with
their own payloads.

```tsx
const pivot = usePivot({
  data,
  defaultPivotModel: model,
  onBeforePivotModelChange: (event) => {
    // Lock the row axis of this report.
    if (event.action === 'moveField' && event.model.rows.length !== event.previousModel.rows.length) event.preventDefault();
  },
  onError: (event) => toast(`${event.action} failed: ${event.error.message}`),
});
```

`onError` receives compute errors (`action: 'compute'`), invalid saved
states (`'restore'`), drill through and export failures; without a handler
the error is logged (an export error rejects the export promise instead).

## Save and restore

```ts
const state = api.getState();            // { version: 1, pivotModel, layout }
localStorage.setItem('report', JSON.stringify(state));

api.restoreState(localStorage.getItem('report') ?? '');   // a state object or its JSON
```

The state is plain JSON and schema-versioned: `restoreState()` returns
`false` and calls `onError` for anything that is not a version 1 pivot
state, and keeps the current report. The same methods exist on the
controller (`pivot.getState()`, `pivot.restoreState()`).

## Persistence

`persistState` saves the model in storage after every applied change and
restores it on mount:

```tsx
<PivotTable pivot={pivot} persistState={{ id: 'sales-report', version: '2026.11' }} />
```

The key is `salmon-pivot-table:<id>`; `storage` defaults to `localStorage`
(any `{ getItem, setItem, removeItem }`). A state saved by another
application `version` is ignored. The saved report is restored after
hydration, so the server markup is always the default report.

## Saved reports

A report toolbar (New, Save, Save As, Rename, Delete, Load) is
application code over these methods: keep a list of named states, `getState()`
to save, `restoreState()` to load, and `pivot.setModel(emptyModel)` for a
new report. A toolbar item with `render` can hold the report picker
([Toolbar](/docs/pivot-table/toolbar-and-export)).

## AI and agent tools

**Model changes from an AI service.** No component ships an LLM
provider or AI backend. `pivotModel` is serializable JSON, so your server
can send the current model and field list to any model and get back a
partial model (`PivotModelInput`). Validate it on the server, then merge and
set it through `pivotModel`. `onBeforePivotModelChange` can reject a change
with `event.preventDefault()`.

```tsx
const patch = await fetchValidatedPatch(prompt, model, fields); // your server route
setModel({ ...model, ...patch });

<PivotTable data={rows} fields={fields} pivotModel={model} onPivotModelChange={(event) => setModel(event.model)} />;
```

**Agent tools.** WebMCP is a proposed browser API with no stable
specification, so components do not register tools for it. Register your
own tools over `PivotTableApi`, wrapping `getState`, `restoreState` and
`exportToExcel`, and move fields through `pivotModel`.
