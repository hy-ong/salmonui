// zh-TW text of the @salmonui/navigation families (see ../zh-TW.ts).

export const pager = /* @__PURE__ */ Object.freeze({
  label: '分頁',
  firstPage: '第一頁',
  previousPage: '上一頁',
  nextPage: '下一頁',
  lastPage: '最後一頁',
  previousPages: '前幾頁',
  nextPages: '後幾頁',
  pageButton: '第 {page} 頁',
  pageLabel: '',
  pagerInfo: '第 {page} 頁，共 {pageCount} 頁',
  pagerInfoUnknown: '第 {page} 頁',
  pagerItems: '（共 {count} 筆）',
  pageSize: '每頁筆數',
  allItems: '全部',
});

export const breadcrumbs = /* @__PURE__ */ Object.freeze({
  label: '導覽路徑',
  ellipsis: '顯示隱藏的導覽路徑',
});

export const carousel = /* @__PURE__ */ Object.freeze({
  carousel: '輪播',
  slide: '投影片',
  slideLabel: (index: number, total: number, label?: string): string => (label ? `${label}，第 ${index} 張，共 ${total} 張` : `第 ${index} 張，共 ${total} 張`),
  previous: '上一張',
  next: '下一張',
  play: '開始自動播放',
  pause: '停止自動播放',
  indicators: '選擇要顯示的投影片',
  indicator: (index: number, _total: number, label?: string): string => (label ? `第 ${index} 張：${label}` : `第 ${index} 張`),
  fraction: (index: number, total: number): string => `${index} / ${total}`,
});

export const sidebarLayout = /* @__PURE__ */ Object.freeze({
  panel: '側邊欄',
  toggle: '展開/收合側邊欄',
  collapse: '收合側邊欄',
});

export const stepper = /* @__PURE__ */ Object.freeze({
  optional: '選填',
  invalid: '錯誤',
  completed: '已完成',
});

export const tabs = /* @__PURE__ */ Object.freeze({
  scrollBackward: '往回捲動索引標籤',
  scrollForward: '往後捲動索引標籤',
  moreTabs: '更多索引標籤',
  close: '關閉',
});

export const toolbar = /* @__PURE__ */ Object.freeze({
  more: '更多',
  scrollBack: '往回捲動',
  scrollForward: '往後捲動',
});

export const treeView = /* @__PURE__ */ Object.freeze({
  loading: '載入中…',
  loadError: '載入失敗',
  retry: '重試',
  rename: '重新命名 {label}',
  moved: '已移動 {label}',
});

export const sidebarMenu = /* @__PURE__ */ Object.freeze({
  label: '主選單',
});
