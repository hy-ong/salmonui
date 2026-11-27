// Rating server markup: behaviors that unit or SSR tests can check are asserted on
// renderToString output; interaction tests live in tests/browser/inputs-rating.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Rating } from '@salmonui/inputs/rating';

const html = (element: ReactElement) => renderToString(element);
const attr = (markup: string, tag: string, name: string): string | null => new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
const inputs = (markup: string): string[] => markup.match(/<input[^>]*>/g) ?? [];
const count = (markup: string, re: RegExp): number => (markup.match(re) ?? []).length;

describe('Rating markup', () => {
  it('one native radio per item named "n of 5 stars" in a radiogroup named by label', () => {
    const out = html(h(Rating, { label: 'Service', name: 'stars', defaultValue: 3 }));
    assert.equal(attr(out, 'fieldset', 'role'), 'radiogroup');
    const radios = inputs(out);
    assert.equal(radios.length, 5);
    assert.deepEqual(
      radios.map((r) => /aria-label="([^"]+)"/.exec(r)?.[1]),
      ['1 of 5 stars', '2 of 5 stars', '3 of 5 stars', '4 of 5 stars', '5 of 5 stars'],
    );
    assert.match(radios[2]!, /checked=""/);
    assert.ok(radios.every((r) => r.includes('name="stars"')));
    assert.equal(count(out, /data-fill="full"/g), 3);
    assert.equal(count(out, /data-fill="empty"/g), 2);  });

  it('count and localeText.item name the radios', () => {
    const radios = inputs(html(h(Rating, { label: 'R', count: 3, localeText: { item: '{0} sur {1}' } })));
    assert.equal(radios.length, 3);
    assert.match(radios[0]!, /aria-label="1 sur 3"/);
  });

  it('min sets the default value and the cleared value', () => {
    const out = html(h(Rating, { label: 'R', min: 2 }));
    assert.match(inputs(out)[1]!, /checked=""/);
  });

  it('half precision renders two radios per item over half-width hit areas', () => {
    const out = html(h(Rating, { label: 'R', precision: 'half', defaultValue: 2.5, count: 3 }));
    const radios = inputs(out);
    assert.equal(radios.length, 6);
    assert.deepEqual(
      radios.map((r) => /value="([^"]+)"/.exec(r)?.[1]),
      ['0.5', '1', '1.5', '2', '2.5', '3'],
    );
    assert.equal(radios.filter((r) => r.includes('data-half')).length, 3);
    assert.match(radios[4]!, /checked=""/);
    assert.deepEqual(
      [...out.matchAll(/data-fill="(\w+)"/g)].map((m) => m[1]),
      ['full', 'full', 'half'],
    );
  });

  it('read-only quarter and exact precision render one role="img" with a clipped fill', () => {
    const exact = html(h(Rating, { label: 'Avg', readOnly: true, precision: 'exact', defaultValue: 3.7 }));
    assert.equal(inputs(exact).length, 0);
    assert.match(exact, /role="img" aria-label="3.7 of 5 stars"/);
    assert.match(exact, /--salmon-rating-fill:70%/);
    const quarter = html(h(Rating, { label: 'Q', readOnly: true, precision: 'quarter', defaultValue: 2.4 }));
    assert.match(quarter, /aria-label="2.5 of 5 stars"/);
    assert.match(quarter, /--salmon-rating-fill:50%/);
  });

  it('clearable shows a named clear button only while the value is above min', () => {
    assert.match(html(h(Rating, { label: 'R', clearable: true, defaultValue: 2 })), /<button type="button" class="salmon-rating-clear">.*<span class="salmon-visually-hidden">Clear rating<\/span><\/button>/);
    assert.doesNotMatch(html(h(Rating, { label: 'R', clearable: true })), /<button/);
    assert.doesNotMatch(html(h(Rating, { label: 'R', clearable: true, defaultValue: 2, readOnly: true })), /<button/);
    assert.match(html(h(Rating, { label: 'R', clearable: true, defaultValue: 2, localeText: { clear: 'Effacer' } })), />Effacer</);
  });

  it('highlightSelectedOnly fills only the selected item', () => {
    const out = html(h(Rating, { label: 'R', highlightSelectedOnly: true, defaultValue: 3 }));
    assert.deepEqual(
      [...out.matchAll(/data-fill="(\w+)"/g)].map((m) => m[1]),
      ['empty', 'empty', 'full', 'empty', 'empty'],
    );
  });

  it('showLabel, labelPlacement and renderLabel', () => {
    const end = html(h(Rating, { label: 'R', showLabel: true, defaultValue: 4 }));
    assert.match(end, /<span class="salmon-rating-value">4<\/span>/);
    assert.ok(end.indexOf('salmon-rating-items') < end.indexOf('salmon-rating-value'));
    const top = html(h(Rating, { label: 'R', showLabel: true, labelPlacement: 'top', defaultValue: 4, renderLabel: ({ value, count: n }: { value: number; count: number }) => `${value}/${n}` }));
    assert.ok(top.indexOf('salmon-rating-value') < top.indexOf('salmon-rating-items'));
    assert.match(top, /data-label-placement="top"/);
    assert.match(top, />4\/5</);
  });

  it('icon, emptyIcon and renderItem', () => {
    const icons = html(h(Rating, { label: 'R', icon: '♥', emptyIcon: '♡', count: 1 }));
    assert.match(icons, /salmon-rating-empty[^>]*><span class="salmon-rating-glyph">♡</);
    assert.match(icons, /salmon-rating-full[^>]*><span class="salmon-rating-glyph">♥</);
    const items = html(h(Rating, { label: 'R', count: 2, defaultValue: 1, renderItem: ({ index, state }: { index: number; state: string }) => `${index}:${state}` }));
    assert.match(items, />1:full</);
    assert.match(items, />2:empty</);
  });

  it('showTooltip renders a decorative value bubble per step; renderTooltip customizes it', () => {
    const out = html(h(Rating, { label: 'R', count: 2, showTooltip: true, renderTooltip: ({ value }: { value: number }) => `${value} pts` }));
    assert.equal(count(out, /<span class="salmon-rating-tooltip" aria-hidden="true">/g), 2);
    assert.match(out, />2 pts</);
  });

  it('the radios carry name, form and required', () => {
    const radios = inputs(html(h(Rating, { label: 'R', name: 'stars', form: 'f', required: true })));
    assert.ok(radios.every((r) => r.includes('name="stars"') && r.includes('form="f"') && r.includes('required=""')));
  });

  it('disabled disables every radio; readOnly keeps them enabled with aria-readonly', () => {
    assert.ok(inputs(html(h(Rating, { label: 'R', disabled: true }))).every((r) => r.includes('disabled=""')));
    const ro = html(h(Rating, { label: 'R', readOnly: true, defaultValue: 2 }));
    assert.ok(inputs(ro).every((r) => !r.includes('disabled')));
    assert.equal(attr(ro, 'fieldset', 'aria-readonly'), 'true');
    assert.doesNotMatch(ro, /salmon-rating-interactive/);
  });
});
