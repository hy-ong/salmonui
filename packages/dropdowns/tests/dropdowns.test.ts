import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Select, SELECT_DEFAULT_LOCALE_TEXT, type SelectProps } from '@salmonui/dropdowns/select';
import { Combobox, COMBOBOX_DEFAULT_LOCALE_TEXT, type ComboboxColumn, type ComboboxProps } from '@salmonui/dropdowns/combobox';
import { changeEvent, joinLabels } from '../dist/dropdown/core.js';
import { compareBy, nextSort } from '../dist/combobox/columns.js';

// Select and Combobox: change events,
// value text, column sorting and the server-rendered markup (trigger, value,
// hidden form element, no popup). The shared collection, search, remote and
// virtual modules are covered by collection.test.ts. Keyboard, popup and pointer behaviour are in
// tests/browser/select.spec.ts and combobox.spec.ts.

interface Fruit {
  readonly value: string;
  readonly label: string;
  readonly family?: string;
  readonly disabled?: boolean;
}

const FRUITS: Fruit[] = [
  { value: 'apple', label: 'Apple', family: 'Pome' },
  { value: 'pear', label: 'Pear', family: 'Pome' },
  { value: 'cherry', label: 'Cherry', family: 'Stone' },
  { value: 'durian', label: 'Durian', family: 'Other', disabled: true },
  { value: 'kiwi', label: 'Kiwi', family: 'Berry' },
];

const select = <Item,>(props: SelectProps<Item>): string => renderToString(createElement(Select as (p: SelectProps<Item>) => ReactElement, props));
const combobox = <Item,>(props: ComboboxProps<Item>): string => renderToString(createElement(Combobox as (p: ComboboxProps<Item>) => ReactElement, props));

describe('change events', () => {
  it('are frozen and materialize items only on first read', () => {
    let reads = 0;
    const event = changeEvent('keyboard', 'selectAll', ['a'], () => (reads++, ['A', 'B']));
    assert.equal(Object.isFrozen(event), true);
    assert.equal(reads, 0);
    assert.deepEqual(event.items, ['A', 'B']);
    assert.deepEqual(event.items, ['A', 'B']);
    assert.equal(reads, 1);
    assert.equal(event.reason, 'selectAll');
    assert.equal(event.source, 'keyboard');
    assert.deepEqual(event.previousValue, ['a']);
  });
});

describe('value text', () => {
  it('joins labels with Intl.ListFormat or valueSeparator', () => {
    assert.equal(joinLabels(['A', 'B', 'C'], undefined, 'en-US'), 'A, B, C');
    assert.equal(joinLabels(['A', 'B'], ' | ', 'en-US'), 'A | B');
  });

  it('exports default texts with plural forms', () => {
    assert.equal(SELECT_DEFAULT_LOCALE_TEXT.selectedCount(1, 'one'), '1 item selected');
    assert.equal(SELECT_DEFAULT_LOCALE_TEXT.selectedCount(3, 'other'), '3 items selected');
    assert.equal(COMBOBOX_DEFAULT_LOCALE_TEXT.removeValue('Kiwi'), 'Remove Kiwi');
    assert.equal(Object.isFrozen(SELECT_DEFAULT_LOCALE_TEXT), true);
  });
});

describe('columns sorting', () => {
  const columns: ComboboxColumn<{ name: string; age: number }>[] = [{ field: 'name' }, { field: 'age' }];
  it('cycles ascending, descending, none; Ctrl adds a level', () => {
    assert.deepEqual(nextSort([], 'name', false), [{ columnId: 'name', direction: 'asc' }]);
    assert.deepEqual(nextSort([{ columnId: 'name', direction: 'asc' }], 'name', false), [{ columnId: 'name', direction: 'desc' }]);
    assert.deepEqual(nextSort([{ columnId: 'name', direction: 'desc' }], 'name', false), []);
    assert.deepEqual(nextSort([{ columnId: 'name', direction: 'asc' }], 'age', true), [{ columnId: 'name', direction: 'asc' }, { columnId: 'age', direction: 'asc' }]);
    assert.deepEqual(nextSort([{ columnId: 'name', direction: 'asc' }], 'age', false), [{ columnId: 'age', direction: 'asc' }]);
  });
  it('compares numbers numerically and text with a collator, level by level', () => {
    const rows = [{ name: 'b', age: 10 }, { name: 'a', age: 9 }, { name: 'a', age: 30 }];
    const sorted = [...rows].sort(compareBy([{ columnId: 'name', direction: 'asc' }, { columnId: 'age', direction: 'desc' }], columns));
    assert.deepEqual(sorted, [{ name: 'a', age: 30 }, { name: 'a', age: 9 }, { name: 'b', age: 10 }]);
  });
});

// ---------------------------------------------------------------------------
// Server rendering
// ---------------------------------------------------------------------------

describe('Select server markup', () => {
  it('renders an APG select-only combobox with the selected label and no popup', () => {
    const html = select({ data: FRUITS, defaultValue: 'cherry', id: 'f', 'aria-labelledby': 'l' });
    assert.match(html, /<button[^>]*id="f"[^>]*type="button"[^>]*role="combobox"[^>]*aria-haspopup="listbox"[^>]*aria-expanded="false"/);
    assert.match(html, /aria-labelledby="l"/);
    assert.match(html, /class="salmon-select-value">Cherry</);
    assert.doesNotMatch(html, /role="listbox"|role="option"|salmon-dropdown-popup/);
    assert.doesNotMatch(html, /aria-controls/);
  });

  it('shows the placeholder hidden from assistive technology while empty', () => {
    const html = select({ data: FRUITS, placeholder: 'Pick one' });
    assert.match(html, /<span class="salmon-select-placeholder" aria-hidden="true">Pick one<\/span>/);
    assert.match(html, /data-empty=""/);
  });

  it('renders a hidden native select with name, required, form and the value', () => {
    const html = select({ data: FRUITS, defaultValue: 'kiwi', name: 'fruit', required: true, form: 'f1' });
    assert.match(html, /<select class="salmon-dropdown-native" name="fruit" required="" form="f1" tabindex="-1" aria-hidden="true">/);
    assert.match(html, /<option value="kiwi" selected=""><\/option>/);
    const empty = select({ data: FRUITS, name: 'fruit', required: true });
    assert.match(empty, /<option value="" selected=""><\/option>/);
    assert.doesNotMatch(select({ data: FRUITS }), /<select/);
  });

  it('multiple: one selected option per value, labels joined', () => {
    const html = select({ data: FRUITS, multiple: true, defaultValue: ['apple', 'kiwi'], name: 'tags' });
    assert.match(html, /<select[^>]*multiple=""/);
    assert.match(html, /<option value="apple" selected=""><\/option><option value="kiwi" selected=""><\/option>/);
    assert.match(html, /salmon-select-value">Apple, Kiwi</);
    assert.match(select({ data: FRUITS, multiple: true, defaultValue: ['apple', 'kiwi'], valueSeparator: '; ' }), /Apple; Kiwi/);
  });

  it('valueDisplay="count" and maxVisibleValues summarize the selection', () => {
    assert.match(select({ data: FRUITS, multiple: true, valueDisplay: 'count', defaultValue: ['apple', 'kiwi'] }), />2 items selected</);
    assert.match(select({ data: FRUITS, multiple: true, valueDisplay: 'count', defaultValue: ['apple'] }), />1 item selected</);
    assert.match(select({ data: FRUITS, multiple: true, maxVisibleValues: 1, defaultValue: ['apple', 'kiwi', 'pear'] }), />Apple \+2</);
    assert.match(select({ data: FRUITS, multiple: true, valueDisplay: 'count', defaultValue: ['apple', 'kiwi'], localeText: { selectedCount: (n) => `${n} gewählt` } }), />2 gewählt</);
  });

  it('disabled uses the native attribute and is not submitted; readOnly is aria-readonly', () => {
    const disabled = select({ data: FRUITS, disabled: true, name: 'x', defaultValue: 'kiwi' });
    assert.match(disabled, /role="combobox"[^>]*disabled=""/);
    assert.match(disabled, /<select[^>]*disabled=""/);
    assert.match(disabled, /data-disabled=""/);
    const readOnly = select({ data: FRUITS, readOnly: true, name: 'x', defaultValue: 'kiwi' });
    assert.match(readOnly, /aria-readonly="true"/);
    assert.doesNotMatch(readOnly, /<select[^>]*disabled/);
  });

  it('className, style, classNames and styles reach their parts; DOM props reach the trigger', () => {
    const html = select({ data: FRUITS, className: 'mine', style: { width: 300 }, classNames: { trigger: 't-x', value: 'v-x' }, styles: { trigger: { color: 'red' } }, title: 'Fruit', 'data-test': 'q' } as SelectProps<Fruit>);
    assert.match(html, /<div class="salmon-select mine" style="width:300px"/);
    assert.match(html, /class="salmon-select-trigger t-x" style="color:red"/);
    assert.match(html, /class="salmon-select-value v-x"/);
    assert.match(html, /<button title="Fruit" data-test="q"/);
  });

  it('renderValue renders the selection; getItemIcon is for options only', () => {
    const html = select({ data: FRUITS, defaultValue: 'pear', renderValue: ({ items }) => createElement('b', null, items.map((f) => f.label.toUpperCase()).join()) });
    assert.match(html, /<b>PEAR<\/b>/);
  });

  it('a value outside loaded data takes its label from selectedItems', () => {
    const remote = { mode: 'remote' as const, read: () => Promise.resolve({ version: 0, rows: [] }) };
    const html = select<Fruit>({ data: remote, defaultValue: 'mango', selectedItems: [{ value: 'mango', label: 'Mango' }] });
    assert.match(html, /salmon-select-value">Mango</);
  });

  it('clearable renders a clear button only with a value', () => {
    assert.match(select({ data: FRUITS, clearable: true, defaultValue: 'kiwi' }), /class="salmon-select-clear" aria-label="Clear"/);
    assert.doesNotMatch(select({ data: FRUITS, clearable: true }), /salmon-select-clear/);
    assert.doesNotMatch(select({ data: FRUITS, defaultValue: 'kiwi' }), /salmon-select-clear/);
  });

  it('server work does not scale with data: 100,000 items render the trigger only', () => {
    const data = Array.from({ length: 100_000 }, (_, i) => ({ value: i, label: `Item ${i}` }));
    const t = performance.now();
    const html = select({ data, defaultValue: 5 });
    const ms = performance.now() - t;
    assert.match(html, />Item 5</);
    assert.ok(html.length < 2000, `markup ${html.length} bytes`);
    assert.ok(ms < 100, `${ms.toFixed(1)} ms`);
  });
});

describe('Combobox server markup', () => {
  it('renders an editable combobox with list autocomplete and a trigger button out of the tab order', () => {
    const html = combobox({ data: FRUITS, defaultValue: 'kiwi', id: 'c' });
    assert.match(html, /<input[^>]*id="c"[^>]*type="text"[^>]*role="combobox"[^>]*aria-autocomplete="list"[^>]*aria-haspopup="listbox"[^>]*aria-expanded="false"/);
    assert.match(html, /value="Kiwi"/);
    assert.match(html, /<button type="button" tabindex="-1" class="salmon-combobox-trigger" aria-label="Show options" aria-expanded="false"/);
    assert.doesNotMatch(html, /role="listbox"/);
    assert.doesNotMatch(combobox({ data: FRUITS, showTrigger: false }), /salmon-combobox-trigger/);
  });

  it('autofill switches aria-autocomplete to both', () => {
    assert.match(combobox({ data: FRUITS, autofill: true }), /aria-autocomplete="both"/);
  });

  it('multiple renders chips in a labelled list with remove buttons and chip props', () => {
    const html = combobox({ data: FRUITS, multiple: true, defaultValue: ['apple', 'kiwi'], name: 'tags', getChipProps: (f) => (f.value === 'kiwi' ? { className: 'green', 'data-k': 1 } : undefined) });
    assert.match(html, /<span role="list" aria-label="Selected values" class="salmon-combobox-chips">/);
    assert.match(html, /<span role="listitem" class="salmon-combobox-chip">.*?Apple.*?aria-label="Remove Apple"/);
    assert.match(html, /<span data-k="1" role="listitem" class="salmon-combobox-chip green">/);
    assert.match(html, /<select class="salmon-dropdown-native" name="tags" multiple=""/);
    assert.match(combobox({ data: FRUITS, multiple: true, defaultValue: ['apple', 'kiwi', 'pear'], maxVisibleValues: 1 }), /salmon-combobox-more">\+2</);
  });

  it('renderChip customizes the chip content', () => {
    const html = combobox({ data: FRUITS, multiple: true, defaultValue: ['pear'], renderChip: ({ label }) => createElement('i', null, `#${label}`) });
    assert.match(html, /<i>#Pear<\/i>/);
  });

  it('columns announce a grid popup', () => {
    const html = combobox({ data: FRUITS, columns: [{ field: 'label', header: 'Name' }] });
    assert.match(html, /aria-haspopup="grid"/);
    assert.doesNotMatch(html, /role="grid"/);
  });

  it('clearable defaults to true for Combobox', () => {
    assert.match(combobox({ data: FRUITS, defaultValue: 'kiwi' }), /salmon-combobox-clear/);
    assert.doesNotMatch(combobox({ data: FRUITS, defaultValue: 'kiwi', clearable: false }), /salmon-combobox-clear/);
  });

  it('inputValue is reactive text of the input', () => {
    assert.match(combobox({ data: FRUITS, inputValue: 'ki' }), /value="ki"/);
  });
});

describe('field parts: label, description and errorMessage', () => {
  const idOf = (html: string, cls: string): string => new RegExp(`class="${cls}" id="([^"]+)"`).exec(html)?.[1] ?? '';
  const attr = (html: string, tag: string, name: string): string | null => new RegExp(`<${tag}\\b[^>]*\\s${name}="([^"]*)"`).exec(html)?.[1] ?? null;

  it('without them the markup is the bare control (no wrapper, no ARIA added)', () => {
    for (const html of [select({ data: FRUITS }), combobox({ data: FRUITS })]) {
      assert.doesNotMatch(html, /salmon-dropdown-field|aria-describedby|aria-labelledby|aria-invalid/);
      assert.match(html, /^<div class="salmon-(select|combobox)"/);
    }
  });

  it('Select: a label names the trigger, the description and the shown error describe it', () => {
    const html = select({ data: FRUITS, label: 'Fruit', description: 'Pick one', errorMessage: 'Required', invalid: true, required: true, name: 'fruit' });
    assert.match(html, /^<div class="salmon-dropdown-field"><label class="salmon-dropdown-field-label" id="[^"]+">Fruit<\/label><div class="salmon-select"/);
    const label = idOf(html, 'salmon-dropdown-field-label');
    const description = idOf(html, 'salmon-dropdown-field-description');
    const error = idOf(html, 'salmon-dropdown-field-error');
    assert.ok(label && description && error);
    assert.equal(attr(html, 'button', 'aria-labelledby'), label);
    assert.equal(attr(html, 'button', 'aria-describedby'), `${description} ${error}`);
    assert.equal(attr(html, 'button', 'aria-invalid'), 'true');
    assert.equal(attr(html, 'button', 'aria-required'), 'true');
    // The error shows only while invalid.
    const valid = select({ data: FRUITS, label: 'Fruit', errorMessage: 'Required' });
    assert.doesNotMatch(valid, /salmon-dropdown-field-error|aria-invalid|aria-describedby/);
  });

  it('explicit aria props win: aria-labelledby / aria-describedby replace the generated ones', () => {
    const html = select({ data: FRUITS, label: 'Fruit', description: 'Pick one', 'aria-labelledby': 'outer', 'aria-describedby': 'hint' });
    assert.equal(attr(html, 'button', 'aria-labelledby'), 'outer');
    assert.equal(attr(html, 'button', 'aria-describedby'), 'hint');
    assert.match(html, /salmon-dropdown-field-label/);
    // Inside a Field: the Field's id and ARIA wiring pass through unchanged.
    const inField = select({ data: FRUITS, id: 'field-input', 'aria-describedby': 'field-description', 'aria-invalid': true });
    assert.match(inField, /<button[^>]*id="field-input"/);
    assert.equal(attr(inField, 'button', 'aria-describedby'), 'field-description');
    assert.equal(attr(inField, 'button', 'aria-invalid'), 'true');
  });

  it('Combobox: the same parts around the input', () => {
    const html = combobox({ data: FRUITS, label: 'Fruit', description: 'Type to search' });
    assert.match(html, /^<div class="salmon-dropdown-field"><label class="salmon-dropdown-field-label"[^>]*>Fruit<\/label><div class="salmon-combobox"/);
    assert.equal(attr(html, 'input', 'aria-labelledby'), idOf(html, 'salmon-dropdown-field-label'));
    assert.equal(attr(html, 'input', 'aria-describedby'), idOf(html, 'salmon-dropdown-field-description'));
  });
});
