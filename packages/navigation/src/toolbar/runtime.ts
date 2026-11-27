// Toolbar measuring runtime (lazy chunk, loaded after mount when `overflow`
// is 'menu' or 'scroll'): the shared overflow measurer (`internal/overflow`
// `watchOverflow`, one ResizeObserver per document) and the scroll-button
// state of `overflow="scroll"`. Both run outside React render: the measurer
// reports a new hidden set only when the fit changes, and the scroll state is
// written as attributes on the toolbar (never React state). Kept out of the
// initial JS so `@salmonui/navigation/toolbar` fits its budget; the server and the
// first client paint render every item, as before any measurement.
//
// Multi-size items (`ToolbarItem sizes` with more than one entry) switch the
// toolbar to the stepping watcher of `./sizing.js`, a further lazy chunk
// loaded only then.

import { computeOverflow, observeResize, watchOverflow, type OverflowMode } from '../internal/overflow.js';
import type { ToolbarItemSize, watchSized } from './sizing.js';

export interface ToolbarWatcher {
  readonly measure: () => void;
  readonly stop: () => void;
}

const FIELD =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"]';

/** Form fields cannot be menu entries: they default to `overflow="never"`. */
const resolveMode = (item: HTMLElement): OverflowMode => (item.querySelector(FIELD) ? 'never' : 'auto');

/** The fit: hidden item keys and the stepped-down sizes (`Toolbar`'s state setter). */
export type ToolbarFit = readonly [ReadonlySet<string>, (ReadonlyMap<string, ToolbarItemSize> | undefined)?];

/**
 * `loadSizing` imports `./sizing.js`; it is passed in by `Toolbar` so every
 * dynamic import stays in the entry chunk (one bundler preload helper there).
 */
export function watchToolbar(bar: HTMLElement, menu: boolean, config: () => readonly [vertical: boolean, scrollStep: number], setFit: (fit: ToolbarFit) => void, loadSizing: () => Promise<{ watchSized: typeof watchSized }>): ToolbarWatcher {
  const content = bar.querySelector<HTMLElement>(':scope > [data-overflow-root]') as HTMLElement;
  const onHidden = (hidden: ReadonlySet<string>, sizes?: ReadonlyMap<string, ToolbarItemSize>): void => setFit([hidden, sizes]);
  if (menu) {
    const options = () => ({
      orientation: config()[0] ? ('vertical' as const) : ('horizontal' as const),
      resolveMode,
    });
    let watcher: ToolbarWatcher | null = null;
    let sized = false;
    let live = true;
    const start = (): void => {
      if (sized) return;
      if (!content.querySelector('[data-overflow-sizes]')) {
        watcher ??= watchOverflow(content, options, onHidden);
        return;
      }
      sized = true;
      if (watcher) {
        // Multi-size items appeared after mount: drop the plain fit until the stepping chunk measures.
        watcher.stop();
        watcher = null;
        onHidden(new Set());
      }
      void loadSizing().then((m) => {
        if (live) watcher = m.watchSized(content, options, onHidden, computeOverflow, observeResize);
      });
    };
    start();
    return {
      measure() {
        start();
        watcher?.measure();
        // Runs after every Toolbar commit: focus never stays on an item that just overflowed, it moves to the menu button.
        if (bar.ownerDocument.activeElement?.closest('.salmon-toolbar-item[hidden]')) content.querySelector<HTMLElement>('[data-overflow-trigger]')?.focus({ preventScroll: true });
      },
      stop() {
        live = false;
        watcher?.stop();
      },
    };
  }
  const measure = (): void => {
    const v = config()[0];
    const size = v ? content.scrollHeight - content.clientHeight : content.scrollWidth - content.clientWidth;
    const pos = Math.abs(v ? content.scrollTop : content.scrollLeft);
    const set = (name: string, on: boolean): void => {
      if (on !== bar.hasAttribute(name)) bar.toggleAttribute(name, on);
    };
    set('data-scrollable', size > 1);
    set('data-at-start', pos <= 1);
    set('data-at-end', pos >= size - 1);
  };
  // The scroll buttons (rendered by Toolbar, pointer only) move the content by `scrollStep`.
  const click = (event: MouseEvent): void => {
    const side = (event.target as Element).closest<HTMLElement>('[data-scroll]')?.dataset['scroll'];
    if (!side) return;
    const [v, step] = config();
    const delta = (side === 'forward' ? 1 : -1) * step;
    content.scrollBy(
      v
        ? { top: delta, behavior: 'smooth' }
        : {
            left: getComputedStyle(content).direction === 'rtl' ? -delta : delta,
            behavior: 'smooth',
          },
    );
  };
  measure();
  content.addEventListener('scroll', measure, { passive: true });
  bar.addEventListener('click', click);
  const off = observeResize(content, measure);
  return {
    measure,
    stop() {
      content.removeEventListener('scroll', measure);
      bar.removeEventListener('click', click);
      off();
    },
  };
}
