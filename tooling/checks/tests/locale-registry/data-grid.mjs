// Locale families of @salmonui/data-grid (see ../locale-coverage.test.mjs and navigation.mjs).
// The tree mode texts default inline in the React tree feature (tree-toggle.tsx), so they are listed as `keys`.
export default {
  dataGrid: {
    defaults: [{ module: 'packages/data-grid/dist/engine/locale.js', export: 'DEFAULT_LOCALE_TEXT' }],
    keys: ['treeExpand', 'treeCollapse', 'treeLoading', 'treeLoadError', 'treeLevel', 'treeExpanded', 'treeCollapsed', 'treeRetry'],
  },
};
