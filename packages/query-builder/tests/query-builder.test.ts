// QueryBuilder without a DOM: the server markup, the field list (types,
// operators, values, categories, nested paths, sort), filterRows against the
// core filter module, validation, the summary sentence, the shared locale
// text, the tree model and the keyboard move targets. Interaction and the
// API ref are covered in tests/browser/query-builder.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { createDataGridEngine, createFilterModule, type ColumnDef } from '@salmonui/data-grid/engine';
import { DEFAULT_LOCALE_TEXT } from '@salmonui/data-grid/engine/locale';
import { filterRows, operatorsFor, QueryBuilder, QUERY_BUILDER_DEFAULT_LOCALE_TEXT, type QueryField, type QueryGroup } from '@salmonui/query-builder';
import { flattenFields } from '../dist/query-builder/fields.js';
import { fieldTree } from '../dist/query-builder/tree-picker.js';
import { summaryText, formatWith } from '../dist/query-builder/summary.js';
import { validateQuery, validValue } from '../dist/query-builder/validate.js';
import { textOf } from '../dist/query-builder/locale.js';
import { keyboardTarget } from '../dist/query-builder/drag.js';
import { cloneNode, findNode, groupCount, groupDepth, idSource, moveNode, withIds, type TreeGroup } from '../../core/dist/internal/query/model.js';

const fields: QueryField[] = [
  { field: 'name', label: 'Name', category: 'Person' },
  { field: 'age', label: 'Age', type: 'number', category: 'Person', validation: { min: 0, max: 150 }, step: 5, format: 'N1' },
  { field: 'joined', label: 'Joined', type: 'date', format: 'dd/MM/yyyy' },
  { field: 'active', label: 'Active', type: 'boolean' },
  { field: 'tier', label: 'Tier', values: [{ value: 'g', label: 'Gold' }, 's'], defaultValue: 'g' },
  { field: 'address', label: 'Address', fields: [{ field: 'city', label: 'City' }, { field: 'zip', label: 'Zip', operators: ['equal'] }] },
];

const value: QueryGroup = {
  logic: 'and',
  filters: [
    { field: 'name', operator: 'contains', value: 'an' },
    { logic: 'or', not: true, filters: [{ field: 'age', operator: 'between', value: [20, 30] }, { field: 'address.city', operator: 'equal', value: 'Oslo' }] },
  ],
};

const html = (props: Record<string, unknown>) => renderToString(h(QueryBuilder, { fields, ...props } as never));

describe('QueryBuilder server markup', () => {
  it('fields and the value render the same tree on the server; ids come from paths', () => {
    const out = html({ defaultValue: value });
    assert.match(out, /data-node-id="q"/);
    assert.match(out, /data-node-id="q\.1\.0"/);
    assert.match(out, /<span class="salmon-select-value">Name<\/span>/);
    assert.match(out, /<span class="salmon-select-value">Address City<\/span>/);
    assert.equal(out, html({ defaultValue: value }));
    // Given ids are kept.
    assert.match(html({ defaultValue: { logic: 'and', filters: [{ id: 'mine', field: 'name', operator: 'equal', value: 'x' }] } }), /data-node-id="mine"/);
  });

  it('notCondition shows NOT toggles; a negated group is marked', () => {
    assert.doesNotMatch(html({ defaultValue: value }), /salmon-query-builder__not/);
    const out = html({ defaultValue: value, notCondition: true });
    assert.match(out, /class="salmon-query-builder__not"/);
    assert.match(out, /data-node-id="q\.1" data-not=""/);
  });

  it('buttons toggle remove, add group, clone and lock controls', () => {
    const all = html({ defaultValue: value, buttons: { clone: true, lock: true } });
    for (const a of ['removeCondition', 'addGroup', 'removeGroup', 'cloneRule', 'cloneGroup', 'lock']) assert.match(all, new RegExp(`data-action="${a}"`), a);
    const none = html({ defaultValue: value, buttons: { deleteRule: false, addGroup: false, deleteGroup: false } });
    for (const a of ['removeCondition', 'addGroup', 'removeGroup', 'cloneRule', 'lock']) assert.doesNotMatch(none, new RegExp(`data-action="${a}"`), a);
    // An explicit undefined keeps the default (exactOptionalPropertyTypes callers).
    const defaults = html({ defaultValue: value, buttons: { deleteRule: undefined, addGroup: undefined, deleteGroup: undefined, clone: undefined, lock: undefined } });
    for (const a of ['removeCondition', 'addGroup', 'removeGroup']) assert.match(defaults, new RegExp(`data-action="${a}"`), a);
    for (const a of ['cloneRule', 'lock']) assert.doesNotMatch(defaults, new RegExp(`data-action="${a}"`), a);
  });

  it('readOnly and locked nodes render without edit buttons and with disabled editors', () => {
    const out = html({ defaultValue: value, readOnly: true });
    assert.doesNotMatch(out, /data-action="(addCondition|removeCondition)"/);
    assert.match(out, /data-readonly=""/);
    assert.match(out, /<button aria-label="Field"[^>]*disabled=""/);
    const locked = html({ defaultValue: { logic: 'and', filters: [{ field: 'name', operator: 'equal', value: 'x', locked: true }, { field: 'name', operator: 'equal', value: 'y' }] }, buttons: { lock: true } });
    assert.equal((locked.match(/data-action="removeCondition"/g) ?? []).length, 1);
    assert.match(locked, /data-locked=""/);
    assert.match(locked, /aria-pressed="true" aria-label="Unlock"/);
  });

  it('summary renders the sentence and an Edit button', () => {
    const out = html({ defaultValue: value, summary: true });
    assert.match(out, /Name contains an AND NOT \(Age between 20\.0 – 30\.0 OR Address City equal Oslo\)/);
    assert.match(out, /data-action="edit"/);
    assert.doesNotMatch(out, /salmon-query-builder__group/);
  });

  it('renderGroupHeader and renderRule replace the defaults', () => {
    const out = html({
      defaultValue: value,
      renderGroupHeader: (ctx: { isRoot: boolean; depth: number; controls: unknown }) => h('strong', { 'data-hdr': ctx.depth }, ctx.isRoot ? 'Root' : 'Nested', ctx.controls as never),
      renderRule: (ctx: { rule: { field: string }; index: number; valueEditor: unknown }) => h('em', { 'data-rule': ctx.index }, ctx.rule.field, ctx.valueEditor as never),
    });
    assert.match(out, /<strong data-hdr="1">Root/);
    assert.match(out, /<strong data-hdr="2">Nested/);
    assert.match(out, /<em data-rule="0">name<div class="salmon-field/);
  });

  it('field renderValueEditor gets the value and setValue', () => {
    const f: QueryField[] = [{ field: 'name', renderValueEditor: (ctx) => h('output', { 'data-op': ctx.operator }, String(ctx.value), typeof ctx.setValue) }];
    assert.match(renderToString(h(QueryBuilder, { fields: f, defaultValue: { logic: 'and', filters: [{ field: 'name', operator: 'equal', value: 'v' }] } })), /<output data-op="equal">v<!-- -->function<\/output>/);
  });

  it('groups are named by their connector, rules by position', () => {
    const out = html({ defaultValue: value, 'aria-label': 'Audience' });
    assert.match(out, /role="group" aria-label="Audience" data-node-id="q"/);
    assert.match(out, /role="group" aria-label="Or group" data-node-id="q\.1"/);
    assert.match(out, /aria-label="Condition 2"/);
  });

  it('localeText replaces texts and operator labels', () => {
    const out = html({ defaultValue: value, localeText: { and: 'Und', operatorContains: 'Enthält', addCondition: 'Bedingung' } });
    assert.match(out, />Und</);
    assert.match(out, /Enthält/);
    assert.match(out, /Bedingung/);
  });

  it('shared keys carry the Data Grid defaults', () => {
    for (const [k, v] of Object.entries(QUERY_BUILDER_DEFAULT_LOCALE_TEXT)) {
      if (k in DEFAULT_LOCALE_TEXT) assert.equal(v, (DEFAULT_LOCALE_TEXT as Record<string, unknown>)[k], k);
    }
    for (const k of Object.keys(DEFAULT_LOCALE_TEXT)) if (k.startsWith('operator') && k !== 'operatorLabel') assert.ok(k in QUERY_BUILDER_DEFAULT_LOCALE_TEXT, k);
  });

  it('value editors per type: number, date, boolean, list, between, fixed values', () => {
    const out = html({
      defaultValue: {
        logic: 'and',
        filters: [
          { field: 'age', operator: 'equal', value: 3 },
          { field: 'joined', operator: 'equal', value: '2026-02-03' },
          { field: 'active', operator: 'equal', value: true },
          { field: 'name', operator: 'in', value: ['a', 'b'] },
          { field: 'tier', operator: 'equal', value: 's' },
          { field: 'name', operator: 'isNull' },
        ],
      },
    });
    assert.match(out, /salmon-number-field/);
    assert.match(out, /salmon-date-field|role="spinbutton"/);
    assert.match(out, /type="checkbox"[^>]*checked=""/);
    assert.match(out, /salmon-combobox/);
    assert.equal((out.match(/aria-label="Value"/g) ?? []).length >= 4, true);
    assert.match(out, /<label[^>]*>[^]*?Value/);
    assert.match(html({ defaultValue: { logic: 'and', filters: [{ field: 'age', operator: 'between', value: [1, 2] }] } }), /aria-label="From".*aria-label="To"/s);
  });

  it('editorProps.value reaches only the editors that take each prop; no unknown DOM props', () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    let out: string;
    try {
      out = html({
        defaultValue: {
          logic: 'and',
          filters: [
            { field: 'name', operator: 'equal', value: 'an' },
            { field: 'age', operator: 'equal', value: 3 },
            { field: 'joined', operator: 'equal', value: '2026-02-03' },
            { field: 'active', operator: 'equal', value: true },
            { field: 'tier', operator: 'equal', value: 's' },
            { field: 'tier', operator: 'in', value: ['s'] },
            { field: 'name', operator: 'in', value: ['a'] },
          ],
        },
        // Props of one or a few editors each, plus a DOM attribute for all.
        editorProps: { value: { clearable: true, showStepper: false, hourCycle: 'h23', labelPlacement: 'start', searchable: true, creatable: true, 'data-probe': 'v' } },
      });
    } finally {
      console.error = original;
    }
    assert.deepEqual(errors, []);
    for (const prop of ['clearable', 'showstepper', 'hourcycle', 'labelplacement', 'searchable', 'creatable']) assert.doesNotMatch(out, new RegExp(` ${prop}=`, 'i'));
    // The editors that take a prop still get it: TextField clears, NumberField hides its stepper.
    assert.match(out, /aria-label="Clear"/);
    assert.doesNotMatch(out, /salmon-number-field-stepper/);
    assert.equal((out.match(/data-probe="v"/g) ?? []).length >= 7, true);
  });

  it('name posts the valid value in a hidden input', () => {
    const out = html({ defaultValue: { logic: 'and', filters: [{ field: 'name', operator: 'equal', value: 'x' }, { field: 'name', operator: 'equal' }] }, name: 'q' });
    const m = /<input type="hidden" name="q" value="([^"]*)"/.exec(out);
    assert.ok(m);
    const posted = JSON.parse((m[1] as string).replace(/&quot;/g, '"'));
    assert.equal(posted.filters.length, 1);
  });
});

describe('fields', () => {
  it('operatorsFor per type; field.operators replaces them; custom operators join', () => {
    assert.deepEqual(operatorsFor('boolean'), ['equal', 'notEqual']);
    assert.ok(operatorsFor('string').includes('contains') && operatorsFor('string').includes('in'));
    assert.ok(operatorsFor('number').includes('between'));
    const flat = flattenFields(fields, '.', null, [{ name: 'near', types: ['string'] }]);
    assert.deepEqual(flat.find((f) => f.path === 'address.zip')?.operators, ['equal']);
    assert.ok(flat.find((f) => f.path === 'name')?.operators.includes('near'));
    assert.ok(!flat.find((f) => f.path === 'age')?.operators.includes('near'));
  });

  it('nested paths with pathSeparator, categories, sort', () => {
    const flat = flattenFields(fields, '/', 'desc', undefined);
    assert.deepEqual(flat.map((f) => f.path), ['tier', 'name', 'joined', 'age', 'address/zip', 'address/city', 'active']);
    assert.equal(flat.find((f) => f.path === 'name')?.category, 'Person');
    assert.equal(flat.find((f) => f.path === 'address/city')?.label, 'Address City');
  });

  it('values and formats in the summary', () => {
    const flat = new Map(flattenFields(fields, '.', null, undefined).map((f) => [f.path, f]));
    const text = textOf(undefined);
    const label = (op: string) => text(`operator${op[0]?.toUpperCase()}${op.slice(1)}`);
    const s = summaryText({ logic: 'or', filters: [{ field: 'tier', operator: 'equal', value: 'g' }, { field: 'joined', operator: 'greaterThan', value: '2026-02-03' }, { field: 'age', operator: 'in', value: [1, 2] }] }, (p) => flat.get(p), text, 'en-US', label);
    assert.equal(s, 'Tier equal Gold OR Joined greater than 03/02/2026 OR Age in 1.0, 2.0');
    assert.equal(formatWith(1234.5, 'C2', 'number', 'en-US'), '$1,234.50');
    assert.equal(formatWith('2026-02-03', 'yMMMd', 'date', 'en-US'), 'Feb 3, 2026');
    assert.equal(summaryText({ logic: 'and', filters: [] }, () => undefined, text, 'en-US', label), 'No conditions');
  });
});

describe('validation', () => {
  const flat = new Map(flattenFields(fields, '.', null, undefined).map((f) => [f.path, f]));
  const fieldOf = (p: string) => flat.get(p);
  const text = textOf(undefined);
  const tree = withIds(
    {
      logic: 'and',
      filters: [
        { field: 'name', operator: 'contains', value: '' },
        { field: 'age', operator: 'equal', value: 200 },
        { field: 'age', operator: 'between', value: [1, null] },
        { field: 'name', operator: 'isNull' },
        { field: '', operator: '' },
        { logic: 'or', filters: [] },
        { field: 'age', operator: 'equal', value: 5 },
      ],
    },
    idSource('v'),
  );
  it('incomplete rules and field rules (Form vocabulary) are errors', () => {
    const errors = validateQuery(tree, fieldOf, text, () => false);
    const ids = tree.filters.map((n) => n.id);
    assert.deepEqual([...errors.keys()], [ids[0], ids[1], ids[2], ids[4]]);
    assert.equal(errors.get(ids[0] as string)?.[0], 'Complete this condition');
    assert.match(errors.get(ids[1] as string)?.[0] ?? '', /150/);
    const de = validateQuery(tree, fieldOf, textOf({ validationMax: 'Höchstens {0}', incomplete: 'Unvollständig' }), () => false);
    assert.equal(de.get(ids[1] as string)?.[0], 'Höchstens 150');
  });
  it('the valid value drops incomplete rules and empty groups', () => {
    const v = validValue(tree, fieldOf, () => false);
    assert.deepEqual(v.filters.map((n) => ('field' in n ? `${n.field}:${n.operator}` : 'group')), ['age:equal', 'name:isNull', 'age:equal']);
  });
});

describe('filterRows', () => {
  type Row = { id: string; name: string | null; age: number | null; joined: string; active: boolean; address: { city: string } };
  const rows: Row[] = [
    { id: 'a', name: 'Ann', age: 31, joined: '2026-01-05', active: true, address: { city: 'Oslo' } },
    { id: 'b', name: 'Bob', age: 17, joined: '2025-12-31', active: false, address: { city: 'Bergen' } },
    { id: 'c', name: 'Åsa', age: null, joined: '2026-03-01', active: true, address: { city: 'oslo' } },
    { id: 'd', name: null, age: 45, joined: '2024-06-15', active: false, address: { city: '' } },
    { id: 'e', name: 'dan', age: 31, joined: '2026-01-05', active: true, address: { city: 'Trondheim' } },
  ];
  const qFields: QueryField[] = [{ field: 'name' }, { field: 'age', type: 'number' }, { field: 'joined', type: 'date' }, { field: 'active', type: 'boolean' }, { field: 'city' }];
  const columns: ColumnDef<Row>[] = [
    { columnId: 'name', field: 'name' },
    { columnId: 'age', field: 'age', type: 'number' },
    { columnId: 'joined', field: 'joined', type: 'date' },
    { columnId: 'active', field: 'active', type: 'boolean' },
    { columnId: 'city', valueGetter: (r: Row) => r.address.city },
  ] as never;
  const core = (q: QueryGroup): string[] => {
    const toEntry = (n: QueryGroup['filters'][number]): unknown =>
      'filters' in n ? { kind: 'group', predicate: n.logic, ...(n.not ? { not: true } : {}), filters: n.filters.map(toEntry) } : { columnId: n.field, operator: n.operator, value: n.value ?? null, predicate: 'and', ...(n.matchCase ? { matchCase: true } : {}), ...(n.ignoreAccents ? { ignoreAccent: true } : {}) };
    const engine = createDataGridEngine<Row>({ id: 'p', getRowId: (r: Row) => r.id, columns, dataSource: rows, modules: [createFilterModule<Row>()] } as never) as ReturnType<typeof createDataGridEngine<Row>>;
    engine.dispatch({ type: 'filter.set', filters: [toEntry(q)] } as never);
    const out: string[] = [];
    const count = engine.getSnapshot().rows.count;
    for (let i = 0; i < count; i++) out.push(engine.getRowIdAt(i) as string);
    return out;
  };
  const cases: QueryGroup[] = [
    { logic: 'and', filters: [{ field: 'name', operator: 'contains', value: 'a' }] },
    { logic: 'and', filters: [{ field: 'name', operator: 'contains', value: 'a', matchCase: true }] },
    { logic: 'and', filters: [{ field: 'name', operator: 'startsWith', value: 'a', ignoreAccents: true }] },
    { logic: 'and', filters: [{ field: 'name', operator: 'doesNotContain', value: 'o' }] },
    { logic: 'and', filters: [{ field: 'name', operator: 'isNull' }] },
    { logic: 'and', filters: [{ field: 'age', operator: 'greaterThanOrEqual', value: 31 }] },
    { logic: 'and', filters: [{ field: 'age', operator: 'between', value: [17, 31] }] },
    { logic: 'and', filters: [{ field: 'age', operator: 'notIn', value: [31] }] },
    { logic: 'and', filters: [{ field: 'joined', operator: 'lessThan', value: '2026-01-05' }] },
    { logic: 'and', filters: [{ field: 'joined', operator: 'equal', value: '2026-01-05' }] },
    { logic: 'and', filters: [{ field: 'active', operator: 'equal', value: false }] },
    { logic: 'and', filters: [{ field: 'name', operator: 'like', value: '%n' }, { field: 'name', operator: 'wildcard', value: '?a*' }] },
    { logic: 'or', not: true, filters: [{ field: 'age', operator: 'equal', value: 31 }, { logic: 'and', filters: [{ field: 'name', operator: 'isEmpty' }] }] },
    { logic: 'and', filters: [{ field: 'age', operator: 'isNotNull' }, { logic: 'or', filters: [{ field: 'name', operator: 'endsWith', value: 'n' }, { field: 'active', operator: 'notEqual', value: true }] }] },
  ];
  it('the same rows as the Data Grid filter module', () => {
    for (const q of cases) {
      const ours = filterRows(rows.map((r) => ({ ...r, city: r.address.city })), q, qFields).map((r) => r.id);
      assert.deepEqual(ours, core(q), JSON.stringify(q));
    }
  });
  it('nested paths and custom operators', () => {
    assert.deepEqual(filterRows(rows, { logic: 'and', filters: [{ field: 'address.city', operator: 'equal', value: 'OSLO' }] }).map((r) => r.id), ['a', 'c']);
    const odd = { name: 'odd', evaluate: (v: unknown) => typeof v === 'number' && v % 2 === 1 };
    assert.deepEqual(filterRows(rows, { logic: 'and', filters: [{ field: 'age', operator: 'odd' }] }, qFields, { operators: [odd] }).map((r) => r.id), ['a', 'b', 'd', 'e']);
    assert.equal(filterRows(rows, { logic: 'and', filters: [] }).length, 5);
  });
});

describe('tree model and moves', () => {
  const t: TreeGroup = withIds({ logic: 'and', filters: [{ field: 'a', operator: 'equal' }, { logic: 'or', filters: [{ field: 'b', operator: 'equal' }, { field: 'c', operator: 'equal' }] }, { field: 'd', operator: 'equal' }] }, idSource('t'));
  const ids = (g: TreeGroup): unknown => g.filters.map((n) => ('filters' in n ? ids(n as TreeGroup) : (n as { field: string }).field));
  it('clone gets new ids; depth and group counts', () => {
    const g = t.filters[1] as TreeGroup;
    const copy = cloneNode(g, idSource('x'));
    assert.notEqual(copy.id, g.id);
    assert.notEqual(copy.filters[0]?.id, g.filters[0]?.id);
    assert.equal(groupDepth(t), 2);
    assert.equal(groupCount(t), 2);
  });
  it('keyboard move targets enter adjacent groups and leave at the ends', () => {
    const [a, g, d] = t.filters as [{ id: string }, TreeGroup, { id: string }];
    const apply = (id: string, dir: -1 | 1) => {
      const target = keyboardTarget(t, id, dir);
      return target ? ids(moveNode(t, id, target.groupId, target.index)) : null;
    };
    assert.deepEqual(apply(a.id, 1), [['a', 'b', 'c'], 'd']);
    assert.equal(apply(a.id, -1), null);
    assert.deepEqual(apply(d.id, -1), ['a', ['b', 'c', 'd']]);
    assert.deepEqual(apply((g.filters[0] as { id: string }).id, -1), ['a', 'b', ['c'], 'd']);
    assert.deepEqual(apply((g.filters[1] as { id: string }).id, 1), ['a', ['b'], 'c', 'd']);
    assert.deepEqual(apply((g.filters[0] as { id: string }).id, 1), ['a', ['c', 'b'], 'd']);
    // A group never moves into itself.
    assert.equal(moveNode(t, g.id, g.id, 0), t);
    assert.equal(findNode(t, 'missing'), null);
  });
});

describe('QueryBuilder tree field picker', () => {
  it('fieldTree puts categories on top and nested fields under their parent; only leaves are values', () => {
    const fields: QueryField[] = [
      { field: 'name', label: 'Name', category: 'Person' },
      { field: 'age', label: 'Age', type: 'number', category: 'Person' },
      { field: 'joined', label: 'Joined', type: 'date' },
      { field: 'address', label: 'Address', category: 'Place', fields: [{ field: 'city', label: 'City' }, { field: 'geo', fields: [{ field: 'lat', type: 'number' }] }] },
    ];
    const tree = fieldTree(fields, '/');
    assert.deepEqual(
      tree.map((n: { label: string; leaf: boolean }) => [n.label, n.leaf]),
      [['Person', false], ['Joined', true], ['Place', false]],
    );
    const place = tree[2] as unknown as { children: { label: string; children: { value: string; leaf: boolean; children?: { value: string }[] }[] }[] };
    assert.equal(place.children[0]!.label, 'Address');
    assert.deepEqual(place.children[0]!.children.map((c) => [c.value, c.leaf]), [['address/city', true], ['\u0000address/geo', false]]);
    assert.equal(place.children[0]!.children[1]!.children![0]!.value, 'address/geo/lat');
    // SSR renders the list picker (the tree picker is a client-only lazy chunk).
    const out = renderToString(h(QueryBuilder, { 'aria-label': 'Q', fields, fieldPicker: 'tree', defaultValue: { logic: 'and', filters: [{ field: 'name', operator: 'contains', value: 'a' }] } } as never));
    assert.match(out, /aria-haspopup="listbox"/);
  });
});

