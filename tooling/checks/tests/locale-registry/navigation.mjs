// Locale families of @salmonui/navigation (see ../locale-coverage.test.mjs):
// family -> { defaults: [{ module, export, prefix?, omit? }], keys?, empty?, indirect? }.
// `module` is a built file (repository-relative), `export` its frozen English
// defaults; `keys` lists English keys that have no defaults object (inline
// fallbacks); `empty` the keys whose translation may be ''.
export default {
  sidebarMenu: { defaults: [{ module: 'packages/navigation/dist/sidebar-menu/locale.js', export: 'SIDEBAR_MENU_DEFAULT_LOCALE_TEXT' }] },
  pager: { defaults: [{ module: 'packages/navigation/dist/pager/locale.js', export: 'PAGER_DEFAULT_LOCALE_TEXT' }], empty: ['pageLabel'] },
  breadcrumbs: { defaults: [{ module: 'packages/navigation/dist/breadcrumbs/Breadcrumbs.js', export: 'BREADCRUMBS_DEFAULT_LOCALE_TEXT' }] },
  carousel: { defaults: [{ module: 'packages/navigation/dist/carousel/Carousel.js', export: 'CAROUSEL_DEFAULT_LOCALE_TEXT' }] },
  sidebarLayout: { defaults: [{ module: 'packages/navigation/dist/sidebar-layout/SidebarLayout.js', export: 'SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT' }] },
  stepper: { defaults: [{ module: 'packages/navigation/dist/stepper/Stepper.js', export: 'STEPPER_DEFAULT_LOCALE_TEXT' }] },
  tabs: { defaults: [{ module: 'packages/navigation/dist/tabs/Tabs.js', export: 'TABS_DEFAULT_LOCALE_TEXT' }] },
  toolbar: { defaults: [{ module: 'packages/navigation/dist/toolbar/Toolbar.js', export: 'TOOLBAR_DEFAULT_LOCALE_TEXT' }] },
  treeView: { defaults: [{ module: 'packages/navigation/dist/tree-view/locale.js', export: 'TREE_VIEW_DEFAULT_LOCALE_TEXT' }] },
};
