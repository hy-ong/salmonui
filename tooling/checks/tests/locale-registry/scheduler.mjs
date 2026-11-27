// Locale families of @salmonui/scheduler (see ../locale-coverage.test.mjs and
// navigation.mjs for the entry format). The RecurrenceEditor defaults spread
// the core recurrence summary text (`RECURRENCE_SUMMARY_DEFAULT_TEXT`), so its
// family covers the summary keys too.
export default {
  scheduler: { defaults: [{ module: 'packages/scheduler/dist/scheduler/locale.js', export: 'SCHEDULER_DEFAULT_LOCALE_TEXT' }] },
  recurrenceEditor: { defaults: [{ module: 'packages/scheduler/dist/recurrence-editor/RecurrenceEditor.js', export: 'RECURRENCE_EDITOR_DEFAULT_LOCALE_TEXT' }] },
};
