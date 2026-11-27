// zh-TW text of the @salmonui/charts families (see ../zh-TW.ts). The chart
// families take their text through `text` (`stockText` for StockChart); the
// provider's `locale` also reaches every chart's number and date formats.

export const chart = /* @__PURE__ */ Object.freeze({
  chart: '圖表',
  noData: '沒有資料',
  legend: '圖例',
  table: '圖表資料',
  moreRows: (count: number): string => `還有 ${count} 列未顯示`,
  zoomToolbar: '縮放',
  zoomTool: '選取範圍以縮放',
  zoomIn: '放大',
  zoomOut: '縮小',
  pan: '平移',
  resetZoom: '重設縮放',
  previousLegendPage: '上一頁圖例',
  nextLegendPage: '下一頁圖例',
});

export const heatMap = /* @__PURE__ */ Object.freeze({
  heatMap: '熱度圖',
  legend: '圖例',
  column: '欄',
  row: '列',
  value: '值',
  noValue: '無值',
});

export const treeMap = /* @__PURE__ */ Object.freeze({
  treeMap: '矩形樹狀圖',
  path: '矩形樹狀圖路徑',
  all: '全部',
  legend: '圖例',
});

export const sankeyChart = /* @__PURE__ */ Object.freeze({
  sankeyChart: '桑基圖',
  legend: '圖例',
  source: '來源',
  target: '目標',
  value: '值',
});

export const pieChart = /* @__PURE__ */ Object.freeze({
  pieChart: '圓餅圖',
  doughnutChart: '環圈圖',
  others: '其他',
  legend: '圖例',
});

export const funnelChart = /* @__PURE__ */ Object.freeze({
  funnelChart: '漏斗圖',
  pyramidChart: '金字塔圖',
  legend: '圖例',
});

export const gauge = /* @__PURE__ */ Object.freeze({
  gauge: '儀表',
  pointer: (gauge: string, n: number): string => `${gauge}指針 ${n}`,
  ranges: '區間',
});

export const geoMap = /* @__PURE__ */ Object.freeze({
  map: '地圖',
  movableMarker: '可移動的標記',
  zoom: '縮放',
  zoomIn: '放大',
  zoomOut: '縮小',
  resetZoom: '重設縮放',
  legend: '圖例',
});

export const bulletChart = /* @__PURE__ */ Object.freeze({
  target: '目標',
  band: '區間',
  legend: '圖例',
});

export const stockChart = /* @__PURE__ */ Object.freeze({
  seriesType: '數列類型',
  indicators: '技術指標',
  trendlines: '趨勢線',
  export: '匯出',
  toolbar: '股票圖表工具',
  reset: '重設',
  customRange: '日期範圍',
  period: '期間',
  allPeriod: '全部',
  events: '事件',
});

export const rangeSelector = /* @__PURE__ */ Object.freeze({
  start: '開始',
  end: '結束',
  band: '已選取範圍',
  range: (from: string, to: string): string => `${from} 至 ${to}`,
});
