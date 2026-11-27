import { expect, type Page } from '@playwright/test';

// Same port scheme as playwright.config.ts (SALMON_UI_PORT_BASE).
const base = Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730);
export const DEV_URL = `http://localhost:${base}/`;
export const PROD_URL = `http://localhost:${base + 10}/`;
export const SSR_URL = `http://localhost:${base + 20}/`;

export interface CommitRecord {
  phase: string;
  cells: string[];
  rows: string[];
  headers: string[];
}

declare global {
  interface Window {
    __commits: CommitRecord[];
    __SALMON_UI_DEVTOOLS__?: { onCommit(commit: { phase: string; cells: readonly string[]; rows: readonly string[]; headers: readonly string[] }): void };
    __gridApi?: any;
    __mountMs?: number;
    __hydrated?: boolean;
  }
}

/** Installs the dev instrumentation hook before any page script runs. */
export async function installDevtools(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__commits = [];
    window.__SALMON_UI_DEVTOOLS__ = {
      onCommit(commit) {
        window.__commits.push({ phase: commit.phase, cells: [...commit.cells], rows: [...commit.rows], headers: [...commit.headers] });
      },
    };
  });
}

/** Collects console warnings/errors and page errors (zero allowed). */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

/**
 * Waits until no grid on the page is pending (render feature placeholder): a
 * grid whose props turn on a render feature shows `[data-salmon-pending]`
 * until its feature chunk arrives on a client-only render.
 */
export async function waitForGridReady(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('[data-salmon-pending]') === null && document.querySelector('[role="grid"]') !== null);
}

export async function openGrid(page: Page, url: string): Promise<void> {
  trackModules(page);
  await page.goto(url);
  await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
  await waitForGridReady(page);
}

/** Sets the viewport scroll offset and waits for the scroll event plus two frames. */
export async function scrollViewport(page: Page, top: number | null, left: number | null): Promise<void> {
  await page.evaluate(
    ([t, l]) =>
      new Promise<void>((resolve) => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        if (t !== null) vp.scrollTop = t;
        if (l !== null) vp.scrollLeft = l;
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    [top, left] as const,
  );
}

/** Placeholders in server HTML: `[data-salmon-pending]` elements without `role="grid"`. */
export function placeholdersIn(html: string): number {
  return [...html.matchAll(/<div[^>]*data-salmon-pending[^>]*>/g)].filter((m) => !m[0].includes('role="grid"')).length;
}

export const bodyCellCount = (page: Page) => page.evaluate(() => document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-cell').length);

// Lazy chunks: many components load their interaction code (drag, tree keys,
// outside press, search index, ...) with a dynamic `import()` after mount.
// Under parallel load that chunk can arrive after the test already pressed a
// key or started a drag, so tests wait for the chunk itself.
const scriptUrls = new WeakMap<Page, string[]>();

/** Records the URL of every script the page loads; call before `page.goto` so `waitForModule` sees the lazy chunks. */
export function trackModules(page: Page): void {
  if (scriptUrls.has(page)) return;
  const urls: string[] = [];
  scriptUrls.set(page, urls);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) urls.length = 0;
  });
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script' && response.frame() === page.mainFrame()) urls.push(response.url());
  });
}

/**
 * Waits until the lazily imported module whose URL matches `pattern` (one the
 * page requested itself) has been evaluated: importing the same URL resolves
 * only after it ran, and after the component's own `import().then` (it
 * subscribed first). Two animation frames follow, so a React update that
 * callback scheduled (a `setState` with the module) has committed.
 */
export async function waitForModule(page: Page, pattern: RegExp): Promise<void> {
  const urls = scriptUrls.get(page);
  if (!urls) throw new Error('waitForModule: call trackModules(page) before page.goto');
  let url: string | undefined;
  await expect.poll(() => (url = urls.find((u) => pattern.test(u))) !== undefined, { message: `lazy module ${pattern} requested` }).toBe(true);
  await page.evaluate(async (u) => {
    await import(u);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, url!);
}

/**
 * Init script (call before `page.goto`): counts `addEventListener` calls per
 * target and type (`type`, or `type:capture`), so a test can wait until a
 * behavior that attaches its listener late (after a lazy chunk, in a passive
 * effect) is live. Read the counts with `listenerCount`.
 */
const listenerPages = new WeakSet<Page>();
export async function trackListeners(page: Page): Promise<void> {
  if (listenerPages.has(page)) return;
  listenerPages.add(page);
  await page.addInitScript(() => {
    const counts = new WeakMap<EventTarget, Map<string, number>>();
    (window as unknown as { __listenerCounts: typeof counts }).__listenerCounts = counts;
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      const key = capture ? `${type}:capture` : type;
      let map = counts.get(this);
      if (!map) counts.set(this, (map = new Map()));
      map.set(key, (map.get(key) ?? 0) + 1);
      return add.call(this, type, listener, options);
    };
  });
}

/** How many `type` listeners (`type:capture` for capture ones) were added to `window`, `document` or the first element matching `selector`. */
export function listenerCount(page: Page, selector: string, type: string): Promise<number> {
  return page.evaluate(
    ([s, t]) => {
      const counts = (window as unknown as { __listenerCounts?: WeakMap<EventTarget, Map<string, number>> }).__listenerCounts;
      if (!counts) throw new Error('listenerCount: call trackListeners(page) before page.goto');
      const target = s === 'window' ? window : s === 'document' ? document : document.querySelector(s);
      return target ? (counts.get(target)?.get(t) ?? 0) : 0;
    },
    [selector, type] as const,
  );
}
