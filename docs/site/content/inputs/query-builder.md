---
title: QueryBuilder
description: A nested AND/OR/NOT rule editor from @salmonui/query-builder, sharing its tree with the Data Grid filter builder, with SQL and MongoDB converters.
category: Components
order: 45
demos: [query-builder-basics, query-builder-fields, query-builder-api, query-builder-converters, query-builder-sql, query-builder-grid, query-builder-large]
---

`QueryBuilder` edits a filter as a tree of groups (AND / OR, optionally
NOT) and rules (`field operator value`). Its value is a `QueryGroup`, the
same shape as a Data Grid `DataGridFilterGroup` plus `id`, `not` and
`locked`, so `<DataGrid filtering={{ filters: [query] }}>` and
`@salmonui/data` queries take it as is.

```tsx
import { QueryBuilder, type QueryField, type QueryGroup } from '@salmonui/query-builder';
import '@salmonui/query-builder/styles.css';

const fields: QueryField[] = [
  { field: 'name', label: 'Name' },
  { field: 'age', label: 'Age', type: 'number' },
  { field: 'address', label: 'Address', fields: [{ field: 'city', label: 'City' }] },
];

<QueryBuilder fields={fields} defaultValue={{ logic: 'and', filters: [] }} onValueChange={(value) => save(value)} />
```

<!-- demo: query-builder-basics -->

The stylesheet carries the rules of the families it renders (Select,
Combobox, TreeSelect, Button, TextField, NumberField, Checkbox, DateField),
so one import besides `@salmonui/core/styles.css` (the theme, once per app)
styles the whole builder.

## One tree editor

QueryBuilder and the Data Grid filter builder dialog are the same
internal `QueryTree`: one model (immutable edits with structural sharing,
fields described by a `QueryFieldInfo` adapter built from compiled columns
in the grid and from `fields` here) and one memoized group / rule editor.
The grid dialog stays a lazy chunk; `bundle:check` gates the Data Grid
rows.

<!-- demo: query-builder-grid -->

## Value

- `value` / `defaultValue` / `onValueChange(value, details)` with
  `details = { source, reason, action, nodeId }`. Nodes
  without an `id` get one from their path (`q`, `q.0`, `q.1.0`), so server
  and client markup agree; emitted values carry the ids.
- Groups: `{ logic: 'and' | 'or', not?, locked?, filters }`; rules:
  `{ field, operator, value?, matchCase?, ignoreAccents?, locked? }`.
  `between` values are `[from, to]`, `in` / `notIn` values arrays.
- `matchCase` writes `matchCase` to every edited condition.
- `onBeforeChange(event)` runs before every change with `{ action,
  nodeId, previousValue, value, source }`; `event.preventDefault()`
  cancels it.
- `name` adds a hidden input with the valid value as JSON; a form `reset`
  restores `defaultValue`.
- Controlled or uncontrolled: pass `value` with `onValueChange` and store
  what it reports (the builder never edits a controlled value itself), or
  `defaultValue` and read the value through `onValueChange` or
  `api.getValue()`.

## Fields

| `QueryField` | Meaning |
| --- | --- |
| `field`, `label`, `type` | Name (a path segment for nested fields), text, `'string' \| 'number' \| 'date' \| 'datetime' \| 'boolean'` |
| `operators` | Data Grid filter operator names or custom ones; default `operatorsFor(type)` |
| `values` | Fixed values (`'gold'` or `{ value, label }`): a Select, multiple for `in` / `notIn` |
| `defaultValue` | Value of a new rule on the field |
| `format` | Display format of values in the summary: `'N2'`, `'C2'`, `'P1'`, skeletons (`'yMMMd'`), `'dd/MM/yyyy'` patterns or format options |
| `step` | NumberField step |
| `validation` | Rules in the Form vocabulary (`required`, `min`, `max`, `minLength`, `pattern`, `validate`, ...) |
| `category` | Group of the field in the field Select |
| `fields` | Nested fields; paths join with `pathSeparator` (default `'.'`, `address.city`) |
| `renderValueEditor(ctx)` | Custom value editor; `ctx.setValue` writes the value |

`operatorsFor(type)` returns the built-in list of a type;
`fieldSort: 'asc' | 'desc'` sorts the field list. The field picker
is a `Select` grouped by `field.category` (`fieldPicker: 'list'`, the
default) or a `TreeSelect` (`fieldPicker: 'tree'`) with the categories and
nested `field.fields` as parents that cannot be picked themselves. The tree picker is a lazy chunk
of `/query-builder`: the list picker renders on the server, during
hydration and until the chunk loads.

<!-- demo: query-builder-fields -->

## Editing

- Built-in value editors: TextField (text), NumberField (numbers),
  DateField (dates; `datetime` to the minute), Checkbox (booleans), Select
  for fixed `values`, a multiple creatable Combobox for `in` / `notIn`,
  two editors for `between`.
- `editorProps: { field, operator, value }` are spread on the field
  Select, the operator Select and the value editors. A `value`
  prop that only some editors take (`clearable`, `showStepper`,
  `hourCycle`, `searchable`, ...) reaches only those editors; DOM,
  `aria-*` and `data-*` attributes reach every value editor.
- `buttons: { deleteRule, addGroup, deleteGroup, clone, lock }` (the first
  three default true); clone copies a rule or group next to itself
  and focuses it; lock makes a node and its members read-only.
- `notCondition` shows a NOT toggle on every group.
- `maxGroups` limits group nesting, the root included (default 5);
  `addRuleToNewGroups` (default true) starts new groups with a rule;
`autoSelectField` (default false) starts new rules on the first
  field and `autoSelectOperator` (default true) picks a field's first
  operator.
- `readOnly` renders the tree with disabled editors and without the add,
  remove, clone, lock and drag buttons.
- `summary` shows the value as a sentence ("Name contains an AND (Age
  greater than 30 OR ...)") with an Edit button; Done returns.
- `renderRule(ctx)` replaces a rule row (`fieldPicker`, `operatorPicker`,
  `valueEditor`, `actions`, `errors`, `setRule`, `remove`) and
  `renderGroupHeader(ctx)` a group bar (`controls`, `actions`, `depth`,
  `isRoot`).

## Reorder

`reorderable` adds a drag handle to every rule and group. Dragging
shows a drop line (drag state never enters React state); `onDragStart`,
`onDrag` (once per frame) and the cancellable `onDrop` report it. Escape
cancels a drag.

## Validation

`validation` checks every rule when the owning form submits and cancels
the submit while one is invalid; `api.validate()` does the same on demand
and returns a boolean. Incomplete rules (no field, operator or
value) and values failing `field.validation` show an inline error that the
rule references with `aria-describedby`; editing the rule clears it.
`api.getValidValue()` drops incomplete rules and empty groups.

## API

`ref` receives a `QueryBuilderApi`:

| Method | Meaning |
| --- | --- |
| `getValue()`, `setValue(value)` | Current value (with ids) / propose a value |
| `getValidValue()` | Without incomplete rules and empty groups |
| `getNode(id)` | A rule or group by id |
| `addRules(rules, groupId?)`, `addGroups(groups, groupId?)` | Append; return the new ids |
| `remove(ids)` | Remove rules or groups (`onBeforeChange` action `removeGroup` or `removeCondition`, after the first id) |
| `clone(id, { parentId, index }?)` | Copy a node; returns the copy's id |
| `lock(id, locked = true)` | Lock or unlock |
| `validate()` | Show errors, return validity |
| `reset()`, `focus()` | Back to `defaultValue` (proposed through `onValueChange` when controlled); focus the first control |

<!-- demo: query-builder-api -->

| Prop | Type | Default |
| --- | --- | --- |
| `fields` | `QueryField[]` | required |
| `value`, `defaultValue` | `QueryGroup` | empty AND group |
| `onValueChange`, `onBeforeChange` | see above | |
| `operators` | `QueryOperator[]` (custom operators) | |
| `notCondition`, `summary`, `readOnly`, `disabled`, `reorderable`, `validation` | `boolean` | `false` |
| `buttons` | `QueryBuilderButtons` | remove and add-group on |
| `maxGroups` | `number` | `5` |
| `addRuleToNewGroups`, `autoSelectOperator` | `boolean` | `true` |
| `autoSelectField` | `boolean` | `false` |
| `fieldSort` | `'asc' \| 'desc' \| null` | `null` |
| `fieldPicker` | `'list' \| 'tree'` | `'list'` |
| `matchCase` | `boolean` | |
| `pathSeparator` | `string` | `'.'` |
| `renderRule`, `renderGroupHeader` | render functions | |
| `editorProps` | `{ field?, operator?, value? }` | |
| `onDragStart`, `onDrag`, `onDrop` | drag events | |
| `localeText`, `locale` | text overrides, BCP 47 | English, `'en-US'` |
| `name`, `form`, `id`, `className`, `style`, `aria-label`, `aria-labelledby`, `dir` | | |

## Custom operators

`operators: [{ name, label?, types?, valueless?, list?, evaluate? }]` adds
operators to the fields of matching types. `evaluate(cell, value,
{ matchCase, ignoreAccents })` serves `filterRows` (the Data Grid takes the
same function through `createFilterModule({ operators })`); `toSql` and
`toMongo` take an `operators` hook per name.

## filterRows

`filterRows(rows, value, fields?, { pathSeparator, matchCase,
ignoreAccents, operators }?)` returns the matching rows with the Data Grid
filter semantics (case and accent folding, blanks, calendar-day dates,
`like` / `wildcard` patterns); a unit test runs the same queries through
the core filter module.

## SQL and MongoDB

<!-- demo: query-builder-converters -->

`@salmonui/query-builder/sql` and `/mongo` are server-safe: no
React, no component code, no package imports.

- `toSql(value, { named, inline, quoteIdentifier, dialect, operators,
  pathSeparator, paramPrefix })` returns `{ sql, params }`, parameterized
  by default (`?`; `$1` on postgres, `@p1` on mssql) so values never reach
  the SQL text; `named: true` uses `:p1` and a params record; `inline:
  true` writes escaped literals like `getSqlFromRules`.
  Text comparisons follow the database collation (`matchCase` is not
  translated); LIKE patterns escape the user's `%` and `_` with `ESCAPE
  '!'`.
- `fromSql(sql, { params, named, pathSeparator })` reads back the subset
  `toSql` writes (comparisons, `IN`, `BETWEEN`, `LIKE`, `IS [NOT] NULL`,
  `AND` / `OR` / `NOT` groups, quoted identifiers, every placeholder
  style); anything else throws a `SqlParseError` with the position, and
  nothing is evaluated.
- `toMongo(value, { operators, pathSeparator })` writes `$and` / `$or`,
  `$nor` for NOT groups, comparisons, `$in` / `$nin` and escaped `$regex`;
`fromMongo(query, { pathSeparator })` reads `$and`, `$or`,
  `$nor`, implicit equality, `$eq` ... `$lte`, `$in`, `$nin`, literal
  `$regex` (with `$options`, also under `$not`) and `$exists`, and throws
  a `TypeError` naming any other operator.

<!-- demo: query-builder-sql -->

## Keyboard and accessibility

Every group is a `role="group"` named by its connector ("And group", the
root by `aria-label`); every rule is a group named by its position
("Condition 2"). Focus moves to a new rule's field after add and
clone, and to the group's add button after remove.

| Key | Action |
| --- | --- |
| Tab | Moves through the connector, NOT, buttons and editors |
| Arrow keys | Change the AND / OR connector (radio group) |
| Alt+ArrowUp / Alt+ArrowDown on a handle | Move the rule or group up or down; it enters an adjacent group and leaves its group at the ends; the new position is announced |
| Escape while dragging | Cancel the drag |

## Localization

`localeText` overrides every text. The operator labels
(`operatorContains`, ...), connector, NOT and button texts use the Data
Grid `localeText` keys and English defaults, so one localized bundle
serves both; `groupLabel` (`'{connector} group'`), `ruleLabel`,
`summaryRule` and `validation*` messages are QueryBuilder keys.

## Performance

A 200-rule builder mounts in about 8 ms (budget 50 ms) and a rule edit
re-renders only that rule (`tests/browser/query-builder-perf.spec.ts`).
Bundle rows: QueryBuilder's own code 10.60 KB gzip with the tree picker
chunk (cap 14 KB, the composed families excluded), own CSS rules 0.55 KB,
`toSql` 1.33 KB, `/sql` with `fromSql` 3.07 KB (over its 2.5 KB design
cap, gated at 3.2 KB), `/mongo` 1.98 KB.

<!-- demo: query-builder-large -->

## Server rendering

The builder renders on the server with the same markup as the first client
render: nodes without an `id` get ids from their path, values are
formatted with the `locale` prop (default `'en-US'`), and the tree field
picker only replaces the list picker after hydration. `@salmonui/query-builder/sql`
and `/mongo` contain no React or DOM code, so route handlers and server
actions can convert or parse queries.

## Reference

Every exported symbol and type is listed in the reference:
[`@salmonui/query-builder`](/docs/reference/query-builder),
[`@salmonui/query-builder/sql`](/docs/reference/query-builder/sql)
and [`@salmonui/query-builder/mongo`](/docs/reference/query-builder/mongo).

## Design notes

- fields are explicit; the builder does not infer them from sample
  records, because inferring field types from the first record is
  unreliable (nulls, numeric strings, dates as strings). Pass
  `fields={[{ field: 'age', label: 'Age', type: 'number' }]}`; a Data
  Grid's columns map to fields with one `map`.
- there is no layout-mode prop. Horizontal or vertical layout
  depends on the available width, so a container query stacks the editors
  in narrow containers. To force the vertical layout, constrain the
  container width.
- there is no built-in change delay. Debouncing is the
  application's policy (live grid filtering differs from saving a query),
  so wrap the `onValueChange` handler in a debounce.
- siblings in a group share one connector. Different connectors
  between siblings make precedence ambiguous (`a AND b OR c`); nested
  groups state it and map one to one to the filter model and SQL
  parentheses. Put each run of rules sharing a connector in its own group.
