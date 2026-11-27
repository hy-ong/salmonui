// Locale families of @salmonui/gantt (see ../locale-coverage.test.mjs and
// navigation.mjs for the entry format). The grid pane reads the `dataGrid`
// family; `localeText.grid` is not a translated key.
export default {
  gantt: { defaults: [{ module: 'packages/gantt/dist/gantt/locale.js', export: 'GANTT_DEFAULT_LOCALE_TEXT' }] },
};
