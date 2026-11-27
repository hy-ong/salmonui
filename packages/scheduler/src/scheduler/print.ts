// Scheduler print, a lazy chunk loaded by the first
// `api.print()`. Mirrors the Data Grid (`data-grid/output-impl.ts`
// `printGrid`): `onBeforePrint` (cancellable), a print-only container in the
// body, `window.print()`, and `onAfterPrint` with the cleanup on the window's
// `afterprint`. The Scheduler prints what it renders: a copy of the root, sized by `height` / `width` (default
// `auto`: the scroll containers grow to their content), inside a shallow copy
// of its theme scope so the theme colors apply. The page hides everything
// else while `html[data-salmon-scheduler-printing]` is set (scheduler.css).

import type { SchedulerAfterPrintEvent, SchedulerBeforePrintEvent, SchedulerPrintOptions, SchedulerProps } from './types.js';

const ATTR = 'data-salmon-scheduler-printing';
const size = (v: number | string | undefined): string => (v === undefined ? 'auto' : typeof v === 'number' ? `${v}px` : v);
let cleanup: (() => void) | null = null;

export function printScheduler(root: HTMLElement | null, props: SchedulerProps<never>, options: SchedulerPrintOptions): boolean {
  const doc = root?.ownerDocument;
  const win = doc?.defaultView;
  if (!root || !doc || !win) return false;
  if (props.onBeforePrint) {
    let prevented = false;
    const event: SchedulerBeforePrintEvent = {
      type: 'beforePrint',
      source: 'api',
      options,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    };
    props.onBeforePrint(event);
    if (prevented) return false;
  }
  cleanup?.();
  const box = doc.createElement('div');
  box.className = 'salmon-scheduler-print';
  if (options.height === undefined) box.setAttribute('data-fit', '');
  const clone = root.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.style.blockSize = size(options.height);
  clone.style.inlineSize = size(options.width);
  const scope = root.parentElement?.closest('.salmon-theme-scope');
  const host = scope ? (scope.cloneNode(false) as HTMLElement) : box;
  host.removeAttribute('id');
  host.append(clone);
  if (host !== box) box.append(host);
  doc.body.append(box);
  const html = doc.documentElement;
  html.setAttribute(ATTR, '');
  let done = false;
  const end = (): void => {
    if (done) return;
    done = true;
    win.removeEventListener('afterprint', end);
    box.remove();
    html.removeAttribute(ATTR);
    if (cleanup === end) cleanup = null;
    const after: SchedulerAfterPrintEvent = { type: 'afterPrint', source: 'api', options };
    props.onAfterPrint?.(after);
  };
  cleanup = end;
  win.addEventListener('afterprint', end);
  win.print();
  // Without `afterprint` support the blocking `print()` has returned: clean up now.
  if (!('onafterprint' in win)) end();
  return true;
}
