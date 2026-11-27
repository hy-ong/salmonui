import { expect, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Shared helpers of the PdfViewer specs (page: examples/vite-spa/src/pdf-viewer.tsx).

export interface PdfvLog {
  loads: { pageCount: number; title: string | null; outline: string[]; formFields: string[] }[];
  errors: string[];
  pages: { page: number; source: string }[];
  zooms: { zoom: number | string; scale: number; source: string }[];
  links: { url: string | null; page: number | null }[];
  prints: { images: number; sizes: string[] }[];
  beforePrint: number;
  searches: { query: string; total: number; current: number; page: number }[];
  annotations: { reason: string; kind: string; page: number; count: number }[];
  forms: { name: string; values: Record<string, unknown> }[];
  passwords: string[];
  sidebars: (string | null)[];
  custom: number;
}

export const pdfvUrl = (query = ''): string => `${DEV_URL}pdf-viewer.html${query ? `?${query}` : ''}`;
export const viewer = (page: Page) => page.locator('.salmon-pdf-viewer');
export const viewport = (page: Page) => page.locator('.salmon-pdf-viewer__viewport');
export const pages = (page: Page) => page.locator('.salmon-pdf-viewer__page');
export const pageEl = (page: Page, n: number) => page.locator(`.salmon-pdf-viewer__page[data-page-number="${n}"]`);
export const item = (page: Page, id: string) => page.locator(`.salmon-pdf-viewer__toolbar [data-item-id="${id}"]`);
export const log = (page: Page): Promise<PdfvLog> => page.evaluate(() => (window as unknown as { __pdfv: PdfvLog }).__pdfv);

/** Opens the page and waits until the document is loaded and page 1 is painted. */
export async function openPdf(page: Page, query = '', { wait = true } = {}): Promise<void> {
  await page.goto(pdfvUrl(query));
  if (!wait) return;
  await expect.poll(async () => (await log(page)).loads.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.locator('.salmon-pdf-viewer__page[data-page-number="1"] canvas')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('.salmon-pdf-viewer__page[data-page-number="1"] .salmon-pdf-viewer__text-layer span').first()).toBeAttached();
}

/** Runs `actionsRef.current.<method>(...args)` in the page. */
export function act<T = unknown>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([m, a]) => {
      const actions = (window as unknown as { __pdfvActions: Record<string, (...x: unknown[]) => unknown> }).__pdfvActions;
      return actions[m as string]!(...(a as unknown[])) as never;
    },
    [method, args] as const,
  );
}

/** Selects the text of the text-layer span that contains `text` (whole span, or `[from, to)`). */
export async function selectText(page: Page, text: string, from?: number, to?: number): Promise<void> {
  await page.evaluate(
    ([t, a, b]) => {
      const span = [...document.querySelectorAll('.salmon-pdf-viewer__text-layer span')].find((s) => s.textContent?.includes(t as string));
      if (!span?.firstChild) throw new Error(`no span with ${t}`);
      const node = span.firstChild;
      const start = (a as number | null) ?? (node.textContent ?? '').indexOf(t as string);
      const end = (b as number | null) ?? start + (t as string).length;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    },
    [text, from ?? null, to ?? null] as const,
  );
}

export const scrollTo = (page: Page, top: number, left = 0) =>
  page.evaluate(([t, l]) => {
    const el = document.querySelector('.salmon-pdf-viewer__viewport') as HTMLElement;
    el.scrollTop = t as number;
    el.scrollLeft = l as number;
  }, [top, left] as const);
