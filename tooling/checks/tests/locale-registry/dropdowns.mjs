// Locale families of @salmonui/dropdowns (see ../locale-coverage.test.mjs).
// Select and Combobox share their English defaults but are separate families.
export default {
  listbox: { defaults: [{ module: 'packages/dropdowns/dist/listbox/locale.js', export: 'LISTBOX_DEFAULT_LOCALE_TEXT' }] },
  select: { defaults: [{ module: 'packages/dropdowns/dist/dropdown/locale.js', export: 'DROPDOWN_DEFAULT_LOCALE_TEXT' }] },
  combobox: { defaults: [{ module: 'packages/dropdowns/dist/dropdown/locale.js', export: 'DROPDOWN_DEFAULT_LOCALE_TEXT' }] },
  treeSelect: { defaults: [{ module: 'packages/dropdowns/dist/tree-select/locale.js', export: 'TREE_SELECT_DEFAULT_LOCALE_TEXT' }] },
  mention: { defaults: [{ module: 'packages/dropdowns/dist/mention/Mention.js', export: 'MENTION_DEFAULT_LOCALE_TEXT' }] },
};
