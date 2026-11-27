import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { Select } from '@salmonui/dropdowns/select';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { TreeSelect } from '@salmonui/dropdowns/tree-select';
import { DateField, DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { TimeField, TimePicker } from '@salmonui/calendars/time-picker';

// `size` on the dropdown and picker controls: server markup carries
// `data-size` (default `md`) on the root, or on the field group for DateField
// and TimeField, and the prop never reaches a DOM element as `size`. Measured
// heights are in tests/browser/control-metrics.spec.ts.

const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'kiwi', label: 'Kiwi' },
];

const render = (type: unknown, props: Record<string, unknown>) => renderToString(h(type as ComponentType<Record<string, unknown>>, props));
const rootSize = (html: string, cls: string) => new RegExp(`<div[^>]*class="${cls}[^"]*"[^>]*>`).exec(html)?.[0].match(/data-size="([^"]*)"/)?.[1];

const cases: [string, unknown, string, Record<string, unknown>][] = [
  ['Select', Select, 'salmon-select', { data: FRUITS, 'aria-label': 'Fruit' }],
  ['Combobox', Combobox, 'salmon-combobox', { data: FRUITS, 'aria-label': 'Fruit' }],
  ['TreeSelect', TreeSelect, 'salmon-tree-select', { data: [{ id: 'a', label: 'A' }], getItemValue: (n: { id: string }) => n.id, getItemLabel: (n: { label: string }) => n.label, 'aria-label': 'Node' }],
  ['DatePicker', DatePicker, 'salmon-date-picker', { label: 'Date', defaultValue: '2026-11-24' }],
  ['DateRangePicker', DateRangePicker, 'salmon-date-range-picker', { label: 'Range' }],
  ['TimePicker', TimePicker, 'salmon-time-picker', { label: 'Time' }],
];

describe('size prop (control sizes)', () => {
  for (const [name, type, cls, props] of cases) {
    it(`${name}: data-size on the root, md by default, no DOM size attribute`, () => {
      assert.equal(rootSize(render(type, props), cls), 'md');
      for (const size of ['sm', 'md', 'lg']) {
        const html = render(type, { ...props, size });
        assert.equal(rootSize(html, cls), size);
        assert.doesNotMatch(html, /\ssize="/);
      }
    });
  }

  for (const [name, type] of [
    ['DateField', DateField],
    ['TimeField', TimeField],
  ] as const) {
    it(`${name}: data-size on the field group, md by default`, () => {
      assert.match(render(type, { label: 'When' }), /role="group"[^>]*data-size="md"|data-size="md"[^>]*role="group"/);
      const html = render(type, { label: 'When', size: 'lg' });
      assert.match(html, /<div[^>]*data-size="lg"[^>]*role="group"[^>]*class="salmon-date-field__group"|<div[^>]*role="group"[^>]*data-size="lg"/);
      assert.doesNotMatch(html, /\ssize="/);
    });
  }

  it('a picker keeps its inner field at md: the picker root sizes the control', () => {
    const html = render(DatePicker, { label: 'Date', size: 'sm' });
    assert.equal(rootSize(html, 'salmon-date-picker'), 'sm');
    assert.match(html, /role="group"/);
    assert.equal((html.match(/data-size="sm"/g) ?? []).length, 1);
  });
});
