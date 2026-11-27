// zh-TW text of the @salmonui/dropdowns families (see ../zh-TW.ts).

// Select and Combobox share the dropdown text (one object, two families).
const dropdown = /* @__PURE__ */ Object.freeze({
  noResults: '找不到結果',
  noData: '沒有選項',
  loading: '載入中…',
  loadError: '要求失敗',
  retry: '重試',
  selectAll: '全選',
  deselectAll: '取消全選',
  clear: '清除',
  removeValue: (label: string): string => `移除 ${label}`,
  selectedCount: (count: number): string => `已選取 ${count} 項`,
  moreValues: (count: number): string => `+${count}`,
  resultCount: (count: number): string => (count === 0 ? '沒有結果' : `${count} 筆結果`),
  limitReached: (max: number): string => `已達選取上限 ${max} 項`,
  search: '搜尋',
  close: '關閉',
  toggle: '顯示選項',
  selectedValues: '已選取的值',
  create: (text: string): string => `新增「${text}」`,
});

export const select = dropdown;

export const combobox = dropdown;

export const treeSelect = /* @__PURE__ */ Object.freeze({
  ...dropdown,
  loadingChildren: '載入中…',
});

export const listbox = /* @__PURE__ */ Object.freeze({
  noData: '沒有項目',
  noResults: '找不到相符的項目',
  loading: '載入中…',
  loadError: '無法載入項目',
  retry: '重試',
  searchLabel: '搜尋',
  selectAll: '全選',
  resultCount: /* @__PURE__ */ Object.freeze({ zero: '沒有結果', other: '{count} 筆結果' }),
  selectionLimit: '已達選取上限 {max} 項',
  moved: '{label} 已移至第 {position} 個位置，共 {count} 個',
});

export const mention = /* @__PURE__ */ Object.freeze({
  listLabel: '建議',
  noResults: '沒有結果',
  loading: '載入中…',
  loadError: '無法載入建議',
});
