// Default static texts of TreeSelect: the shared dropdown texts
// plus the lazy-load status of a node.

import { DROPDOWN_DEFAULT_LOCALE_TEXT } from '../dropdown/locale.js';
import type { TreeSelectLocaleText } from './types.js';

export const TREE_SELECT_DEFAULT_LOCALE_TEXT: TreeSelectLocaleText = Object.freeze({
  ...DROPDOWN_DEFAULT_LOCALE_TEXT,
  loadingChildren: 'Loading…',
});
