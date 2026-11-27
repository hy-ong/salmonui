// Buttons family server markup: every behavior verified through SSR is
// asserted on renderToString output here; interaction is covered by
// tests/browser/buttons.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { Button, ButtonGroup, ToggleButton, ToggleButtonGroup, type ButtonProps, type ToggleButtonGroupProps } from '@salmonui/buttons/button';
import { MenuButton, type MenuItemData } from '@salmonui/buttons/menu';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

const html = (element: ReactElement) => renderToString(element);
const button = (props: Partial<ButtonProps> & { children?: ReactNode } = {}) => html(h(Button, props as ButtonProps));
const attr = (markup: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
const icon = (name: string) => h('svg', { className: `icon-${name}` });

describe('Button markup', () => {
  it('a native button, type="button" by default, children in a label part', () => {
    const out = button({ children: h('b', null, 'Save') });
    assert.match(out, /^<button /);
    assert.equal(attr(out, 'type'), 'button');
    assert.equal(attr(out, 'class'), 'salmon-button');
    assert.match(out, /<span class="salmon-button__label"><b>Save<\/b><\/span>/);
    assert.equal(attr(button({ type: 'submit', children: 'Send' }), 'type'), 'submit');
    assert.equal(attr(button({ type: 'reset', children: 'Clear' }), 'type'), 'reset');
  });

  it('tone defaults to neutral; every tone is a data-tone hook', () => {
    assert.equal(attr(button({ children: 'x' }), 'data-tone'), 'neutral');
    for (const tone of ['neutral', 'primary', 'success', 'warning', 'danger', 'info'] as const) {
      const out = button({ tone, children: 'x' });
      assert.equal(attr(out, 'data-tone'), tone);
      assert.equal(attr(out, 'data-variant'), 'solid');
    }
  });

  it('variants and sizes are data hooks with solid / md defaults', () => {
    for (const variant of ['solid', 'outline', 'ghost', 'link', 'chip'] as const) assert.equal(attr(button({ variant, children: 'x' }), 'data-variant'), variant);
    assert.equal(attr(button({ children: 'x' }), 'data-size'), 'md');
    for (const size of ['sm', 'md', 'lg'] as const) assert.equal(attr(button({ size, children: 'x' }), 'data-size'), size);
  });

  it('disabled is the native attribute', () => {
    const out = button({ disabled: true, children: 'x' });
    assert.match(out, /\sdisabled=""/);
    assert.equal(attr(out, 'aria-disabled'), null);
  });

  it('iconStart / iconEnd render decorative parts around the label in logical order', () => {
    const out = button({ iconStart: icon('start'), iconEnd: icon('end'), children: 'Next' });
    const start = out.indexOf('icon-start');
    const label = out.indexOf('salmon-button__label');
    const end = out.indexOf('icon-end');
    assert.ok(start > 0 && start < label && label < end);
    assert.equal(out.match(/<span class="salmon-button__icon" aria-hidden="true">/g)?.length, 2);
  });

  it('iconOnly sets the square-metrics hook and keeps the accessible name', () => {
    const out = html(h(Button, { iconOnly: true, 'aria-label': 'Delete', iconStart: icon('trash') }));
    assert.equal(attr(out, 'data-icon-only'), '');
    assert.equal(attr(out, 'aria-label'), 'Delete');
    assert.doesNotMatch(out, /salmon-button__label/);
  });

  it('render switches to the returned element and keeps classes, data hooks, ARIA and handlers', () => {
    const link = html(h(Button, { variant: 'link', 'aria-describedby': 'hint', render: (props) => h('a', { ...props, href: '/orders' }), children: 'Orders' }));
    assert.match(link, /^<a /);
    assert.equal(attr(link, 'href'), '/orders');
    assert.equal(attr(link, 'class'), 'salmon-button');
    assert.equal(attr(link, 'data-variant'), 'link');
    assert.equal(attr(link, 'aria-describedby'), 'hint');
    assert.equal(attr(link, 'type'), null, 'no type on a non-button element');
    assert.equal(attr(link, 'role'), null, 'a link keeps its role');
    const disabledLink = html(h(Button, { disabled: true, render: (props) => h('a', { ...props, href: '/x' }), children: 'x' }));
    assert.equal(attr(disabledLink, 'aria-disabled'), 'true');
    assert.doesNotMatch(disabledLink, /\sdisabled=/);
    const span = html(h(Button, { render: (props) => h('span', props), children: 'Custom' }));
    assert.equal(attr(span, 'role'), 'button');
    assert.equal(attr(span, 'tabindex'), '0');
  });

  it('className / style append, title, id, aria-* and data-* pass through', () => {
    const out = button({ className: 'mine', style: { width: '100%' }, title: 'Save the order', id: 'save', 'aria-describedby': 'd', 'data-testid': 'save', children: 'Save' } as Partial<ButtonProps>);
    assert.equal(attr(out, 'class'), 'salmon-button mine');
    assert.equal(attr(out, 'style'), 'width:100%');
    assert.equal(attr(out, 'title'), 'Save the order');
    assert.equal(attr(out, 'id'), 'save');
    assert.equal(attr(out, 'aria-describedby'), 'd');
    assert.equal(attr(out, 'data-testid'), 'save');
    assert.equal(attr(button({ name: 'intent', value: 'save', form: 'f1', children: 'x' }), 'form'), 'f1');
  });

  it('the stylesheet has focus-visible, hover and active states and no physical properties', () => {
    // button.css is the base button rules (styles/button-core.css) followed by the extras.
    const core = readFileSync(new URL('../styles/button-core.css', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../dist/button.css', import.meta.url), 'utf8');
    for (const sheet of [core, css]) {
      assert.doesNotMatch(sheet, /:focus(?!-visible)/);
      assert.doesNotMatch(sheet, /(?<![-\w])(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/);
    }
    assert.match(core, /\.salmon-button:focus-visible/);
    assert.match(core, /\.salmon-button[^{]*:hover/);
    assert.match(core, /\.salmon-button[^{]*:active/);
    assert.match(css, /:hover/);
    // Each module sits in its cascade layer: the aggregate holds the source modules.
    const all = readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8');
    assert.ok(all.includes(core) && all.includes(readFileSync(new URL('../styles/button.css', import.meta.url), 'utf8')), 'the package styles.css includes button.css');
  });

  it('button.css is button-core.css then the chip, progress and floating extras; core styles.css has no button rules', () => {
    const read = (url: URL): string => readFileSync(url, 'utf8');
    const core = read(new URL('../styles/button-core.css', import.meta.url));
    const extras = read(new URL('../styles/button.css', import.meta.url));
    // Each module sits in its cascade layer, the base below the extras.
    const inOrder = (css: string): boolean => css.includes(core) && css.indexOf(core) < css.indexOf(extras);
    const button = read(new URL('../dist/button.css', import.meta.url));
    assert.ok(inOrder(button) && button.match(/^@layer salmon\.[a-z]+ \{$/gm)?.length === 2, 'button.css is button-core.css then the extras');
    assert.ok(inOrder(read(new URL('../dist/menu.css', import.meta.url))), 'menu.css carries button.css');
    assert.ok(!read(new URL(import.meta.resolve('@salmonui/core/styles.css'))).includes('.salmon-button'), 'core styles.css is the theme only');
    assert.doesNotMatch(extras, /\.salmon-button:focus-visible/, 'the extras do not repeat button-core');
    assert.doesNotMatch(core, /data-variant='chip'|data-progress|data-floating/);
    // Chip hover and pressed must not beat the disabled state that comes earlier.
    assert.match(extras, /\[data-variant='chip'\]:hover:where\(:enabled\)/);
    assert.match(extras, /\[data-variant='chip'\]\[data-pressed\]:where\(:enabled\) \{/);
    const scheduler = read(new URL(import.meta.resolve('@salmonui/scheduler/styles.css')));
    assert.ok(scheduler.includes(core), 'scheduler.css carries button-core for its plain buttons');
    assert.ok(!scheduler.includes(extras), 'scheduler.css leaves the button extras out');
  });
});

describe('Progress Button (folded into Button)', () => {
  it('loading shows a spinner, aria-busy, aria-disabled (focus kept), and a hidden label', () => {
    const out = button({ loading: true, children: 'Save' });
    assert.equal(attr(out, 'aria-busy'), 'true');
    assert.equal(attr(out, 'aria-disabled'), 'true');
    assert.equal(attr(out, 'data-loading'), '');
    assert.doesNotMatch(out, /\sdisabled=/, 'focus is kept: no native disabled');
    assert.match(out, /<span class="salmon-button__spinner" aria-hidden="true"><\/span>/);
    assert.match(out, /<span class="salmon-button__sr"> Loading<\/span>/);
    assert.match(button({ loading: true, loadingLabel: 'Saving', children: 'Save' }), /> Saving<\/span>/);
  });

  it('the spinner takes the iconStart slot; spinner replaces the graphic', () => {
    const out = button({ loading: true, iconStart: icon('save'), spinner: icon('custom-spinner'), children: 'Save' });
    assert.doesNotMatch(out, /icon-save/);
    assert.match(out, /<span class="salmon-button__spinner" aria-hidden="true"><svg class="icon-custom-spinner">/);
  });

  it('progress fills from inline-start, exposes data-progress and hidden text, no spinner', () => {
    const out = button({ progress: 45, children: 'Upload' });
    assert.equal(attr(out, 'data-progress'), '45');
    assert.match(attr(out, 'style') ?? '', /--salmon-button-progress:45%/);
    assert.match(out, /<span class="salmon-button__sr"> 45%<\/span>/);
    assert.doesNotMatch(out, /salmon-button__spinner/);
    assert.doesNotMatch(out, /role="progressbar"/);
    assert.equal(attr(button({ progress: 140, children: 'x' }), 'data-progress'), '100');
    assert.match(button({ progress: 30, progressLabel: (v) => `${v} percent uploaded`, children: 'x' }), /> 30 percent uploaded</);
  });

  it('inherited Button members apply; new props are an ordinary re-render', () => {
    const a = button({ progress: 10, tone: 'success', variant: 'outline', children: 'Uploading' });
    const b = button({ progress: 90, tone: 'success', variant: 'outline', children: 'Almost done' });
    assert.equal(attr(a, 'data-tone'), 'success');
    assert.equal(attr(a, 'data-variant'), 'outline');
    assert.match(b, /Almost done/);
    assert.equal(attr(b, 'data-progress'), '90');
  });
});

describe('Floating Action Button (folded into Button)', () => {
  it('floating defaults to bottomEnd, viewport scope and the primary tone', () => {
    const out = html(h(Button, { floating: true, iconOnly: true, 'aria-label': 'Add', iconStart: icon('plus') }));
    assert.equal(attr(out, 'data-floating'), 'bottomEnd');
    assert.equal(attr(out, 'data-floating-scope'), 'viewport');
    assert.equal(attr(out, 'data-tone'), 'primary');
    for (const position of ['topStart', 'topCenter', 'topEnd', 'middleStart', 'middleCenter', 'middleEnd', 'bottomStart', 'bottomCenter', 'bottomEnd'] as const) {
      assert.equal(attr(button({ floating: position, children: 'x' }), 'data-floating'), position);
    }
    assert.equal(attr(button({ floating: true, tone: 'danger', children: 'x' }), 'data-tone'), 'danger');
    const css = readFileSync(new URL('../dist/button.css', import.meta.url), 'utf8');
    assert.match(css, /\[data-floating\]\s*\{[^}]*position: fixed[^}]*border-radius: var\(--salmon-radius-full\)[^}]*box-shadow/);
  });

  it('scope, hidden, style insets, tone / variant and inherited members', () => {
    const out = button({ floating: 'topStart', floatingScope: 'parent', hidden: true, style: { insetBlockStart: 40 }, tone: 'info', variant: 'outline', repeat: true, children: 'Help' });
    assert.equal(attr(out, 'data-floating-scope'), 'parent');
    assert.match(out, /\shidden=""/);
    // The base rule lives in button-core.css, next to the display it beats.
    assert.match(readFileSync(new URL('../styles/button-core.css', import.meta.url), 'utf8'), /\.salmon-button\[hidden\]\s*\{\s*display: none/, 'hidden wins over the display of .salmon-button');
    assert.equal(attr(out, 'style'), 'inset-block-start:40px');
    assert.equal(attr(out, 'data-tone'), 'info');
    assert.equal(attr(out, 'data-variant'), 'outline');
  });
});

describe('ToggleButton markup', () => {
  it('aria-pressed and data-pressed follow pressed / defaultPressed', () => {
    const off = html(h(ToggleButton, { children: 'Bold' }));
    assert.equal(attr(off, 'aria-pressed'), 'false');
    assert.equal(attr(off, 'data-pressed'), null);
    const on = html(h(ToggleButton, { defaultPressed: true, children: 'Bold' }));
    assert.equal(attr(on, 'aria-pressed'), 'true');
    assert.equal(attr(on, 'data-pressed'), '');
    assert.equal(attr(html(h(ToggleButton, { pressed: true, defaultPressed: false, children: 'Bold' })), 'aria-pressed'), 'true');
  });

  it('a standalone ToggleButton with name renders a hidden input while pressed', () => {
    assert.match(html(h(ToggleButton, { name: 'bold', defaultPressed: true, children: 'Bold' })), /<input type="hidden" name="bold" value="on"\/>/);
    assert.match(html(h(ToggleButton, { name: 'bold', value: 'yes', pressed: true, children: 'Bold' })), /value="yes"/);
    assert.doesNotMatch(html(h(ToggleButton, { name: 'bold', children: 'Bold' })), /<input/);
    assert.doesNotMatch(html(h(ToggleButton, { name: 'bold', defaultPressed: true, disabled: true, children: 'Bold' })), /<input/);
  });
});

describe('ButtonGroup markup', () => {
  const group = (props: Record<string, unknown>, ...children: ReactElement[]) => html(h(ButtonGroup, props, ...children));

  it('role="group" with a name, orientation and attached hooks', () => {
    const out = group({ 'aria-label': 'Actions' }, h(Button, { key: 'a' }, 'A'));
    assert.match(out, /^<div role="group" aria-label="Actions" class="salmon-button-group" data-orientation="horizontal" data-attached="">/);
    const vertical = group({ 'aria-label': 'Actions', orientation: 'vertical', attached: false });
    assert.equal(attr(vertical, 'data-orientation'), 'vertical');
    assert.equal(attr(vertical, 'data-attached'), null);
  });

  it('group variant / tone / size are inherited unless a child sets its own; ghost groups are allowed', () => {
    const out = group({ 'aria-label': 'x', variant: 'ghost', tone: 'primary', size: 'sm' }, h(Button, { key: 'a' }, 'A'), h(Button, { key: 'b', tone: 'danger', variant: 'outline', size: 'lg' }, 'B'));
    const [a, b] = out.split('<button').slice(1) as [string, string];
    assert.match(a, /data-variant="ghost" data-tone="primary" data-size="sm"/);
    assert.match(b, /data-variant="outline" data-tone="danger" data-size="lg"/);
  });

  it('disabled on the group disables every button unless a button opts out', () => {
    const out = group({ 'aria-label': 'x', disabled: true }, h(Button, { key: 'a' }, 'A'), h(Button, { key: 'b', disabled: false }, 'B'));
    const [a, b] = out.split('<button').slice(1) as [string, string];
    assert.match(a, /\sdisabled=""/);
    assert.doesNotMatch(b, /\sdisabled=""/);
  });

  it('action chips are small chip-styled Buttons in a spaced ButtonGroup', () => {
    const out = group({ 'aria-label': 'Suggestions', attached: false, variant: 'chip', size: 'sm' }, h(Button, { key: 'a', onClick: () => undefined }, 'Reply'));
    assert.match(out, /data-variant="chip" data-tone="neutral" data-size="sm"/);
    assert.equal(attr(out, 'data-attached'), null);
  });
});

describe('ToggleButtonGroup markup', () => {
  const items = (...values: string[]) => values.map((v) => h(ToggleButton, { key: v, value: v }, v.toUpperCase()));
  const tgroup = (props: Partial<ToggleButtonGroupProps>, children = items('left', 'center', 'right')) => html(h(ToggleButtonGroup, { 'aria-label': 'Align', ...props } as ToggleButtonGroupProps, ...children));
  const buttons = (markup: string) => markup.split('<button').slice(1);

  it('single mode is a radiogroup of radios; the selected radio is the tab stop', () => {
    const out = tgroup({ defaultValue: 'center' });
    assert.match(out, /^<div role="radiogroup" aria-orientation="horizontal" aria-label="Align" class="salmon-toggle-button-group" data-selection-mode="single"/);
    const [left, center, right] = buttons(out) as [string, string, string];
    for (const b of [left, center, right]) assert.equal(attr(b, 'role'), 'radio');
    assert.equal(attr(left, 'aria-checked'), 'false');
    assert.equal(attr(center, 'aria-checked'), 'true');
    assert.equal(attr(center, 'data-pressed'), '');
    assert.equal(attr(center, 'tabindex'), '0');
    assert.equal(attr(left, 'tabindex'), '-1');
    assert.equal(attr(right, 'tabindex'), '-1');
    assert.equal(attr(buttons(tgroup({ value: 'right', defaultValue: 'left' }))[2] ?? '', 'aria-checked'), 'true', 'value wins over defaultValue');
  });

  it('multiple mode is a group of aria-pressed toggle buttons', () => {
    const out = tgroup({ selectionMode: 'multiple', defaultValue: ['left', 'right'] });
    assert.match(out, /^<div role="group" aria-label="Align" class="salmon-toggle-button-group" data-selection-mode="multiple"/);
    const [left, center, right] = buttons(out) as [string, string, string];
    assert.equal(attr(left, 'aria-pressed'), 'true');
    assert.equal(attr(center, 'aria-pressed'), 'false');
    assert.equal(attr(right, 'aria-pressed'), 'true');
    assert.equal(attr(left, 'role'), null);
    assert.equal(attr(left, 'tabindex'), '0', 'the first selected item is the tab stop');
  });

  it('name renders one hidden input per selected value, none while disabled', () => {
    const out = tgroup({ selectionMode: 'multiple', name: 'align', defaultValue: ['left', 'right'] });
    assert.equal(out.match(/<input type="hidden" name="align"/g)?.length, 2);
    assert.match(out, /value="left"/);
    assert.equal(tgroup({ selectionMode: 'multiple', name: 'align', defaultValue: ['left'], disabled: true }).match(/<input/g), null);
    assert.equal(tgroup({ defaultValue: 'left' }).match(/<input/g), null, 'nothing without name');
  });

  it('group disabled disables every item; per-item disabled too', () => {
    for (const b of buttons(tgroup({ disabled: true }))) assert.match(b, /\sdisabled=""/);
    const out = tgroup({}, [h(ToggleButton, { key: 'a', value: 'a' }, 'A'), h(ToggleButton, { key: 'b', value: 'b', disabled: true }, 'B')]);
    assert.doesNotMatch(buttons(out)[0] ?? '', /\sdisabled=""/);
    assert.match(buttons(out)[1] ?? '', /\sdisabled=""/);
  });

  it('the chip variant styles every item and spaces the group', () => {
    const out = tgroup({ variant: 'chip', tone: 'primary', selectionMode: 'multiple', defaultValue: ['left'] });
    assert.equal(attr(out, 'data-attached'), null);
    for (const b of buttons(out)) assert.match(b, /data-variant="chip" data-tone="primary"/);
    const css = readFileSync(new URL('../dist/button.css', import.meta.url), 'utf8');
    assert.match(css, /\[data-variant='chip'\]\[data-pressed\]::after/, 'filter chips draw a check when pressed');
  });

  it('items are ToggleButtons with value, children, icons, className and attributes', () => {
    const out = tgroup({ variant: 'chip', defaultValue: 'a' }, [
      h(ToggleButton, { key: 'a', value: 'a', iconStart: icon('avatar'), iconEnd: icon('trail'), className: 'vip', title: 'Andrew', 'data-id': 7 } as never, h('em', null, 'Andrew')),
    ]);
    assert.match(out, /icon-avatar/);
    assert.match(out, /icon-trail/);
    assert.match(out, /class="salmon-button vip"/);
    assert.match(out, /title="Andrew"/);
    assert.match(out, /data-id="7"/);
    assert.match(out, /<em>Andrew<\/em>/);
    assert.match(out, /aria-checked="true"/);
  });
});

describe('Buttons family entry', () => {
  it('every component renders on the server deterministically', () => {
    const tree = () =>
      h('div', null, h(Button, { tone: 'primary' }, 'Save'), h(ToggleButton, null, 'Bold'), h(ButtonGroup, { 'aria-label': 'g' }, h(Button, null, 'A')), h(ToggleButtonGroup, { 'aria-label': 't', defaultValue: 'a' }, h(ToggleButton, { value: 'a' }, 'A')));
    assert.equal(html(tree()), html(tree()));
  });
});

// SSR budgets: medians of
// repeated renderToString calls after a warm-up.
describe('Buttons SSR budgets @perf', () => {
  const medianMs = (fn: () => unknown, runs = 21): number => {
    for (let i = 0; i < 5; i++) fn();
    const samples: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      fn();
      samples.push(performance.now() - t0);
    }
    return samples.sort((a, b) => a - b)[runs >> 1] as number;
  };
  const tones = ['neutral', 'primary', 'success', 'warning', 'danger', 'info'] as const;
  const variants = ['solid', 'outline', 'ghost', 'link', 'chip'] as const;
  const sizes = ['sm', 'md', 'lg'] as const;

  it('renderToString of 100 mixed Buttons <= 5 ms', () => {
    const page = h(
      'div',
      null,
      Array.from({ length: 100 }, (_, i) =>
        h(Button, { key: i, tone: tones[i % 6], variant: variants[i % 5], size: sizes[i % 3], iconStart: i % 4 === 0 ? icon('start') : undefined, iconEnd: i % 7 === 0 ? icon('end') : undefined }, `Action ${i}`),
      ),
    );
    const ms = medianMs(() => html(page));
    assertBudget(ms, 5, '100 Buttons median');
  });

  it('a closed MenuButton with 1,000 items renders in <= 2 ms, its markup independent of item count', () => {
    const items = (n: number): MenuItemData[] => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` }));
    const large = h(MenuButton, { id: 'm', items: items(1000) }, 'Actions');
    assert.equal(html(large), html(h(MenuButton, { id: 'm', items: items(1) }, 'Actions')));
    const ms = medianMs(() => html(large));
    assertBudget(ms, 2, 'closed MenuButton, 1,000 items median');
    // The closed render is O(1) in the item count: 10,000 items (10x the budget's size) meet the same
    // budget. An item walk while closed costs ~1 ms per 1,000 items in development React and fails here.
    const huge = h(MenuButton, { id: 'm', items: items(10_000) }, 'Actions');
    const hugeMs = medianMs(() => html(huge));
    assertBudget(hugeMs, 2, 'closed MenuButton, 10,000 items median');
  });
});
