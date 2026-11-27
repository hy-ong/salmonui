// Traditional Chinese (Taiwan) locale pack: the `localeText` of every Salmon UI
// component family, keyed like the `localeText` catalog of `LocaleProvider`.
// Plain data (no React): import the whole catalog (`zhTW`) or only the
// families an application renders (`import { pager, dataGrid } from
// '@salmonui/core/locale/zh-TW'`); bundlers drop the families not imported
// (named re-exports and a pure `zhTW`, never a namespace object).
// Each package's families live in one file under ./zh-TW/; the coverage test
// (tooling/checks/tests/locale-coverage.test.mjs) fails when a family or a
// key of a component is missing here.

import { contextMenu, menubar, tagGroup } from './zh-TW/buttons.js';
import { calendar, dateField, datePicker, dateRangePicker, timePicker } from './zh-TW/calendars.js';
import { chart, bulletChart, stockChart, rangeSelector, heatMap, treeMap, sankeyChart, pieChart, funnelChart, gauge, geoMap } from './zh-TW/charts.js';
import { conversation, inlineAssist, textSuggest } from './zh-TW/chat.js';
import { validation, dialog } from './zh-TW/core.js';
import { dataGrid } from './zh-TW/data-grid.js';
import { select, combobox, treeSelect, listbox, mention } from './zh-TW/dropdowns.js';
import { inlineEdit, markdownEditor, imageEditor } from './zh-TW/editors.js';
import { gantt } from './zh-TW/gantt.js';
import { textField, maskedField, numberField, otpField, rating, slider, fileUpload, signaturePad, colorPicker, colorArea, colorSlider, colorField, colorSwatchPicker, speechToText, formRenderer } from './zh-TW/inputs.js';
import { kanban } from './zh-TW/kanban.js';
import { splitter, dashboardLayout } from './zh-TW/layout.js';
import { pager, breadcrumbs, carousel, sidebarLayout, stepper, tabs, toolbar, treeView, sidebarMenu } from './zh-TW/navigation.js';
import { toaster, message } from './zh-TW/notifications.js';
import { alertDialog } from './zh-TW/overlays.js';
import { pdfViewer } from './zh-TW/pdf-viewer.js';
import { pivotTable } from './zh-TW/pivot-table.js';
import { queryBuilder } from './zh-TW/query-builder.js';
import { richTextEditor, blockEditor } from './zh-TW/rich-text.js';
import { scheduler, recurrenceEditor } from './zh-TW/scheduler.js';

export { contextMenu, menubar, tagGroup } from './zh-TW/buttons.js';
export { calendar, dateField, datePicker, dateRangePicker, timePicker } from './zh-TW/calendars.js';
export { chart, bulletChart, stockChart, rangeSelector, heatMap, treeMap, sankeyChart, pieChart, funnelChart, gauge, geoMap } from './zh-TW/charts.js';
export { conversation, inlineAssist, textSuggest } from './zh-TW/chat.js';
export { validation, dialog } from './zh-TW/core.js';
export { dataGrid } from './zh-TW/data-grid.js';
export { select, combobox, treeSelect, listbox, mention } from './zh-TW/dropdowns.js';
export { inlineEdit, markdownEditor, imageEditor } from './zh-TW/editors.js';
export { gantt } from './zh-TW/gantt.js';
export { textField, maskedField, numberField, otpField, rating, slider, fileUpload, signaturePad, colorPicker, colorArea, colorSlider, colorField, colorSwatchPicker, speechToText, formRenderer } from './zh-TW/inputs.js';
export { kanban } from './zh-TW/kanban.js';
export { splitter, dashboardLayout } from './zh-TW/layout.js';
export { pager, breadcrumbs, carousel, sidebarLayout, stepper, tabs, toolbar, treeView, sidebarMenu } from './zh-TW/navigation.js';
export { toaster, message } from './zh-TW/notifications.js';
export { alertDialog } from './zh-TW/overlays.js';
export { pdfViewer } from './zh-TW/pdf-viewer.js';
export { pivotTable } from './zh-TW/pivot-table.js';
export { queryBuilder } from './zh-TW/query-builder.js';
export { richTextEditor, blockEditor } from './zh-TW/rich-text.js';
export { scheduler, recurrenceEditor } from './zh-TW/scheduler.js';

/** The BCP 47 locale of this pack. */
export const locale = 'zh-TW';

/** Every family of the pack: `<LocaleProvider locale="zh-TW" localeText={zhTW}>`. */
export const zhTW = /* @__PURE__ */ Object.freeze({
  contextMenu, menubar, tagGroup,
  calendar, dateField, datePicker, dateRangePicker, timePicker,
  chart, bulletChart, stockChart, rangeSelector, heatMap, treeMap, sankeyChart, pieChart, funnelChart, gauge, geoMap,
  conversation, inlineAssist, textSuggest,
  validation, dialog,
  dataGrid,
  select, combobox, treeSelect, listbox, mention,
  inlineEdit, markdownEditor, imageEditor,
  gantt,
  textField, maskedField, numberField, otpField, rating, slider, fileUpload, signaturePad, colorPicker, colorArea, colorSlider, colorField, colorSwatchPicker, speechToText, formRenderer,
  kanban,
  splitter, dashboardLayout,
  pager, breadcrumbs, carousel, sidebarLayout, stepper, tabs, toolbar, treeView, sidebarMenu,
  toaster, message,
  alertDialog,
  pdfViewer,
  pivotTable,
  queryBuilder,
  richTextEditor, blockEditor,
  scheduler, recurrenceEditor,
});
