// Locale families of @salmonui/layout (see ../locale-coverage.test.mjs and
// ./navigation.mjs for the entry format). Splitter keeps its one English
// string inline (`?? 'Resize'`), so its key is listed here. Avatar reads no
// provider: its entry is a server-component-safe module without hooks or
// context.
export default {
  splitter: { keys: ['resizePane'] },
  dashboardLayout: { defaults: [{ module: 'packages/layout/dist/dashboard-layout/DashboardLayout.js', export: 'DASHBOARD_LAYOUT_DEFAULT_LOCALE_TEXT' }] },
};
