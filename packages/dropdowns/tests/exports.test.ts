// @salmonui/dropdowns export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/dropdowns', {
  './listbox': ['Listbox', 'LISTBOX_DEFAULT_LOCALE_TEXT'],
  './select': ['Select', 'SELECT_DEFAULT_LOCALE_TEXT'],
  './combobox': ['Combobox', 'COMBOBOX_DEFAULT_LOCALE_TEXT'],
  './tree-select': ['TreeSelect', 'TREE_SELECT_DEFAULT_LOCALE_TEXT'],
  './mention': ['Mention', 'MENTION_DEFAULT_LOCALE_TEXT'],
});
