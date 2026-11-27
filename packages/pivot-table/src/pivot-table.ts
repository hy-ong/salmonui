'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/pivot-table`: PivotTable, PivotFieldList, PivotAxisBar, PivotToolbar, the
// `usePivot()` store and the Pivot Chart adapters. The engine and its types
// are `@salmonui/pivot-table/engine`; the common ones are re-exported here.
// CSS: `@salmonui/pivot-table/styles.css`.

export { PivotTable } from './pivot-table/PivotTable.js';
export type { PivotTableApi, PivotTableProps } from './pivot-table/PivotTable.js';
export { PivotFieldList } from './pivot-table/PivotFieldList.js';
export type { PivotFieldListProps } from './pivot-table/PivotFieldList.js';
export { PivotAxisBar } from './pivot-table/PivotAxisBar.js';
export type { PivotAxisBarProps } from './pivot-table/PivotAxisBar.js';
export { PivotToolbar } from './pivot-table/PivotToolbar.js';
export type { PivotToolbarProps } from './pivot-table/PivotToolbar.js';
export { usePivot, usePivotState } from './pivot-table/usePivot.js';
export { PivotController } from './pivot-table/controller.js';
export { drillChartPoint, pivotChartImage, pivotChartProps, pivotChartPropsOf, pivotChartSeriesOptions, pivotToSeries, usePivotChartData, usePivotChartProps } from './pivot-table/chart.js';
export type {
  PivotChartData,
  PivotChartDrillMode,
  PivotChartPoint,
  PivotChartProps,
  PivotChartPropsOptions,
  PivotChartSeries,
  PivotChartSeriesShape,
  PivotChartSeriesType,
  PivotToSeriesOptions,
} from './pivot-table/chart.js';
export { PIVOT_DEFAULT_LOCALE_TEXT } from './pivot-table/locale.js';
export type { PivotLocaleText, PivotLocaleTextKey } from './pivot-table/locale.js';
export type { PivotExportFile, PivotExportOptions, PivotExportWriters, PivotWriterModule } from './pivot-table/export.js';
export type {
  PivotAction,
  PivotAggregateMenuOpenEvent,
  PivotAxis,
  PivotAxisBarOptions,
  PivotCalculatedFieldChangeEvent,
  PivotCellClickEvent,
  PivotCellContext,
  PivotCellKey,
  PivotCommandOptions,
  PivotComputeEvent,
  PivotDataChangeEvent,
  PivotDialogState,
  PivotDisplayProps,
  PivotDrillThroughEvent,
  PivotErrorEvent,
  PivotEvent,
  PivotEventHandlers,
  PivotEventSource,
  PivotExpandedChangeEvent,
  PivotExportEvent,
  PivotFieldMoveEvent,
  PivotFilterChangeEvent,
  PivotHeaderContext,
  PivotLoadingContext,
  PivotMemberEditorOpenEvent,
  PivotModelChangeEvent,
  PivotPersistState,
  PivotSelectionChangeEvent,
  PivotSortChangeEvent,
  PivotState,
  PivotTableLayout,
  PivotTableState,
  PivotToolbarItem,
  PivotToolbarItemId,
  PivotTooltipContext,
  PivotWorkerLike,
  UsePivotOptions,
} from './pivot-table/types.js';
export { normalizePivotModel, parseCsv } from '@salmonui/pivot-table/engine';
export type {
  PivotAggregate,
  PivotAxisField,
  PivotCalculatedField,
  PivotCell,
  PivotConditionalFormat,
  PivotFieldDefinition,
  PivotFieldInfo,
  PivotFilter,
  PivotFormat,
  PivotGrouping,
  PivotHeaderNode,
  PivotMember,
  PivotMemberPath,
  PivotMemberSort,
  PivotModel,
  PivotModelInput,
  PivotResult,
  PivotValueField,
  PivotValueSort,
} from '@salmonui/pivot-table/engine';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/pivot-table', 'salmon-pivot-table');
