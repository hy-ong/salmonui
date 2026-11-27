// Lazy reorder chunk: loaded on the first pointer press on a
// reorderable tab or the first Alt+Arrow. The drag preview is written as
// `transform` on the tab elements (no React state per pointer move); the
// drop fires `onBeforeReorder` / `onReorder` and the application moves the
// `Tab`. No shared `internal/dnd` module existed when Tabs shipped, so this
// one-dimensional strip reorder stays local.

import type { TabsActions } from './context.js';

// Self-contained (no runtime import of ./context.js) so the Tabs initial JS stays one chunk.
const tabsOf = (list: Element): HTMLElement[] => Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
const rtlOf = (el: Element): boolean => el.ownerDocument.defaultView?.getComputedStyle(el).direction === 'rtl';

const THRESHOLD = 5;

// Restores focus to the moved tab only when the move dropped it (the DOM move or a
// remount leaves focus on the body); focus the user has moved since is left alone.
function refocus(list: Element, value: string): void {
  const doc = list.ownerDocument;
  doc.defaultView?.requestAnimationFrame(() => {
    const active = doc.activeElement;
    if (active && active !== doc.body) return;
    list.querySelector<HTMLElement>(`[role="tab"][data-value="${CSS.escape(value)}"]`)?.focus();
  });
}

/** Alt+Arrow: moves the focused tab one visible position. */
export function moveByKey(actions: TabsActions, list: Element, tab: HTMLElement, step: 1 | -1): void {
  const tabs = tabsOf(list);
  const from = tabs.indexOf(tab);
  let to = from + step;
  while (tabs[to]?.hidden) to += step;
  if (to < 0 || to >= tabs.length) return;
  const value = tab.dataset['value']!;
  if (actions.reorder(value, from, to, 'keyboard')) refocus(list, value);
}

/** Pointer drag of `tab` from the press `down`; `gesture.ended` when it was released before this chunk loaded. */
export function startDrag(actions: TabsActions, tab: HTMLElement, down: PointerEvent, gesture: { readonly ended: boolean }): void {
  const list = tab.closest('[role="tablist"]');
  const doc = tab.ownerDocument;
  const win = doc.defaultView;
  if (gesture.ended || !list || !win) return;
  const vertical = list.getAttribute('aria-orientation') === 'vertical';
  const rtl = !vertical && rtlOf(list);
  const axis = (e: PointerEvent): number => (vertical ? e.clientY : e.clientX);
  const fn = vertical ? 'translateY' : 'translateX';
  const start = axis(down);
  let tabs: HTMLElement[] = [];
  let mids: number[] = [];
  let size = 0;
  let from = -1;
  let to = -1;

  const stop = (): void => {
    doc.removeEventListener('pointermove', onMove, true);
    doc.removeEventListener('pointerup', onUp, true);
    doc.removeEventListener('pointercancel', onCancel, true);
    doc.removeEventListener('keydown', onKey, true);
    for (const t of tabs) t.style.transform = '';
    tab.removeAttribute('data-dragging');
    list.removeAttribute('data-reordering');
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== down.pointerId) return;
    const d = axis(e) - start;
    if (from < 0) {
      if (Math.abs(d) < THRESHOLD) return;
      // Read phase once per drag: the visible tabs and their midpoints.
      tabs = tabsOf(list).filter((t) => !t.hidden);
      const rects = tabs.map((t) => t.getBoundingClientRect());
      mids = rects.map((r) => (vertical ? r.top + r.height / 2 : r.left + r.width / 2));
      from = to = tabs.indexOf(tab);
      const r = rects[from]!;
      size = vertical ? r.height : r.width;
      tab.setAttribute('data-dragging', '');
      list.setAttribute('data-reordering', '');
    }
    e.preventDefault();
    tab.style.transform = `${fn}(${d}px)`;
    const center = mids[from]! + d;
    let next = from;
    for (let i = 0; i < tabs.length; i++) {
      if (i === from) continue;
      const after = i > from;
      const m = mids[i]!;
      const passed = after !== rtl ? center > m : center < m;
      // Passed tabs slide into the slot the dragged tab left.
      const shift = passed ? (after ? -1 : 1) * (rtl ? -1 : 1) : 0;
      tabs[i]!.style.transform = shift ? `${fn}(${shift * size}px)` : '';
      if (passed) next = after ? Math.max(next, i) : Math.min(next, i);
    }
    to = next;
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== down.pointerId) return;
    const target = from >= 0 ? tabs[to] : undefined;
    stop();
    if (!target) return;
    // The release would click (select) the dragged tab: swallow that click.
    const swallow = (c: Event): void => {
      c.stopPropagation();
      c.preventDefault();
    };
    win.addEventListener('click', swallow, { capture: true, once: true });
    win.setTimeout(() => win.removeEventListener('click', swallow, true), 0);
    const all = tabsOf(list);
    const value = tab.dataset['value']!;
    if (actions.reorder(value, all.indexOf(tab), all.indexOf(target), e.pointerType === 'touch' ? 'touch' : 'pointer') && doc.activeElement === tab) refocus(list, value);
  };
  const onCancel = (e: PointerEvent): void => {
    if (e.pointerId === down.pointerId) stop();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || from < 0) return;
    e.preventDefault();
    e.stopPropagation();
    stop();
  };
  doc.addEventListener('pointermove', onMove, true);
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', onCancel, true);
  doc.addEventListener('keydown', onKey, true);
}
