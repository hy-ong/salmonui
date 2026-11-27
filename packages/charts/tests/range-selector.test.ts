import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { PeriodSelector, periodRange, RangeSelector } from '../dist/range-selector.js';
import { clampRange, keyStep, rangeModel, snapValue } from '../dist/range-selector/model.js';
import { textWidth } from '../dist/viz/index.js';
import { indicatorSeries, StockChart } from '../dist/stock-chart.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);
const daily = Array.from({ length: 366 }, (_, i) => {
  const c = 100 + 10 * Math.sin(i / 9) + i * 0.05;
  return { d: new Date(T0 + i * DAY).toISOString().slice(0, 10), o: c - 1, h: c + 2, l: c - 2, c, v: 1000 + i };
});

describe('RangeSelector', () => {
  it('renders two APG slider thumbs and the band slider with formatted value text', () => {
    const out = renderToString(h(RangeSelector, { data: daily, xField: 'd', yField: 'c', defaultValue: [Date.UTC(2024, 2, 1), Date.UTC(2024, 4, 1)] }));
    assert.equal((out.match(/role="slider"/g) ?? []).length, 3);
    assert.match(out, /aria-label="Start" aria-valuenow="1709251200000" aria-valuetext="Mar 1, 2024"/);
    assert.match(out, /aria-label="End" aria-valuenow="1714521600000" aria-valuetext="May 1, 2024"/);
    assert.match(out, /aria-label="Selected range" aria-valuenow="1709251200000" aria-valuetext="Mar 1, 2024 to May 1, 2024"/);
    // Multi-thumb: the start thumb's maximum is the end value.
    assert.match(out, /aria-valuemin="1704067200000" aria-valuemax="1714521600000" tabindex="0" role="slider" class="salmon-range-selector-thumb" data-thumb="start"/);
  });
  it('controlled value wins over defaultValue and is clamped into the domain', () => {
    const out = renderToString(h(RangeSelector, { data: daily, xField: 'd', yField: 'c', value: [T0 - 10 * DAY, T0 + 5 * DAY] }));
    assert.match(out, /data-thumb="start" aria-label="Start" aria-valuenow="1704067200000"/);
  });
  it('background series types and axis-only selector', () => {
    const m = rangeModel({ series: [{ type: 'line', data: daily, xField: 'd', yField: 'c' }, { type: 'stepLine', data: daily, xField: 'd', yField: 'o' }, { type: 'area', data: daily, xField: 'd', yField: 'h' }] }, 600, 80);
    assert.deepEqual(m.paths.map((p) => p.key), ['l0', 'l1', 'a2', 'l2']);
    const axisOnly = renderToString(h(RangeSelector, { scale: 'linear', min: 0, max: 100 }));
    assert.equal((axisOnly.match(/role="slider"/g) ?? []).length, 3);
    assert.ok(!axisOnly.includes('salmon-range-selector-series"><path'));
  });
  it('linear, time and log scales with min, max, interval and base', () => {
    assert.equal(rangeModel({ data: daily, xField: 'd', yField: 'c' }, 600, 80).kind, 'time');
    const lin = rangeModel({ scale: 'linear', min: 0, max: 50, interval: 10 }, 600, 80);
    assert.deepEqual(lin.ticks.map((t) => t.value), [0, 10, 20, 30, 40, 50]);
    const log = rangeModel({ scale: 'log', min: 1, max: 1000, base: 10 }, 600, 80);
    assert.deepEqual(log.ticks.map((t) => t.value), [1, 10, 100, 1000]);
    const monthly = rangeModel({ data: daily, xField: 'd', yField: 'c', interval: { unit: 'month', step: 2 } }, 600, 80);
    assert.equal(new Date(monthly.ticks[1]?.value ?? 0).toISOString().slice(0, 10), '2024-03-01');
    // End labels on the track ends keep inside the drawing: the track narrows instead.
    const ends = rangeModel({ scale: 'linear', min: 1000, max: 10000000, interval: 4999500 }, 600, 80);
    const first = ends.ticks[0]!;
    const last = ends.ticks[ends.ticks.length - 1]!;
    assert.ok(first.pos - textWidth(first.text) / 2 >= 0);
    assert.ok(last.pos + textWidth(last.text) / 2 <= 600);
  });
  it('label format, label position, overlap and grouped second-row labels', () => {
    const m = rangeModel({ data: daily, xField: 'd', yField: 'c', format: 'MMM', groupLabels: { unit: 'year' } }, 600, 80);
    assert.equal(m.ticks[0]?.text, 'Jan');
    assert.equal(m.groups[0]?.text, '2024');
    const f = rangeModel({ scale: 'linear', min: 0, max: 10, formatLabel: (v: number) => `#${v}` }, 600, 80);
    assert.equal(f.ticks[0]?.text, '#0');
    const dense = rangeModel({ scale: 'linear', min: 0, max: 1000, interval: 10, labelOverlap: 'hide' }, 300, 80);
    assert.ok(dense.ticks.some((t) => t.hidden));
    const inside = renderToString(h(RangeSelector, { scale: 'linear', min: 0, max: 10, labelPosition: 'inside' }));
    assert.match(inside, /text-anchor="start">0</);
  });
  it('snapping to data points and to whole intervals', () => {
    const m = rangeModel({ data: daily, xField: 'd', yField: 'c' }, 600, 80);
    assert.equal(snapValue(m, T0 + 1.4 * DAY, true, 'start'), T0 + DAY);
    const monthly = rangeModel({ data: daily, xField: 'd', yField: 'c', interval: { unit: 'month', step: 1 } }, 600, 80);
    assert.equal(snapValue(monthly, Date.UTC(2024, 1, 10), 'interval', 'start'), Date.UTC(2024, 1, 1));
    assert.equal(snapValue(monthly, Date.UTC(2024, 1, 10), 'interval', 'end'), Date.UTC(2024, 2, 1));
    const lin = rangeModel({ scale: 'linear', min: 0, max: 100, interval: 10 }, 600, 80);
    assert.equal(snapValue(lin, 33, 'interval', 'start'), 30);
    assert.equal(snapValue(lin, 33, 'interval', 'end'), 40);
    assert.equal(snapValue(lin, 33, false, 'end'), 33);
  });
  it('tooltip always shows the thumb values', () => {
    const out = renderToString(h(RangeSelector, { scale: 'linear', min: 0, max: 10, defaultValue: [2, 8], tooltip: 'always' }));
    assert.match(out, /class="salmon-viz-tooltip salmon-range-selector-tooltip">2</);
    assert.ok(!renderToString(h(RangeSelector, { scale: 'linear', min: 0, max: 10, tooltip: true })).includes('salmon-range-selector-tooltip'));
  });
  it('periods render a period selector; PeriodSelector alone is an APG radio group', () => {
    const periods = [
      { id: '1m', unit: 'month' as const, count: 1, label: '1M' },
      { id: 'all', unit: 'all' as const, label: 'All' },
    ];
    const out = renderToString(h(RangeSelector, { data: daily, xField: 'd', yField: 'c', periods }));
    assert.match(out, /role="radiogroup"/);
    assert.match(out, /role="radio" aria-checked="true" data-pressed="" data-value="all"/);
    const alone = renderToString(h(PeriodSelector, { periods, defaultValue: '1m' }));
    assert.match(alone, /role="radiogroup" aria-orientation="horizontal" aria-label="Period"/);
    assert.match(alone, /role="radio" aria-checked="true" data-pressed="" data-value="1m"/);
  });
  it('periodRange computes count units, YTD and All in the time zone', () => {
    const end = Date.UTC(2024, 11, 31);
    assert.deepEqual(periodRange({ id: '3m', unit: 'month', count: 3, label: '' }, end, T0), [Date.UTC(2024, 8, 30), end]);
    assert.deepEqual(periodRange({ id: 'ytd', unit: 'ytd', label: '' }, end, 0), [T0, end]);
    assert.deepEqual(periodRange({ id: 'all', unit: 'all', label: '' }, end, T0), [T0, end]);
    assert.deepEqual(periodRange({ id: '5y', unit: 'year', count: 5, label: '' }, end, T0), [T0, end]);
    assert.equal(periodRange({ id: 'ytd', unit: 'ytd', label: '' }, end, 0, 'America/New_York')[0], Date.UTC(2024, 0, 1, 5));
  });
  it('keyboard steps: interval, 1 % and 10 % of the span; ranges are clamped and ordered', () => {
    const m = rangeModel({ scale: 'linear', min: 0, max: 200 }, 600, 80);
    assert.equal(keyStep(m, false), 2);
    assert.equal(keyStep(m, true), 20);
    assert.equal(keyStep(rangeModel({ scale: 'linear', min: 0, max: 200, interval: 25 }, 600, 80), false), 25);
    assert.deepEqual(clampRange(m, [250, -5]), [0, 200]);
  });
  it('grid lines and ticks can be turned off colors come from the primary seed', () => {
    const on = renderToString(h(RangeSelector, { scale: 'linear', min: 0, max: 10 }));
    assert.match(on, /class="salmon-viz-grid"/);
    assert.match(on, /class="salmon-viz-tick"/);
    const off = renderToString(h(RangeSelector, { scale: 'linear', min: 0, max: 10, gridLines: false, ticks: false }));
    assert.ok(!off.includes('salmon-viz-grid') && !off.includes('salmon-viz-tick'));
    assert.match(on, /class="salmon-range-selector-band"/);
  });
  it('form integration: name renders the start and end hidden inputs', () => {
    const out = renderToString(h(RangeSelector, { scale: 'linear', min: 0, max: 10, defaultValue: [2, 8], name: 'price' }));
    assert.match(out, /<input type="hidden" name="price" value="2"\/><input type="hidden" name="price" value="8"\/>/);
    const t = renderToString(h(RangeSelector, { data: daily, xField: 'd', yField: 'c', name: 'when', defaultValue: [T0, T0 + DAY] }));
    assert.match(t, /name="when" value="2024-01-01T00:00:00.000Z"/);
  });
});

describe('StockChart', () => {
  const base = { data: daily, xField: 'd', openField: 'o', highField: 'h', lowField: 'l', closeField: 'c' };
  it('composes the chart, the navigator, the period selector and the toolbar', () => {
    const out = renderToString(h(StockChart, { ...base, title: 'ACME' }));
    assert.match(out, /class="salmon-stock-chart"/);
    assert.match(out, /aria-label="Stock chart tools" role="toolbar"[^>]*class="salmon-toolbar salmon-stock-chart-toolbar"/);
    assert.match(out, /data-type="candle"/);
    assert.match(out, /salmon-range-selector/);
    assert.match(out, /role="radiogroup"/);
    assert.match(out, /aria-haspopup="menu"/);
  });
  it('periods and position navigator off range triad drives the chart zoom', () => {
    const out = renderToString(h(StockChart, { ...base, navigator: false, periodSelector: { position: 'bottom' }, defaultRange: [Date.UTC(2024, 5, 1), Date.UTC(2024, 11, 31)] }));
    assert.ok(!out.includes('salmon-range-selector-thumb'));
    assert.ok(out.indexOf('role="radiogroup"') > out.indexOf('salmon-chart-svg'));
    // Only June onwards is visible on the x axis.
    assert.ok(!/>Jan</.test(out.slice(out.indexOf('data-axis="x"'), out.indexOf('data-axis="y"'))));
  });
  it('defaultPeriod and period select a radio and drive the chart range on the server', () => {
    const checked = (out: string) => {
      const tag = /<[^>]*role="radio"[^>]*aria-checked="true"[^>]*>|<[^>]*aria-checked="true"[^>]*role="radio"[^>]*>/.exec(out);
      return tag ? /^(?:<[^>]+>)*([^<]+)/.exec(out.slice((tag.index ?? 0) + tag[0].length))?.[1] : undefined;
    };
    const xText = (out: string) => out.slice(out.indexOf('data-axis="x"'), out.indexOf('data-axis="y"'));
    const def = renderToString(h(StockChart, { ...base, navigator: false, defaultPeriod: '3m' }));
    assert.equal(checked(def), '3M');
    assert.ok(!/>Jan</.test(xText(def)));
    const ctl = renderToString(h(StockChart, { ...base, navigator: false, period: '1m' }));
    assert.equal(checked(ctl), '1M');
    assert.equal(checked(renderToString(h(StockChart, { ...base, navigator: false, period: null }))), undefined);
    // A controlled range wins over the period for the view.
    const both = renderToString(h(StockChart, { ...base, navigator: false, defaultPeriod: '1m', range: [Date.UTC(2024, 0, 1), Date.UTC(2024, 1, 1)] }));
    assert.match(xText(both), /Jan/);
  });
  it('forwards aria naming, legend, annotations, panes, axes and orientation to Chart', () => {
    const named = renderToString(h(StockChart, { ...base, 'aria-labelledby': 'stock-heading' }));
    assert.match(/<figure[^>]*>/.exec(named)![0], /aria-labelledby="stock-heading"/);
    assert.match(renderToString(h(StockChart, { ...base, legend: true, toolbar: false })), /aria-label="Legend"/);
    assert.match(renderToString(h(StockChart, { ...base, annotations: [{ x: '2024-03-01', y: 100, content: h('b', null, 'Earnings') }] })), /<b>Earnings<\/b>/);
    const pane = renderToString(h(StockChart, { ...base, height: 400, width: 600, indicators: ['rsi'], panes: { rows: ['50%', '50%'] }, axes: [{ id: 'indicator', direction: 'y', title: 'RSI axis', pane: { row: 1 } }] }));
    assert.match(pane, /RSI axis/);
    assert.match(pane, /data-series="indicator-rsi"/);
    assert.match(renderToString(h(StockChart, { ...base, orientation: 'horizontal', toolbar: false })), /data-type="candle"/);
  });
  it('series type triad indicators trendlines', () => {
    assert.match(renderToString(h(StockChart, { ...base, seriesType: 'line' })), /data-type="line"/);
    const ind = renderToString(h(StockChart, { ...base, indicators: ['rsi', 'sma'] }));
    assert.match(ind, /data-series="indicator-rsi"/);
    assert.match(ind, /data-series="indicator-sma"/);
    const tr = renderToString(h(StockChart, { ...base, trendlines: ['linear'] }));
    assert.match(tr, /data-series="price-trend-0"/);
    for (const kind of ['sma', 'ema', 'tma', 'momentum', 'rsi', 'atr', 'accumulationDistribution', 'bollinger', 'macd', 'stochastic'] as const) {
      assert.ok(indicatorSeries(kind, daily, { x: 'd', open: 'o', high: 'h', low: 'l', close: 'c', volume: 'v' }).length >= 1, kind);
    }
  });
  it('stock events are drawn and listed for assistive technology; volume renders on its own axis', () => {
    const out = renderToString(h(StockChart, { ...base, volumeField: 'v', events: [{ date: '2024-03-01', label: 'Split', description: '2:1' }] }));
    assert.match(out, /class="salmon-stock-chart-event"[^>]*>Split</);
    assert.match(out, /<li>2024-03-01: Split. 2:1<\/li>/);
    assert.match(out, /data-series="volume"/);
  });
  it('event shapes are drawn per shape and placed on every series in seriesIds', () => {
    const shapes = ['circle', 'square', 'flag', 'pin', 'triangle', 'invertedTriangle', 'triangleRight', 'triangleLeft', 'arrowUp', 'arrowDown', 'arrowLeft', 'arrowRight', 'text'] as const;
    const out = renderToString(h(StockChart, { ...base, volumeField: 'v', events: shapes.map((shape) => ({ date: '2024-03-01', label: shape, shape })) }));
    for (const shape of shapes) assert.match(out, new RegExp(`data-shape="${shape}"[^>]*>${shape}<`));
    const both = renderToString(h(StockChart, { ...base, volumeField: 'v', events: [{ date: '2024-03-01', label: 'Split', seriesIds: ['price', 'volume'] }] }));
    const tops = [...both.matchAll(/class="salmon-chart-annotation" style="left:([\d.]+)%;top:([\d.]+)%"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.equal(tops.length, 2);
    assert.equal(tops[0]?.[0], tops[1]?.[0]);
    assert.ok((tops[1]?.[1] as number) > (tops[0]?.[1] as number), 'the volume marker sits lower than the price marker');
  });
  it('large OHLC data is bucketed per pixel', () => {
    const big = Array.from({ length: 20_000 }, (_, i) => ({ d: T0 + i * 60_000, o: 1, h: 2, l: 0, c: 1.5 }));
    const out = renderToString(h(StockChart, { data: big, xField: 'd', openField: 'o', highField: 'h', lowField: 'l', closeField: 'c', navigator: false, toolbar: false }));
    assert.ok(out.length < 3_000_000);
  });
});
