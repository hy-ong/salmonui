// Bundlers replace `process.env.NODE_ENV` textually, so production builds
// fold `DEV` to `false` and drop every development-only branch (warnings,
// event freezing, dev checks). The read is a plain expression on purpose: a
// try/catch or a function call keeps the minifier from folding it, which
// shipped all development code in production bundles. React itself requires
// the same replacement, so every environment that runs this package (a
// bundler, or Node for server rendering) provides it.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** @internal Development build flag. */
export const DEV: boolean = process.env.NODE_ENV !== 'production';

const warned = new Set<string>();

/** @internal Logs a development warning once per key. Call from effects or event handlers only. */
export function warnOnce(key: string, message: string): void {
  if (!DEV || warned.has(key)) return;
  warned.add(key);
  globalThis.console?.warn?.(`[salmonui] ${message}`);
}

/** @internal The package version this copy of @salmonui/core was built as (kept in step with package.json by the release). */
export const CORE_VERSION = '0.2.0';

// Duplicate-core guard:
// every @salmonui/* package must resolve to one @salmonui/core, or the
// shared stores (modal host, toast queue, theme) split in two. The first
// copy to load registers itself on a global symbol; any later copy warns.
// Development only: production folds `DEV` to false and drops the block.
const CORE_COPY = Symbol.for('salmonui.core.copies');
if (DEV) {
  const registry = globalThis as { [CORE_COPY]?: string[] };
  const copies = (registry[CORE_COPY] ??= []);
  copies.push(CORE_VERSION);
  if (copies.length > 1) {
    globalThis.console?.warn?.(`[salmonui] ${copies.length} copies of @salmonui/core are loaded (${copies.join(', ')}). Every @salmonui/* package must resolve to the same version; deduplicate the installation (npm dedupe) so one copy remains.`);
  }
}

// Missing-stylesheet warning: each family
// entry registers the public specifier of its stylesheet and a class prefix
// its rules select. After the page has loaded, and again while the DOM
// changes, development builds look for a rendered element with that class
// prefix; when one exists and no loaded stylesheet has a rule for the prefix,
// they warn once for that family and stop watching it. Production folds `DEV`
// to false, so neither the call sites nor this code ship. Stylesheets whose
// rules cannot be read (another origin) suppress the warning. Structural
// types: core compiles without the DOM lib.
interface StyleRuleLike {
  readonly selectorText?: string;
  readonly cssRules?: ArrayLike<StyleRuleLike>;
}
interface DocumentLike {
  readonly readyState: string;
  readonly styleSheets: ArrayLike<{ readonly cssRules: ArrayLike<StyleRuleLike> }>;
  readonly documentElement: unknown;
  querySelector(selector: string): unknown;
  addEventListener(type: string, listener: () => void): void;
}
interface MutationObserverLike {
  observe(target: unknown, options: { childList: boolean; subtree: boolean }): void;
  disconnect(): void;
}
type Timers = { setTimeout(callback: () => void, ms: number): unknown };

const expectedStylesheets = new Map<string, string>();
let stylesheetTimer: unknown = null;
let stylesheetObserver: MutationObserverLike | null = null;
let stylesheetWatch = false;

const documentOf = (): DocumentLike | undefined => (globalThis as { document?: DocumentLike }).document;

/** Every selector of the loaded stylesheets, or null when one cannot be read. */
function selectorTexts(doc: DocumentLike): string[] | null {
  const out: string[] = [];
  const walk = (rules: ArrayLike<StyleRuleLike>) => {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]!;
      if (rule.selectorText) out.push(rule.selectorText);
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  try {
    for (let i = 0; i < doc.styleSheets.length; i++) walk(doc.styleSheets[i]!.cssRules);
  } catch {
    return null;
  }
  return out;
}

function checkStylesheets(): void {
  stylesheetTimer = null;
  const doc = documentOf();
  if (!doc) return;
  let selectors: string[] | null | undefined;
  for (const [specifier, prefix] of expectedStylesheets) {
    if (!doc.querySelector(`[class^="${prefix}"], [class*=" ${prefix}"]`)) continue;
    expectedStylesheets.delete(specifier);
    selectors ??= selectorTexts(doc);
    if (selectors !== null && !selectors.some((s) => s.includes(`.${prefix}`))) {
      warnOnce(`stylesheet:${specifier}`, `${specifier} renders without its stylesheet. Import '${specifier}/styles.css' once, after '@salmonui/core/styles.css'; it carries the rules of every family it renders.`);
    }
  }
  if (expectedStylesheets.size === 0 && stylesheetObserver) {
    stylesheetObserver.disconnect();
    stylesheetObserver = null;
    stylesheetWatch = false;
  }
}

function scheduleStylesheetCheck(): void {
  if (stylesheetTimer !== null) return;
  // The delay lets stylesheets requested with the same chunk finish loading, and batches DOM changes.
  stylesheetTimer = (globalThis as unknown as Timers).setTimeout(checkStylesheets, 500);
  (stylesheetTimer as { unref?: () => void }).unref?.();
}

function watchStylesheets(doc: DocumentLike): void {
  scheduleStylesheetCheck();
  const Observer = (globalThis as { MutationObserver?: new (callback: () => void) => MutationObserverLike }).MutationObserver;
  if (Observer && !stylesheetObserver) {
    stylesheetObserver = new Observer(scheduleStylesheetCheck);
    stylesheetObserver.observe(doc.documentElement, { childList: true, subtree: true });
  }
}

/**
 * @internal Development: warns once when the family behind `specifier`
 * renders (an element with `classPrefix`) and no loaded stylesheet selects
 * `classPrefix`. Call at module level of a family entry behind a textual
 * `process.env.NODE_ENV !== 'production'` test (folded even across chunks).
 */
export function expectStylesheet(specifier: string, classPrefix: string): void {
  const doc = documentOf();
  if (!DEV || !doc || expectedStylesheets.has(specifier)) return;
  expectedStylesheets.set(specifier, classPrefix);
  if (stylesheetWatch) return scheduleStylesheetCheck();
  stylesheetWatch = true;
  if (doc.readyState === 'complete') watchStylesheets(doc);
  else doc.addEventListener('readystatechange', () => doc.readyState === 'complete' && watchStylesheets(doc));
}
