// @salmonui/navigation export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/navigation', {
  './accordion': ['Accordion', 'AccordionItem'],
  './breadcrumbs': ['Breadcrumbs', 'BreadcrumbItem', 'BREADCRUMBS_DEFAULT_LOCALE_TEXT'],
  './carousel': ['Carousel', 'CarouselSlide', 'CAROUSEL_DEFAULT_LOCALE_TEXT'],
  './sidebar-layout': ['SidebarLayout', 'SidebarPanel', 'SidebarMain', 'SidebarTrigger', 'SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT'],
  './sidebar-menu': ['SidebarMenu', 'SIDEBAR_MENU_DEFAULT_LOCALE_TEXT'],
  './tabs': ['Tabs', 'TabList', 'Tab', 'TabPanel', 'TABS_DEFAULT_LOCALE_TEXT'],
  './toolbar': ['Toolbar', 'ToolbarItem', 'ToolbarGroup', 'ToolbarSeparator', 'ToolbarSpacer', 'TOOLBAR_DEFAULT_LOCALE_TEXT'],
  './tree-view': ['TreeView', 'TREE_VIEW_DEFAULT_LOCALE_TEXT'],
  './stepper': ['Stepper', 'Step', 'STEPPER_DEFAULT_LOCALE_TEXT'],
  './pager': ['Pager', 'PAGER_DEFAULT_LOCALE_TEXT'],
});
