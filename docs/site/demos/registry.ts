// Demo id -> component. Every folder under demos/ with a demo.md must be
// registered here; `npm run docs:coverage` fails on a missing entry.
import GaugeBasic from './gauge-basic/Demo';
import GaugeLinear from './gauge-linear/Demo';
import BarcodeTypes from './barcode-types/Demo';
import QRCodeBasic from './qr-code-basic/Demo';
import Pdf417Basic from './pdf417-basic/Demo';
import Gs1DataBarVariants from './gs1-databar-variants/Demo';
import DotCodeBasic from './dotcode-basic/Demo';
import GeoMapChoropleth from './geo-map-choropleth/Demo';
import GeoMapMarkers from './geo-map-markers/Demo';
import type { ComponentType } from 'react';
import SparklineBasicDemo from './sparkline-basic/Demo';
import SparklineGridDemo from './sparkline-grid/Demo';
import PieChartBasicDemo from './pie-chart-basic/Demo';
import PieChartVariantsDemo from './pie-chart-variants/Demo';
import FunnelChartDemo from './funnel-chart/Demo';
import HeatMapBasicDemo from './heat-map-basic/Demo';
import HeatMapLargeDemo from './heat-map-large/Demo';
import TreeMapDrillDemo from './tree-map-drill/Demo';
import SankeyChartBasicDemo from './sankey-chart-basic/Demo';
import BarcodeEncoderDemo from './barcode-encoder/Demo';
import BulletChartKpisDemo from './bullet-chart-kpis/Demo';
import GaugeThermostatDemo from './gauge-thermostat/Demo';
import GeoMapTilesDragDemo from './geo-map-tiles-drag/Demo';
import HeatMapBubblesDemo from './heat-map-bubbles/Demo';
import SankeyChartBudgetDemo from './sankey-chart-budget/Demo';
import SparklineAxisEventsDemo from './sparkline-axis-events/Demo';
import TreeMapPortfolioDemo from './tree-map-portfolio/Demo';
// Chart, StockChart and RangeSelector (category: data-visualization).
import ChartLineAreaDemo from './chart-line-area/Demo';
import ChartColumnsStacksDemo from './chart-columns-stacks/Demo';
import ChartScatterBubbleDemo from './chart-scatter-bubble/Demo';
import ChartFinancialDemo from './chart-financial/Demo';
import ChartStatisticalDemo from './chart-statistical/Demo';
import ChartPolarDemo from './chart-polar/Demo';
import ChartLiveDemo from './chart-live/Demo';
import ChartAxisScalesDemo from './chart-axis-scales/Demo';
import ChartAxisLayoutDemo from './chart-axis-layout/Demo';
import ChartAxisLabelsDemo from './chart-axis-labels/Demo';
import ChartTooltipCrosshairDemo from './chart-tooltip-crosshair/Demo';
import ChartZoomDemo from './chart-zoom/Demo';
import ChartSelectionDemo from './chart-selection/Demo';
import ChartSyncDemo from './chart-sync/Demo';
import ChartLegendDemo from './chart-legend/Demo';
import ChartLabelsMarkersDemo from './chart-labels-markers/Demo';
import ChartTrendlinesDemo from './chart-trendlines/Demo';
import ChartIndicatorsDemo from './chart-indicators/Demo';
import ChartRenderingDemo from './chart-rendering/Demo';
import ChartExportDemo from './chart-export/Demo';
import ChartSizeRtlDemo from './chart-size-rtl/Demo';
import StockChartBasicDemo from './stock-chart-basic/Demo';
import StockChartEventsDemo from './stock-chart-events/Demo';
import RangeSelectorNavigatorDemo from './range-selector-navigator/Demo';
import RangeSelectorOptionsDemo from './range-selector-options/Demo';
import ButtonBasics from './button-basics/Demo';
import ButtonRepeat from './button-repeat/Demo';
import ToggleButton from './toggle-button/Demo';
import ButtonGroup from './button-group/Demo';
import ToggleButtonGroup from './toggle-button-group/Demo';
import ProgressButton from './progress-button/Demo';
import FloatingActionButton from './floating-action-button/Demo';
import Mention from './mention/Demo';
import RichTextEditorDemo from './rich-text-editor/Demo';
import MentionRemote from './mention-remote/Demo';
import DdListboxOptions from './listbox-options/Demo';
import DdListboxRemote from './listbox-remote/Demo';
import DdSelectEvents from './select-events/Demo';
import DdDropdownPopup from './dropdown-popup/Demo';
import DdDropdownTemplates from './dropdown-templates/Demo';
import DdDropdownForms from './dropdown-forms/Demo';
import DdSelectLabels from './select-labels/Demo';
import DdComboboxOptions from './combobox-options/Demo';
import DdAutocompleteRemote from './autocomplete-remote/Demo';
import DdSelectMultipleOptions from './select-multiple-options/Demo';
import DdComboboxTags from './combobox-tags/Demo';
import DdMentionOptions from './mention-options/Demo';
import DdMentionEditor from './mention-editor/Demo';
import DdMulticolumnTemplates from './multicolumn-templates/Demo';
import DdDropdownLargeLists from './dropdown-large-lists/Demo';
import DdDropdownAccessibility from './dropdown-accessibility/Demo';
import ConversationBasic from './conversation-basic/Demo';
import ConversationActions from './conversation-actions/Demo';
import ConversationHistory from './conversation-history/Demo';
import ConversationAssistant from './conversation-assistant/Demo';
import InlineAssistBasic from './inline-assist-basic/Demo';
import InlineAssistModes from './inline-assist-modes/Demo';
import ConversationMentions from './conversation-mentions/Demo';
import InlineEditDemo from './inline-edit/Demo';
import MarkdownEditorDemo from './markdown-editor/Demo';
import ImageEditorDemo from './image-editor/Demo';
import BlockEditorDemo from './block-editor/Demo';
import RichTextContentDemo from './rich-text-content/Demo';
import PdfViewerDemo from './pdf-viewer/Demo';
import InlineEditApiDemo from './inline-edit-api/Demo';
import InlineEditOptionsDemo from './inline-edit-options/Demo';
import InlineEditRichTextDemo from './inline-edit-rich-text/Demo';
import MarkdownEditorCommandsDemo from './markdown-editor-commands/Demo';
import MarkdownEditorFormDemo from './markdown-editor-form/Demo';
import ImageEditorControlledDemo from './image-editor-controlled/Demo';
import RichTextEditorInlineDemo from './rich-text-editor-inline/Demo';
import RichTextEditorInsertDemo from './rich-text-editor-insert/Demo';
import RichTextEditorApiDemo from './rich-text-editor-api/Demo';
import RichTextPasteDemo from './rich-text-paste/Demo';
import RichTextExtensionsDemo from './rich-text-extensions/Demo';
import BlockEditorApiDemo from './block-editor-api/Demo';
import BlockEditorCollabDemo from './block-editor-collab/Demo';
import PdfViewerPasswordDemo from './pdf-viewer-password/Demo';
import PdfViewerApiDemo from './pdf-viewer-api/Demo';
import Chips from './chips/Demo';
import TagGroupDemo from './tag-group/Demo';
import ControlSizes from './control-sizes/Demo';
import SelectBasics from './select-basics/Demo';
import SelectMultiple from './select-multiple/Demo';
import ComboboxBasics from './combobox-basics/Demo';
import Autocomplete from './autocomplete/Demo';
import MulticolumnCombobox from './multicolumn-combobox/Demo';
import TreeSelectBasics from './tree-select-basics/Demo';
import TreeSelectCheckboxes from './tree-select-checkboxes/Demo';
import TreeSelectLazy from './tree-select-lazy/Demo';
import Accessibility from './accessibility/Demo';
import Adaptive from './adaptive/Demo';
import MenuButtonDemo from './menu-button/Demo';
import CarouselAutoplay from './carousel-autoplay/Demo';
import CarouselBasics from './carousel-basics/Demo';
import MenuCheckable from './menu-checkable/Demo';
import ButtonAttributes from './button-attributes/Demo';
import ButtonGroupMenus from './button-group-menus/Demo';
import MenuItemsData from './menu-items-data/Demo';
import MenuOpenState from './menu-open-state/Demo';
import MenuStandaloneRtl from './menu-standalone-rtl/Demo';
import MenuLong from './menu-long/Demo';
import ChipsMapping from './chips-mapping/Demo';
import ButtonSsrCost from './button-ssr-cost/Demo';
import CarouselTemplates from './carousel-templates/Demo';
import ContextMenuControlled from './context-menu-controlled/Demo';
import ContextMenuEvents from './context-menu-events/Demo';
import NavigationCommon from './navigation-common/Demo';
import SidebarLayoutModes from './sidebar-layout-modes/Demo';
import StepperEvents from './stepper-events/Demo';
import TabsOptions from './tabs-options/Demo';
import ToolbarStates from './toolbar-states/Demo';
import TreeViewFlatData from './tree-view-flat-data/Demo';
import TreeViewInteraction from './tree-view-interaction/Demo';
import SpeedDial from './speed-dial/Demo';
import SplitButtonDemo from './split-button/Demo';
import PopoverDemo from './popover/Demo';
import TooltipDemo from './tooltip/Demo';
import SplitterPanesDemo from './splitter-panes/Demo';
import DialogOptionsDemo from './dialog-options/Demo';
import TooltipOptionsDemo from './tooltip-options/Demo';
import ListViewRemoteDemo from './listview-remote/Demo';
import ListViewOptionsDemo from './listview-options/Demo';
import ToastOptionsDemo from './toast-options/Demo';
import ProgressLinearDemo from './progress-linear/Demo';
import ProgressCircularDemo from './progress-circular/Demo';
import SkeletonCardDemo from './skeleton-card/Demo';
import SpinnerOverlayDemo from './spinner-overlay/Demo';
import SplitterDemo from './splitter/Demo';
import DrawerDemo from './drawer/Demo';
import AlertDialogDemo from './alert-dialog/Demo';
import DialogDraggableDemo from './dialog-draggable/Demo';
import DialogDemo from './dialog/Demo';
import ListDemo from './list/Demo';
import ListViewDemo from './listview/Demo';
import TimelineDemo from './timeline/Demo';
import AvatarDemo from './avatar/Demo';
import CardDemo from './card/Demo';
import DashboardLayoutDemo from './dashboard-layout/Demo';
import Aggregates from './aggregates/Demo';
import Appearance from './appearance/Demo';
import BatchVirtual from './batch-virtual/Demo';
import CellSpans from './cell-spans/Demo';
import CellTemplates from './cell-templates/Demo';
import CellUpdates from './cell-updates/Demo';
import ChildGrids from './child-grids/Demo';
import Clipboard from './clipboard/Demo';
import ColumnApi from './column-api/Demo';
import ColumnCapabilities from './column-capabilities/Demo';
import ColumnChooser from './column-chooser/Demo';
import ColumnChooserTemplates from './column-chooser-templates/Demo';
import ColumnFit from './column-fit/Demo';
import ColumnLayout from './column-layout/Demo';
import ColumnMenu from './column-menu/Demo';
import ColumnVirtualization from './column-virtualization/Demo';
import ColumnsBasics from './columns-basics/Demo';
import ContextMenu from './context-menu/Demo';
import ControlledData from './controlled-data/Demo';
import CursorPaging from './cursor-paging/Demo';
import ControlledState from './controlled-state/Demo';
import DetailRows from './detail-rows/Demo';
import CalendarDatePicker from './calendar-date-picker/Demo';
import CalendarDateTimePicker from './calendar-date-time-picker/Demo';
import CalendarDateRangePicker from './calendar-date-range-picker/Demo';
import CalendarTimePicker from './calendar-time-picker/Demo';
import CalendarPickerForms from './calendar-picker-forms/Demo';
import DatePicker from './date-picker/Demo';
import Editing from './editing/Demo';
import EditingApi from './editing-api/Demo';
import EditingServer from './editing-server/Demo';
import EmptyState from './empty-state/Demo';
import FillRange from './fill-range/Demo';
import FormatPatterns from './format-patterns/Demo';
import DataGridApi from './grid-api/Demo';
import ExportPrint from './export-print/Demo';
import FilterBuilder from './filter-builder/Demo';
import FilterMenus from './filter-menus/Demo';
import FilterRow from './filter-row/Demo';
import FilterStatus from './filter-status/Demo';
import DataGridEvents from './grid-events/Demo';
import DataGridInternals from './grid-internals/Demo';
import Grouping from './grouping/Demo';
import HierarchyOutput from './hierarchy-output/Demo';
import GroupingWide from './grouping-wide/Demo';
import InfiniteScroll from './infinite-scroll/Demo';
import LazyGrouping from './lazy-grouping/Demo';
import LiveData from './live-data/Demo';
import ListboxBasic from './listbox-basic/Demo';
import ListboxGrid from './listbox-grid/Demo';
import ListboxDualList from './listbox-dual-list/Demo';
import ListboxSearch from './listbox-search/Demo';
import Icons from './icons/Demo';
import LoadingIndicator from './loading-indicator/Demo';
import Localization from './localization/Demo';
import LocaleZhTw from './locale-zh-tw/Demo';
import LookupColumns from './lookup-columns/Demo';
import LookupRemote from './lookup-remote/Demo';
import MillionRows from './million-rows/Demo';
import NewRow from './new-row/Demo';
import OdataBridge from './odata-bridge/Demo';
import OfflineData from './offline-data/Demo';
import PagedGroups from './paged-groups/Demo';
import Paging from './paging/Demo';
import PinnedColumns from './pinned-columns/Demo';
import PinnedRows from './pinned-rows/Demo';
import RemoteEditing from './remote-editing/Demo';
import RemoteJson from './remote-json/Demo';
import RemoteQuery from './remote-query/Demo';
import RenderCounts from './render-counts/Demo';
import RowDrag from './row-drag/Demo';
import RowEvents from './row-events/Demo';
import RowDragTargets from './row-drag-targets/Demo';
import RowNumber from './row-number/Demo';
import RowTemplate from './row-template/Demo';
import Rtl from './rtl/Demo';
import Search from './search/Demo';
import SelectionCells from './selection-cells/Demo';
import SelectionRows from './selection-rows/Demo';
import SavedViews from './saved-views/Demo';
import StatePersistence from './state-persistence/Demo';
import SkeletonRows from './skeleton-rows/Demo';
import SlotTemplates from './slot-templates/Demo';
import Sorting from './sorting/Demo';
import ThemeColors from './theme-colors/Demo';
import ThemeDensity from './theme-density/Demo';
import ThemeSurfaces from './theme-surfaces/Demo';
import StackedHeaders from './stacked-headers/Demo';
import TextMatching from './text-matching/Demo';
import Toolbar from './toolbar/Demo';
import TreeBasic from './tree-basic/Demo';
import TreeCheckbox from './tree-checkbox/Demo';
import TreeFlatFilter from './tree-flat-filter/Demo';
import TreeIndent from './tree-indent/Demo';
import TreeRemote from './tree-remote/Demo';
import TreeTemplates from './tree-templates/Demo';
import TreeAggregates from './tree-aggregates/Demo';
import TreeExportPrint from './tree-export-print/Demo';
import TreeState from './tree-state/Demo';
import TreeLarge from './tree-large/Demo';
import TreePerformance from './tree-performance/Demo';
import TreeDataSources from './tree-data-sources/Demo';
import TreeDragTargets from './tree-drag-targets/Demo';
import TreeRtlLocale from './tree-rtl-locale/Demo';
import UrlPaging from './url-paging/Demo';
import Validation from './validation/Demo';
import VariableRowHeight from './variable-row-height/Demo';
import VirtualInteractions from './virtual-interactions/Demo';
import Virtualization from './virtualization/Demo';
import CalendarBasic from './calendar-basic/Demo';
import CalendarRecurrenceEditor from './calendar-recurrence-editor/Demo';
import SchedulerBasic from './scheduler-basic/Demo';
import SchedulerTimeline from './scheduler-timeline/Demo';
import CalendarDisabledDays from './calendar-disabled-days/Demo';
import CalendarMultiple from './calendar-multiple/Demo';
import DateField from './date-field/Demo';
import RangeCalendar from './range-calendar/Demo';
import TimeField from './time-field/Demo';
// Calendars: Scheduler, pickers and Recurrence Editor demos (imports).
import CalCalendarPickerFormats from './calendar-picker-formats/Demo';
import CalCalendarPickerBehavior from './calendar-picker-behavior/Demo';
import CalCalendarPickerValidation from './calendar-picker-validation/Demo';
import CalDateRangePickerOptions from './date-range-picker-options/Demo';
import CalCalendarPickersPlatform from './calendar-pickers-platform/Demo';
import CalDatePickerDataGrid from './date-picker-data-grid/Demo';
import CalRecurrenceEditorOptions from './recurrence-editor-options/Demo';
import CalSchedulerViewsNavigation from './scheduler-views-navigation/Demo';
import CalSchedulerGlobalization from './scheduler-globalization/Demo';
import CalSchedulerEventLayout from './scheduler-event-layout/Demo';
import CalSchedulerLarge from './scheduler-large/Demo';
import CalSchedulerRemote from './scheduler-remote/Demo';
import CalSchedulerEditing from './scheduler-editing/Demo';
import CalSchedulerRecurrence from './scheduler-recurrence/Demo';
import CalSchedulerTemplates from './scheduler-templates/Demo';
import CalSchedulerDragDrop from './scheduler-drag-drop/Demo';
import CalSchedulerSelectionKeyboard from './scheduler-selection-keyboard/Demo';
import CalSchedulerResources from './scheduler-resources/Demo';
import CalSchedulerExportPrint from './scheduler-export-print/Demo';
import CalSchedulerAdaptiveTheming from './scheduler-adaptive-theming/Demo';
// Calendars: Gantt demos (imports).
import CalGanttEditing from './gantt-editing/Demo';
import CalGanttScheduling from './gantt-scheduling/Demo';
import CalGanttCalendars from './gantt-calendars/Demo';
import CalGanttTimeline from './gantt-timeline/Demo';
import CalGanttAppearance from './gantt-appearance/Demo';
import CalGanttResources from './gantt-resources/Demo';
import CalGanttGridPane from './gantt-grid-pane/Demo';
import CalGanttRemote from './gantt-remote/Demo';
import CalGanttLarge from './gantt-large/Demo';
import CalGanttExportAccessibility from './gantt-export-accessibility/Demo';
import PivotTableOverview from './pivot-table-overview/Demo';
import PivotTableLayouts from './pivot-table-layouts/Demo';
import PivotTableFieldList from './pivot-table-field-list/Demo';
import PivotTableDrillThrough from './pivot-table-drill-through/Demo';
import PivotTableTemplates from './pivot-table-templates/Demo';
import PivotTableChartData from './pivot-table-chart-data/Demo';
import PivotTableDataBinding from './pivot-table-data-binding/Demo';
import PivotTableTotals from './pivot-table-totals/Demo';
import PivotTableAggregation from './pivot-table-aggregation/Demo';
import PivotTableAxisBar from './pivot-table-axis-bar/Demo';
import PivotTableFiltering from './pivot-table-filtering/Demo';
import PivotTableSortingGrouping from './pivot-table-sorting-grouping/Demo';
import PivotTableEditors from './pivot-table-editors/Demo';
import PivotTableToolbarExport from './pivot-table-toolbar-export/Demo';
import PivotTablePerformance from './pivot-table-performance/Demo';
import PivotTableAccessibility from './pivot-table-accessibility/Demo';
import PivotTableRemote from './pivot-table-remote/Demo';
// Inputs and Forms.
import FieldCustom from './field-custom/Demo';
import FormValidation from './form-validation/Demo';
import FormStateDrawer from './form-state-drawer/Demo';
import MaskedFieldBasics from './masked-field-basics/Demo';
import NumberFieldBasics from './number-field-basics/Demo';
import TextFieldBasics from './text-field-basics/Demo';
import TextAreaSuggest from './text-area-suggest/Demo';
import TextAreaSuggestFilter from './text-area-suggest-filter/Demo';
import SmartPaste from './smart-paste/Demo';
import FileUploadBasics from './file-upload-basics/Demo';
import FileUploadQueue from './file-upload-queue/Demo';
import FileUploadCustom from './file-upload-custom/Demo';
import FileUploadEvents from './file-upload-events/Demo';
import FileUploadLarge from './file-upload-large/Demo';
import CheckboxBasics from './checkbox-basics/Demo';
import RadioGroupBasics from './radio-group-basics/Demo';
import SwitchBasics from './switch-basics/Demo';
import RatingBasics from './rating-basics/Demo';
import OtpFieldBasics from './otp-field-basics/Demo';
import SliderBasics from './slider-basics/Demo';
import SignaturePadBasics from './signature-pad-basics/Demo';
import ColorPickerBasics from './color-picker-basics/Demo';
import ColorPickerParts from './color-picker-parts/Demo';
import ColorPickerPopover from './color-picker-popover/Demo';
import ColorPickerSwatches from './color-picker-swatches/Demo';
import SpeechToTextBasics from './speech-to-text-basics/Demo';
import FormRendererBasics from './form-renderer-basics/Demo';
import FieldStates from './field-states/Demo';
import FieldForms from './field-forms/Demo';
import InputsKeyboard from './inputs-keyboard/Demo';
import TextFieldNative from './text-field-native/Demo';
import MaskedFieldTokens from './masked-field-tokens/Demo';
import NumberFieldPrecision from './number-field-precision/Demo';
import ChoiceEvents from './choice-events/Demo';
import SliderLimits from './slider-limits/Demo';
import SignaturePadExport from './signature-pad-export/Demo';
import RatingCustom from './rating-custom/Demo';
import OtpFieldOptions from './otp-field-options/Demo';
import FormRules from './form-rules/Demo';
import FormServerErrors from './form-server-errors/Demo';
import FormSharedRules from './form-shared-rules/Demo';
import InputsPerformance from './inputs-performance/Demo';
import QueryBuilderBasics from './query-builder-basics/Demo';
import QueryBuilderConverters from './query-builder-converters/Demo';
import QueryBuilderFields from './query-builder-fields/Demo';
import QueryBuilderApiDemo from './query-builder-api/Demo';
import QueryBuilderSql from './query-builder-sql/Demo';
import QueryBuilderLarge from './query-builder-large/Demo';
import QueryBuilderGrid from './query-builder-grid/Demo';
import BadgeBasic from './badge-basic/Demo';
import BadgeStatus from './badge-status/Demo';
import MessageBasic from './message-basic/Demo';
import ToastBasic from './toast-basic/Demo';
import ContextMenuBasics from './context-menu-basics/Demo';
import MenubarBasics from './menubar-basics/Demo';
import AccordionBasics from './accordion-basics/Demo';
import AccordionNested from './accordion-nested/Demo';
import StepperBasics from './stepper-basics/Demo';
import StepperVertical from './stepper-vertical/Demo';
import PagerBasics from './pager-basics/Demo';
import PagerRouter from './pager-router/Demo';
import SidebarLayoutBasics from './sidebar-layout-basics/Demo';
import SidebarMenuAdmin from './sidebar-menu-admin/Demo';
import SidebarMenuRail from './sidebar-menu-rail/Demo';
import SidebarMenuDark from './sidebar-menu-dark/Demo';
import SidebarMenuNested from './sidebar-menu-nested/Demo';
import ToolbarBasics from './toolbar-basics/Demo';
import ToolbarOverflow from './toolbar-overflow/Demo';
import AppBarRecipe from './app-bar-recipe/Demo';
import RibbonRecipe from './ribbon-recipe/Demo';
import FileBrowserRecipe from './file-browser-recipe/Demo';
import TabsBasics from './tabs-basics/Demo';
import TabsEditor from './tabs-editor/Demo';
import TreeViewBasics from './tree-view-basics/Demo';
import TreeViewLarge from './tree-view-large/Demo';
import TreeViewTemplates from './tree-view-templates/Demo';
import TreeViewCheckboxes from './tree-view-checkboxes/Demo';
import TreeViewLazy from './tree-view-lazy/Demo';
import TreeViewDragDrop from './tree-view-drag-drop/Demo';
import BreadcrumbsBasics from './breadcrumbs-basics/Demo';
import BreadcrumbsOverflow from './breadcrumbs-overflow/Demo';
import KanbanBasics from './kanban-basics/Demo';
import KanbanSwimlanes from './kanban-swimlanes/Demo';
import KanbanEditing from './kanban-editing/Demo';
import KanbanVirtualization from './kanban-virtualization/Demo';

export const demoComponents: Readonly<Record<string, ComponentType>> = {
  'button-basics': ButtonBasics,
  'field-custom': FieldCustom,
  'form-validation': FormValidation,
  'form-state-drawer': FormStateDrawer,
  'masked-field-basics': MaskedFieldBasics,
  'number-field-basics': NumberFieldBasics,
  'text-field-basics': TextFieldBasics,
  'text-area-suggest': TextAreaSuggest,
  'text-area-suggest-filter': TextAreaSuggestFilter,
  'smart-paste': SmartPaste,
  'file-upload-basics': FileUploadBasics,
  'file-upload-queue': FileUploadQueue,
  'file-upload-custom': FileUploadCustom,
  'file-upload-events': FileUploadEvents,
  'file-upload-large': FileUploadLarge,
  'checkbox-basics': CheckboxBasics,
  'radio-group-basics': RadioGroupBasics,
  'switch-basics': SwitchBasics,
  'rating-basics': RatingBasics,
  'otp-field-basics': OtpFieldBasics,
  'slider-basics': SliderBasics,
  'signature-pad-basics': SignaturePadBasics,
  'color-picker-basics': ColorPickerBasics,
  'color-picker-parts': ColorPickerParts,
  'color-picker-popover': ColorPickerPopover,
  'color-picker-swatches': ColorPickerSwatches,
  'speech-to-text-basics': SpeechToTextBasics,
  'form-renderer-basics': FormRendererBasics,
  'field-states': FieldStates,
  'field-forms': FieldForms,
  'inputs-keyboard': InputsKeyboard,
  'text-field-native': TextFieldNative,
  'masked-field-tokens': MaskedFieldTokens,
  'number-field-precision': NumberFieldPrecision,
  'choice-events': ChoiceEvents,
  'slider-limits': SliderLimits,
  'signature-pad-export': SignaturePadExport,
  'rating-custom': RatingCustom,
  'otp-field-options': OtpFieldOptions,
  'form-rules': FormRules,
  'form-server-errors': FormServerErrors,
  'form-shared-rules': FormSharedRules,
  'inputs-performance': InputsPerformance,
  'query-builder-basics': QueryBuilderBasics,
  'query-builder-converters': QueryBuilderConverters,
  'query-builder-fields': QueryBuilderFields,
  'query-builder-api': QueryBuilderApiDemo,
  'query-builder-sql': QueryBuilderSql,
  'query-builder-large': QueryBuilderLarge,
  'query-builder-grid': QueryBuilderGrid,
  'select-basics': SelectBasics,
  'control-sizes': ControlSizes,
  'select-multiple': SelectMultiple,
  'combobox-basics': ComboboxBasics,
  'autocomplete': Autocomplete,
  'multicolumn-combobox': MulticolumnCombobox,
  'tree-select-basics': TreeSelectBasics,
  'tree-select-checkboxes': TreeSelectCheckboxes,
  'tree-select-lazy': TreeSelectLazy,
  'button-repeat': ButtonRepeat,
  'toggle-button': ToggleButton,
  'button-group': ButtonGroup,
  'toggle-button-group': ToggleButtonGroup,
  'progress-button': ProgressButton,
  'floating-action-button': FloatingActionButton,
  'mention': Mention,
  'rich-text-editor': RichTextEditorDemo,
  'mention-remote': MentionRemote,
  'listbox-options': DdListboxOptions,
  'listbox-remote': DdListboxRemote,
  'select-events': DdSelectEvents,
  'dropdown-popup': DdDropdownPopup,
  'dropdown-templates': DdDropdownTemplates,
  'dropdown-forms': DdDropdownForms,
  'select-labels': DdSelectLabels,
  'combobox-options': DdComboboxOptions,
  'autocomplete-remote': DdAutocompleteRemote,
  'select-multiple-options': DdSelectMultipleOptions,
  'combobox-tags': DdComboboxTags,
  'mention-options': DdMentionOptions,
  'mention-editor': DdMentionEditor,
  'multicolumn-templates': DdMulticolumnTemplates,
  'dropdown-large-lists': DdDropdownLargeLists,
  'dropdown-accessibility': DdDropdownAccessibility,
  'conversation-basic': ConversationBasic,
  'conversation-actions': ConversationActions,
  'conversation-history': ConversationHistory,
  'conversation-assistant': ConversationAssistant,
  'inline-assist-basic': InlineAssistBasic,
  'inline-assist-modes': InlineAssistModes,
  'conversation-mentions': ConversationMentions,
  'inline-edit': InlineEditDemo,
  'markdown-editor': MarkdownEditorDemo,
  'image-editor': ImageEditorDemo,
  'block-editor': BlockEditorDemo,
  'rich-text-content': RichTextContentDemo,
  'pdf-viewer': PdfViewerDemo,
  'inline-edit-api': InlineEditApiDemo,
  'inline-edit-options': InlineEditOptionsDemo,
  'inline-edit-rich-text': InlineEditRichTextDemo,
  'markdown-editor-commands': MarkdownEditorCommandsDemo,
  'markdown-editor-form': MarkdownEditorFormDemo,
  'image-editor-controlled': ImageEditorControlledDemo,
  'rich-text-editor-inline': RichTextEditorInlineDemo,
  'rich-text-editor-insert': RichTextEditorInsertDemo,
  'rich-text-editor-api': RichTextEditorApiDemo,
  'rich-text-paste': RichTextPasteDemo,
  'rich-text-extensions': RichTextExtensionsDemo,
  'block-editor-api': BlockEditorApiDemo,
  'block-editor-collab': BlockEditorCollabDemo,
  'pdf-viewer-password': PdfViewerPasswordDemo,
  'pdf-viewer-api': PdfViewerApiDemo,
  'chips': Chips,
  'tag-group': TagGroupDemo,
  'button-attributes': ButtonAttributes,
  'button-group-menus': ButtonGroupMenus,
  'menu-items-data': MenuItemsData,
  'menu-open-state': MenuOpenState,
  'menu-standalone-rtl': MenuStandaloneRtl,
  'menu-long': MenuLong,
  'chips-mapping': ChipsMapping,
  'button-ssr-cost': ButtonSsrCost,
  'carousel-templates': CarouselTemplates,
  'context-menu-controlled': ContextMenuControlled,
  'context-menu-events': ContextMenuEvents,
  'navigation-common': NavigationCommon,
  'sidebar-layout-modes': SidebarLayoutModes,
  'stepper-events': StepperEvents,
  'tabs-options': TabsOptions,
  'toolbar-states': ToolbarStates,
  'tree-view-flat-data': TreeViewFlatData,
  'tree-view-interaction': TreeViewInteraction,
  'accessibility': Accessibility,
  'adaptive': Adaptive,
  'aggregates': Aggregates,
  'appearance': Appearance,
  'batch-virtual': BatchVirtual,
  'cell-spans': CellSpans,
  'cell-templates': CellTemplates,
  'cell-updates': CellUpdates,
  'child-grids': ChildGrids,
  'clipboard': Clipboard,
  'column-api': ColumnApi,
  'column-capabilities': ColumnCapabilities,
  'column-chooser': ColumnChooser,
  'column-chooser-templates': ColumnChooserTemplates,
  'column-fit': ColumnFit,
  'column-layout': ColumnLayout,
  'column-menu': ColumnMenu,
  'column-virtualization': ColumnVirtualization,
  'columns-basics': ColumnsBasics,
  'context-menu': ContextMenu,
  'controlled-data': ControlledData,
  'cursor-paging': CursorPaging,
  'controlled-state': ControlledState,
  'detail-rows': DetailRows,
  'calendar-date-picker': CalendarDatePicker,
  'calendar-date-time-picker': CalendarDateTimePicker,
  'calendar-date-range-picker': CalendarDateRangePicker,
  'calendar-time-picker': CalendarTimePicker,
  'calendar-picker-forms': CalendarPickerForms,
  'date-picker': DatePicker,
  'editing': Editing,
  'editing-api': EditingApi,
  'editing-server': EditingServer,
  'empty-state': EmptyState,
  'export-print': ExportPrint,
  'filter-builder': FilterBuilder,
  'filter-menus': FilterMenus,
  'filter-row': FilterRow,
  'filter-status': FilterStatus,
  'fill-range': FillRange,
  'format-patterns': FormatPatterns,
  'grid-api': DataGridApi,
  'grid-events': DataGridEvents,
  'grid-internals': DataGridInternals,
  'grouping': Grouping,
  'hierarchy-output': HierarchyOutput,
  'grouping-wide': GroupingWide,
  'infinite-scroll': InfiniteScroll,
  'lazy-grouping': LazyGrouping,
  'live-data': LiveData,
  'listbox-basic': ListboxBasic,
  'listbox-grid': ListboxGrid,
  'listbox-dual-list': ListboxDualList,
  'listbox-search': ListboxSearch,
  'icons': Icons,
  'loading-indicator': LoadingIndicator,
  'localization': Localization,
  'locale-zh-tw': LocaleZhTw,
  'lookup-columns': LookupColumns,
  'lookup-remote': LookupRemote,
  'million-rows': MillionRows,
  'new-row': NewRow,
  'odata-bridge': OdataBridge,
  'offline-data': OfflineData,
  'paged-groups': PagedGroups,
  'paging': Paging,
  'pinned-columns': PinnedColumns,
  'pinned-rows': PinnedRows,
  'remote-editing': RemoteEditing,
  'remote-json': RemoteJson,
  'remote-query': RemoteQuery,
  'render-counts': RenderCounts,
  'row-drag': RowDrag,
  'row-events': RowEvents,
  'row-drag-targets': RowDragTargets,
  'row-number': RowNumber,
  'row-template': RowTemplate,
  'rtl': Rtl,
  'search': Search,
  'selection-cells': SelectionCells,
  'selection-rows': SelectionRows,
  'skeleton-rows': SkeletonRows,
  'sorting': Sorting,
  'stacked-headers': StackedHeaders,
  'saved-views': SavedViews,
  'state-persistence': StatePersistence,
  'slot-templates': SlotTemplates,
  'text-matching': TextMatching,
  'theme-colors': ThemeColors,
  'theme-density': ThemeDensity,
  'theme-surfaces': ThemeSurfaces,
  'toolbar': Toolbar,
  'tree-basic': TreeBasic,
  'tree-checkbox': TreeCheckbox,
  'tree-flat-filter': TreeFlatFilter,
  'tree-indent': TreeIndent,
  'tree-remote': TreeRemote,
  'tree-templates': TreeTemplates,
  'tree-aggregates': TreeAggregates,
  'tree-export-print': TreeExportPrint,
  'tree-state': TreeState,
  'tree-large': TreeLarge,
  'tree-performance': TreePerformance,
  'tree-data-sources': TreeDataSources,
  'tree-drag-targets': TreeDragTargets,
  'tree-rtl-locale': TreeRtlLocale,
  'url-paging': UrlPaging,
  'validation': Validation,
  'variable-row-height': VariableRowHeight,
  'virtual-interactions': VirtualInteractions,
  'virtualization': Virtualization,
  // Buttons category.
  'menu-button': MenuButtonDemo,
  'menu-checkable': MenuCheckable,
  'speed-dial': SpeedDial,
  'split-button': SplitButtonDemo,
  // Calendars (category: calendars).
  'calendar-basic': CalendarBasic,
  'calendar-recurrence-editor': CalendarRecurrenceEditor,
  'scheduler-basic': SchedulerBasic,
  'scheduler-timeline': SchedulerTimeline,
  'sparkline-basic': SparklineBasicDemo,
  'sparkline-grid': SparklineGridDemo,
  'pie-chart-basic': PieChartBasicDemo,
  'pie-chart-variants': PieChartVariantsDemo,
  'funnel-chart': FunnelChartDemo,
  'heat-map-basic': HeatMapBasicDemo,
  'heat-map-large': HeatMapLargeDemo,
  'tree-map-drill': TreeMapDrillDemo,
  'sankey-chart-basic': SankeyChartBasicDemo,
  'barcode-encoder': BarcodeEncoderDemo,
  'bullet-chart-kpis': BulletChartKpisDemo,
  'gauge-thermostat': GaugeThermostatDemo,
  'geo-map-tiles-drag': GeoMapTilesDragDemo,
  'heat-map-bubbles': HeatMapBubblesDemo,
  'sankey-chart-budget': SankeyChartBudgetDemo,
  'sparkline-axis-events': SparklineAxisEventsDemo,
  'tree-map-portfolio': TreeMapPortfolioDemo,
  'chart-line-area': ChartLineAreaDemo,
  'chart-columns-stacks': ChartColumnsStacksDemo,
  'chart-scatter-bubble': ChartScatterBubbleDemo,
  'chart-financial': ChartFinancialDemo,
  'chart-statistical': ChartStatisticalDemo,
  'chart-polar': ChartPolarDemo,
  'chart-live': ChartLiveDemo,
  'chart-axis-scales': ChartAxisScalesDemo,
  'chart-axis-layout': ChartAxisLayoutDemo,
  'chart-axis-labels': ChartAxisLabelsDemo,
  'chart-tooltip-crosshair': ChartTooltipCrosshairDemo,
  'chart-zoom': ChartZoomDemo,
  'chart-selection': ChartSelectionDemo,
  'chart-sync': ChartSyncDemo,
  'chart-legend': ChartLegendDemo,
  'chart-labels-markers': ChartLabelsMarkersDemo,
  'chart-trendlines': ChartTrendlinesDemo,
  'chart-indicators': ChartIndicatorsDemo,
  'chart-rendering': ChartRenderingDemo,
  'chart-export': ChartExportDemo,
  'chart-size-rtl': ChartSizeRtlDemo,
  'stock-chart-basic': StockChartBasicDemo,
  'stock-chart-events': StockChartEventsDemo,
  'range-selector-navigator': RangeSelectorNavigatorDemo,
  'range-selector-options': RangeSelectorOptionsDemo,
  'calendar-disabled-days': CalendarDisabledDays,
  'calendar-multiple': CalendarMultiple,
  'date-field': DateField,
  'range-calendar': RangeCalendar,
  'time-field': TimeField,
  // Calendars: Scheduler, pickers and Recurrence Editor demos.
  'calendar-picker-formats': CalCalendarPickerFormats,
  'calendar-picker-behavior': CalCalendarPickerBehavior,
  'calendar-picker-validation': CalCalendarPickerValidation,
  'date-range-picker-options': CalDateRangePickerOptions,
  'calendar-pickers-platform': CalCalendarPickersPlatform,
  'date-picker-data-grid': CalDatePickerDataGrid,
  'recurrence-editor-options': CalRecurrenceEditorOptions,
  'scheduler-views-navigation': CalSchedulerViewsNavigation,
  'scheduler-globalization': CalSchedulerGlobalization,
  'scheduler-event-layout': CalSchedulerEventLayout,
  'scheduler-large': CalSchedulerLarge,
  'scheduler-remote': CalSchedulerRemote,
  'scheduler-editing': CalSchedulerEditing,
  'scheduler-recurrence': CalSchedulerRecurrence,
  'scheduler-templates': CalSchedulerTemplates,
  'scheduler-drag-drop': CalSchedulerDragDrop,
  'scheduler-selection-keyboard': CalSchedulerSelectionKeyboard,
  'scheduler-resources': CalSchedulerResources,
  'scheduler-export-print': CalSchedulerExportPrint,
  'scheduler-adaptive-theming': CalSchedulerAdaptiveTheming,
  // Calendars: Gantt demos.
  'gantt-editing': CalGanttEditing,
  'gantt-scheduling': CalGanttScheduling,
  'gantt-calendars': CalGanttCalendars,
  'gantt-timeline': CalGanttTimeline,
  'gantt-appearance': CalGanttAppearance,
  'gantt-resources': CalGanttResources,
  'gantt-grid-pane': CalGanttGridPane,
  'gantt-remote': CalGanttRemote,
  'gantt-large': CalGanttLarge,
  'gantt-export-accessibility': CalGanttExportAccessibility,
  // Pivot Table (category: pivot-table).
  'pivot-table-overview': PivotTableOverview,
  'pivot-table-layouts': PivotTableLayouts,
  'pivot-table-field-list': PivotTableFieldList,
  'pivot-table-drill-through': PivotTableDrillThrough,
  'pivot-table-templates': PivotTableTemplates,
  'pivot-table-chart-data': PivotTableChartData,
  'pivot-table-data-binding': PivotTableDataBinding,
  'pivot-table-totals': PivotTableTotals,
  'pivot-table-aggregation': PivotTableAggregation,
  'pivot-table-axis-bar': PivotTableAxisBar,
  'pivot-table-filtering': PivotTableFiltering,
  'pivot-table-sorting-grouping': PivotTableSortingGrouping,
  'pivot-table-editors': PivotTableEditors,
  'pivot-table-toolbar-export': PivotTableToolbarExport,
  'pivot-table-performance': PivotTablePerformance,
  'pivot-table-accessibility': PivotTableAccessibility,
  'pivot-table-remote': PivotTableRemote,
  // Notifications (category: notifications): Badge and Message.
  'badge-basic': BadgeBasic,
  'badge-status': BadgeStatus,
  'message-basic': MessageBasic,
  // Toaster and the toast queue.
  'toast-basic': ToastBasic,
  // Navigation category.
  'context-menu-basics': ContextMenuBasics,
  'menubar-basics': MenubarBasics,
  'accordion-basics': AccordionBasics,
  'accordion-nested': AccordionNested,
  'stepper-basics': StepperBasics,
  'stepper-vertical': StepperVertical,
  'carousel-autoplay': CarouselAutoplay,
  'carousel-basics': CarouselBasics,
  'pager-basics': PagerBasics,
  'pager-router': PagerRouter,
  'sidebar-layout-basics': SidebarLayoutBasics,
  'sidebar-menu-admin': SidebarMenuAdmin,
  'sidebar-menu-rail': SidebarMenuRail,
  'sidebar-menu-dark': SidebarMenuDark,
  'sidebar-menu-nested': SidebarMenuNested,
  'toolbar-basics': ToolbarBasics,
  'toolbar-overflow': ToolbarOverflow,
  'app-bar-recipe': AppBarRecipe,
  'ribbon-recipe': RibbonRecipe,
  'file-browser-recipe': FileBrowserRecipe,
  // Data Visualization (category: data-visualization): Gauge, Barcode, QRCode, GeoMap.
  'gauge-basic': GaugeBasic,
  'gauge-linear': GaugeLinear,
  'barcode-types': BarcodeTypes,
  'qr-code-basic': QRCodeBasic,
  'pdf417-basic': Pdf417Basic,
  'gs1-databar-variants': Gs1DataBarVariants,
  'dotcode-basic': DotCodeBasic,
  'geo-map-choropleth': GeoMapChoropleth,
  'geo-map-markers': GeoMapMarkers,
  'tabs-basics': TabsBasics,
  'tabs-editor': TabsEditor,
  'tree-view-basics': TreeViewBasics,
  'tree-view-large': TreeViewLarge,
  'tree-view-templates': TreeViewTemplates,
  'tree-view-checkboxes': TreeViewCheckboxes,
  'tree-view-lazy': TreeViewLazy,
  'tree-view-drag-drop': TreeViewDragDrop,
  'breadcrumbs-basics': BreadcrumbsBasics,
  'breadcrumbs-overflow': BreadcrumbsOverflow,
  // Layout (category: layout).
  'popover': PopoverDemo,
  'tooltip': TooltipDemo,
  'splitter-panes': SplitterPanesDemo,
  'dialog-options': DialogOptionsDemo,
  'tooltip-options': TooltipOptionsDemo,
  'listview-remote': ListViewRemoteDemo,
  'listview-options': ListViewOptionsDemo,
  'toast-options': ToastOptionsDemo,
  'progress-linear': ProgressLinearDemo,
  'progress-circular': ProgressCircularDemo,
  'skeleton-card': SkeletonCardDemo,
  'spinner-overlay': SpinnerOverlayDemo,
  'splitter': SplitterDemo,
  'drawer': DrawerDemo,
  'alert-dialog': AlertDialogDemo,
  'dialog-draggable': DialogDraggableDemo,
  'dialog': DialogDemo,
  'list': ListDemo,
  'listview': ListViewDemo,
  'timeline': TimelineDemo,
  'avatar': AvatarDemo,
  'card': CardDemo,
  'dashboard-layout': DashboardLayoutDemo,
  // Data Visualization category: Kanban.
  'kanban-basics': KanbanBasics,
  'kanban-swimlanes': KanbanSwimlanes,
  'kanban-editing': KanbanEditing,
  'kanban-virtualization': KanbanVirtualization,
};
