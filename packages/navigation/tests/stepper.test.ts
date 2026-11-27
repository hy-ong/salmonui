import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Step, Stepper, STEPPER_DEFAULT_LOCALE_TEXT, type StepperProps, type StepProps, type StepTriggerProps } from '@salmonui/navigation/stepper';
import { linearAllows, stepStatus } from '../dist/stepper/Stepper.js';

// Stepper server markup and pure rules.
// Interaction and hydration run in tests/browser/stepper.spec.ts;
// axe and ARIA snapshots in stepper-a11y.spec.ts.

const render = (el: ReactElement): string => renderToString(el);
const stepper = (props: Partial<StepperProps> = {}, steps: Partial<StepProps>[] = [{ label: 'Account' }, { label: 'Billing', optional: true }, { label: 'Confirm' }]) =>
  render(h(Stepper, props as StepperProps, ...steps.map((s, i) => h(Step, { key: i, ...s }))));
const lis = (html: string): string[] => html.match(/<li[^>]*>/g) ?? [];
const buttons = (html: string): string[] => html.match(/<button[^>]*>/g) ?? [];
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

describe('Stepper markup', () => {
  it('an <ol> of <li> steps with label, description, icon, optional text and step numbers', () => {
    const html = stepper({}, [{ label: 'Account', description: 'Sign in' }, { label: 'Billing', optional: true, icon: h('svg', { id: 'card' }) }, { label: 'Confirm' }]);
    assert.match(html, /^<ol class="salmon-stepper"/);
    assert.equal(lis(html).length, 3);
    assert.match(html, /<span class="salmon-stepper-label">Account<\/span><span class="salmon-stepper-description">Sign in<\/span>/);
    assert.match(html, /<span class="salmon-stepper-optional">Optional<\/span>/);
    assert.match(html, /<span class="salmon-stepper-indicator" aria-hidden="true"><svg id="card"><\/svg><\/span>/);
    assert.match(html, /<span class="salmon-stepper-indicator" aria-hidden="true">3<\/span>/);
  });

  it('the active step has aria-current="step"; steps are buttons with one tab stop', () => {
    const html = stepper({ defaultValue: 1 });
    assert.deepEqual(lis(html).map((li) => attr(li, 'aria-current')), [null, 'step', null]);
    assert.deepEqual(buttons(html).map((b) => attr(b, 'tabindex')), ['-1', '0', '-1']);
    assert.ok(buttons(html).every((b) => attr(b, 'type') === 'button'));
  });

  it('disabled and invalid steps: aria-disabled, data-invalid and an announced error', () => {
    const html = stepper({}, [{ label: 'A' }, { label: 'B', disabled: true }, { label: 'C', invalid: true }]);
    assert.equal(attr(buttons(html)[1]!, 'aria-disabled'), 'true');
    assert.match(lis(html)[2]!, /data-invalid=""/);
    assert.match(html, /<span class="salmon-stepper-status">Error<\/span>/);
  });

  it('orientation and logical label placement are data hooks with defaults', () => {
    const horizontal = stepper();
    assert.match(horizontal, /data-orientation="horizontal" data-label-placement="bottom"/);
    assert.match(stepper({ orientation: 'vertical' }), /data-orientation="vertical" data-label-placement="end"/);
    for (const p of ['top', 'bottom', 'start', 'end'] as const) assert.match(stepper({ labelPlacement: p }), new RegExp(`data-label-placement="${p}"`));
  });

  it('readOnly renders no buttons', () => {
    const html = stepper({ readOnly: true, value: 1 });
    assert.equal(buttons(html).length, 0);
    assert.match(html, /data-readonly=""/);
    assert.match(lis(html)[1]!, /aria-current="step"/);
    assert.match(html, /<span class="salmon-stepper-step-button">/);
  });

  it('className, style and DOM props reach the <ol> and the <li>', () => {
    const html = stepper({ className: 'mine', style: { gap: 8 }, 'aria-label': 'Checkout' } as Partial<StepperProps>, [{ label: 'A', className: 'step-a', style: { color: 'red' } }]);
    assert.match(html, /^<ol style="gap:8px" aria-label="Checkout" class="salmon-stepper mine"/);
    assert.match(html, /<li style="color:red" class="salmon-stepper-step step-a"/);
  });
});

describe('Stepper value and status', () => {
  it('value / defaultValue select the 0-based active step; controlled wins', () => {
    assert.equal(attr(lis(stepper())[0]!, 'aria-current'), 'step');
    assert.equal(attr(lis(stepper({ defaultValue: 2 }))[2]!, 'aria-current'), 'step');
    assert.equal(attr(lis(stepper({ value: 1, defaultValue: 2 }))[1]!, 'aria-current'), 'step');
  });

  it('status derives from value unless a step sets it; completed steps show a check and are announced', () => {
    assert.deepEqual([0, 1, 2].map((i) => stepStatus(i, 1)), ['completed', 'inProgress', 'notStarted']);
    const html = stepper({ value: 1 }, [{ label: 'A' }, { label: 'B' }, { label: 'C', status: 'completed' }]);
    assert.deepEqual(lis(html).map((li) => attr(li, 'data-status')), ['completed', 'inProgress', 'completed']);
    assert.match(html, /<span class="salmon-stepper-indicator" aria-hidden="true"><svg/);
    assert.equal(html.match(/<span class="salmon-stepper-status">Completed<\/span>/g)?.length, 2);
    const css = readFileSync(new URL('../styles/stepper.css', import.meta.url), 'utf8');
    assert.match(css, /\[data-status='completed'\]:not\(:last-child\)::after/, 'the connector fill is CSS on data-status');
    assert.doesNotMatch(css, /\b(left|right)\s*:/, 'logical properties only');
  });

  it('linear allows earlier steps and the next one only', () => {
    assert.deepEqual([0, 1, 2, 3].map((i) => linearAllows(i, 1)), [true, true, true, false]);
    const html = stepper({ linear: true, value: 0 }, [{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
    assert.deepEqual(buttons(html).map((b) => attr(b, 'aria-disabled')), [null, null, 'true']);
  });
});

describe('Stepper rendering', () => {
  it('renderStep receives the step context and replaces the default content', () => {
    const seen: unknown[] = [];
    const html = render(
      h(
        Stepper,
        {
          value: 1,
          renderStep: (ctx) => {
            seen.push([ctx.index, ctx.status, ctx.active, ctx.label, ctx.optional]);
            return h('b', { className: 'custom' }, `${ctx.index}:${ctx.status}`);
          },
        },
        h(Step, { label: 'A' }),
        h(Step, { label: 'B', optional: true }),
      ),
    );
    assert.deepEqual(seen, [
      [0, 'completed', false, 'A', false],
      [1, 'inProgress', true, 'B', true],
    ]);
    assert.match(html, /<b class="custom">1:inProgress<\/b>/);
    assert.doesNotMatch(html, /salmon-stepper-indicator/);
  });

  it('Step children win over renderStep for that step', () => {
    const html = render(h(Stepper, { renderStep: () => 'R' }, h(Step, { label: 'A' }, h('i', null, 'own')), h(Step, { label: 'B' })));
    assert.match(html, /<i>own<\/i>/);
    assert.match(html, /<button[^>]*>R/);
  });

  it('Step render receives the trigger props (no focus or pointer handlers); spreading them reproduces the default markup', () => {
    const seen: Record<string, unknown>[] = [];
    const spread = (p: StepTriggerProps) => (seen.push({ ...p }), h('button', p));
    assert.equal(stepper({ defaultValue: 1 }, [{ label: 'A', render: spread }, { label: 'B', render: spread, disabled: true }]), stepper({ defaultValue: 1 }, [{ label: 'A' }, { label: 'B', disabled: true }]));
    assert.deepEqual(Object.keys(seen[0]!).sort(), ['aria-disabled', 'children', 'className', 'onClick', 'tabIndex', 'type']);
    assert.equal(seen[1]!['aria-disabled'], true);
    const withTitle = stepper({}, [{ label: 'A', render: (p) => h('button', { ...p, title: 'Hint' }) }]);
    assert.match(withTitle, /<button type="button" class="salmon-stepper-step-button" tabindex="0" title="Hint">/);
    const readOnly = stepper({ readOnly: true }, [{ label: 'A', render: (p) => h('span', p) }]);
    assert.equal(readOnly, stepper({ readOnly: true }, [{ label: 'A' }]));
    // Composition, not a dependency: /stepper neither imports /tooltip nor carries its rules.
    assert.doesNotMatch(readFileSync(new URL('../dist/stepper/Stepper.js', import.meta.url), 'utf8'), /tooltip/);
    assert.doesNotMatch(readFileSync(new URL('../dist/stepper.css', import.meta.url), 'utf8'), /salmon-tooltip/);
  });

  it('localeText overrides the default texts; defaults are exported', () => {
    assert.deepEqual(STEPPER_DEFAULT_LOCALE_TEXT, { optional: 'Optional', invalid: 'Error', completed: 'Completed' });
    const html = stepper({ value: 1, localeText: { optional: 'Facultatif', completed: 'Terminé' } }, [{ label: 'A' }, { label: 'B', optional: true }]);
    assert.match(html, /Facultatif/);
    assert.match(html, /Terminé/);
  });
});
