// The pages of the example. Each page is its own HTML entry (Vite input) with
// its own client entry, so its initial JS and CSS carry only the families it
// renders (example app bundle budgets). The server picks
// the page from the query flag (`?pickers`, `?pivot`, `?kanban`, `?assistant`, `?dropdowns`, `?locale`); anything
// else is the Data Grid page.
export type PageName = 'grid' | 'pickers' | 'pivot' | 'kanban' | 'assistant' | 'dropdowns' | 'locale';

const FLAGGED: readonly Exclude<PageName, 'grid'>[] = ['pickers', 'pivot', 'kanban', 'assistant', 'dropdowns', 'locale'];

export function pageOf(url: string): PageName {
  const params = new URL(url, 'http://localhost').searchParams;
  return FLAGGED.find((name) => params.has(name)) ?? 'grid';
}

/** The HTML template of a page (relative to the example root, and to `dist/client` after the build). */
export function templateOf(page: PageName): string {
  return page === 'grid' ? 'index.html' : `${page}.html`;
}
