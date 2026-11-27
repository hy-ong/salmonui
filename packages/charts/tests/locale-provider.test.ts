import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { Chart } from '@salmonui/charts/chart';
import { BulletChart } from '@salmonui/charts/chart/bullet';
import { RangeSelector } from '@salmonui/charts/range-selector';
import { Sparkline } from '@salmonui/charts/sparkline';
import { HeatMap } from '@salmonui/charts/heat-map';
import { TreeMap } from '@salmonui/charts/tree-map';
import { SankeyChart } from '@salmonui/charts/sankey-chart';
import { FunnelChart, PieChart } from '@salmonui/charts/pie-chart';
import { Gauge } from '@salmonui/charts/gauge';
import { GeoMap } from '@salmonui/charts/geo-map';

// The chart families read the nearest LocaleProvider: its text through `text`, its locale for number and date
// formats; a chart's own `text` and `locale` still win.

const zh = (el: ReactElement, locale = 'zh-TW'): string => renderToString(h(LocaleProvider, { locale, localeText: zhTW }, el));
const empty = { data: [], series: [{ xField: 'x', yField: 'y' }] };

describe('chart families under LocaleProvider', () => {
  it('chart: provider text, own text wins', () => {
    assert.match(zh(h(Chart, empty)), /class="salmon-viz-empty"[^>]*>沒有資料</);
    assert.match(zh(h(Chart, { ...empty, text: { noData: 'Nothing' } })), />Nothing</);
  });

  it('bulletChart: provider text for its own words', () => {
    const html = zh(h(BulletChart, { data: [{ k: 'A', v: 5, t: 7 }], categoryField: 'k', valueField: 'v', targetField: 't', legend: true }));
    assert.match(html, /aria-label="圖例"/);
    assert.match(html, /目標/);
  });

  it('rangeSelector: provider text, own text wins', () => {
    assert.match(zh(h(RangeSelector, { scale: 'linear', min: 0, max: 10 })), /aria-label="已選取範圍"/);
    assert.match(zh(h(RangeSelector, { scale: 'linear', min: 0, max: 10, text: { band: 'Window' } })), /aria-label="Window"/);
  });

  it('heatMap, treeMap, sankeyChart, pieChart, funnelChart, gauge, geoMap: names from the provider, own text wins', () => {
    const heat = zh(h(HeatMap, { data: [[1, 2], [3, 4]], legend: true }));
    assert.match(heat, /aria-roledescription="熱度圖" aria-label="熱度圖"/);
    assert.match(heat, /<caption>熱度圖<\/caption><thead><tr><th scope="col">列<\/th><th scope="col">欄<\/th><th scope="col">值<\/th>/);
    assert.match(zh(h(HeatMap, { data: [[1]], text: { heatMap: 'Matrix' } })), /aria-label="Matrix"/);
    const tree = zh(h(TreeMap, { data: [{ g: 'A', v: 2 }, { g: 'B', v: 3 }], weightField: 'v', levels: [{ groupBy: 'g' }], breadcrumbs: true }));
    assert.match(tree, /aria-roledescription="矩形樹狀圖"/);
    assert.match(tree, /<nav[^>]*aria-label="矩形樹狀圖路徑"/);
    assert.match(tree, /aria-current="location">全部</);
    assert.match(zh(h(SankeyChart, { nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] })), /aria-roledescription="桑基圖"/);
    assert.match(zh(h(PieChart, { data: [1, 2] })), /aria-roledescription="圓餅圖"/);
    assert.match(zh(h(PieChart, { data: [1, 2], innerRadius: '50%' })), /aria-roledescription="環圈圖"/);
    assert.match(zh(h(FunnelChart, { data: [3, 2] })), /aria-roledescription="漏斗圖"/);
    assert.match(zh(h(FunnelChart, { data: [3, 2], text: { funnelChart: 'Pipeline' } })), /aria-roledescription="pipeline"/);
    assert.match(zh(h(Gauge, { axes: [{ min: 0, max: 10 }], pointers: [{ value: 3 }, { value: 5 }] })), /aria-label="儀表指針 2"/);
    const geo = zh(h(GeoMap, { layers: [{ shapes: { type: 'FeatureCollection', features: [] } }], zoom: true }));
    assert.match(geo, /aria-roledescription="地圖" aria-label="地圖"/);
    assert.match(geo, /role="toolbar" aria-label="縮放"/);
    assert.match(geo, /aria-label="放大"/);
  });

  it('sparkline: provider locale formats the summary, own locale wins', () => {
    const data = [1234.5, 2000, 1500];
    assert.match(zh(h(Sparkline, { data }), 'de-DE'), /minimum 1\.234,5/);
    assert.match(zh(h(Sparkline, { data, locale: 'en-US' }), 'de-DE'), /minimum 1,234\.5/);
  });
});
