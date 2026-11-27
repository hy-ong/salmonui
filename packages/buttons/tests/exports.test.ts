// @salmonui/buttons export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/buttons', {
  './button': ['Button', 'ToggleButton', 'ButtonGroup', 'ToggleButtonGroup'],
  './menu': ['Menu', 'MenuItem', 'MenuButton', 'SplitButton', 'ContextMenu', 'Menubar', 'MenubarMenu', 'MenubarItem', 'Submenu', 'CONTEXT_MENU_DEFAULT_LOCALE_TEXT', 'MENUBAR_DEFAULT_LOCALE_TEXT'],
  './tag-group': ['TagGroup', 'Tag'],
});
