// @salmonui/charts export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/charts', {
  './chart': ['Chart', 'ChartSeries', 'ChartAxis', 'ChartSyncGroup'],
  './chart/features': ['interactions', 'polar'],
  './chart/export': ['exportVisualizations'],
  './chart/indicators': ['indicatorSeries', 'technicalIndicators'],
  './chart/bullet': ['BulletChart'],
  './range-selector': ['RangeSelector', 'PeriodSelector'],
  './stock-chart': ['StockChart'],
  './sparkline': ['Sparkline'],
  './sparkline/canvas': ['sparklineCanvas'],
  './pie-chart': ['PieChart', 'FunnelChart'],
  './heat-map': ['HeatMap'],
  './tree-map': ['TreeMap'],
  './sankey-chart': ['SankeyChart'],
  './gauge': ['Gauge', 'GaugeAxis', 'GaugePointer'],
  './geo-map': ['GeoMap', 'GeoMapLayer'],
  './barcode': ['Barcode', 'QRCode'],
  './barcode/pdf417': ['Pdf417'],
  './barcode/gs1-databar': ['Gs1DataBar'],
  './barcode/dotcode': ['DotCode'],
  './server': ['visualizationSvg'],
});
