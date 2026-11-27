// Page-set math of the standalone `Pager` (`pager/Pager.tsx`): the Data
// Grid's `pageSet()` (`data-grid/Pager.tsx`) copied unchanged. The grid
// keeps its private copy: importing this module from the grid pager grew
// `@salmonui/data-grid` by 0.02 KB initial and 0.06 KB all chunks
// (gzip), and no Data Grid budget may grow. tests/pager.test.ts asserts both copies agree.

/** First and last page of the numeric button set that contains `page`. */
export function pageSet(page: number, pageCount: number, visible: number): { start: number; end: number } {
  const size = Math.max(1, Math.floor(visible));
  const start = Math.floor((page - 1) / size) * size + 1;
  return { start, end: Math.min(pageCount, start + size - 1) };
}
