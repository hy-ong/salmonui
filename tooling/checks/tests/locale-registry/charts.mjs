// Locale families of @salmonui/charts (see ../locale-coverage.test.mjs and
// ./navigation.mjs for the entry format). The chart families take their text
// through `text` (StockChart: `stockText`). Every family but `chart` keeps
// its English text inline, so their keys are listed. Sparkline reads only
// the provider's `locale` (number and date formats); `@salmonui/charts/server`
// reads no provider.
export default {
  chart: { defaults: [{ module: 'packages/charts/dist/chart/model.js', export: 'DEFAULT_TEXT' }] },
  bulletChart: { keys: ['target', 'band', 'legend'] },
  stockChart: { keys: ['seriesType', 'indicators', 'trendlines', 'export', 'toolbar', 'reset', 'customRange', 'period', 'allPeriod', 'events'] },
  rangeSelector: { keys: ['start', 'end', 'band', 'range'] },
  heatMap: { keys: ['heatMap', 'legend', 'column', 'row', 'value', 'noValue'] },
  treeMap: { keys: ['treeMap', 'path', 'all', 'legend'] },
  sankeyChart: { keys: ['sankeyChart', 'legend', 'source', 'target', 'value'] },
  pieChart: { keys: ['pieChart', 'doughnutChart', 'others', 'legend'] },
  funnelChart: { keys: ['funnelChart', 'pyramidChart', 'legend'] },
  gauge: { keys: ['gauge', 'pointer', 'ranges'] },
  geoMap: { keys: ['map', 'movableMarker', 'zoom', 'zoomIn', 'zoomOut', 'resetZoom', 'legend'] },
};
