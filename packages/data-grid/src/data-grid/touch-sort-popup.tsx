'use client';

// Touch multi-sort popup, part of the lazy overlay chunk
// (`overlays.tsx`); its state is `chrome.touchSort`, set by the header tap.
// Touch sorting: a header tap that sorts shows a popup
// by the header; tapping its toggle turns multi-sort on, so later header
// taps add columns to the sort; tapping the toggle again turns it off. The
// popup follows the last tapped header and stays open across header taps;
// it hides on a press anywhere else (body, outside the grid), on Escape,
// and when its header leaves the rendered columns. Hiding turns the toggle
// off. No timeout: the toggle must stay usable while the user picks the
// next column.

import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDataGridRender } from './context.js';
import type { DataGridInstance } from './instance.js';
import { placeBox } from './popover.js';
import type { TouchSortState } from './chrome.js';
import { modalHostOf, portalScopeOf } from '@salmonui/core/internal/modal-host';

function headerCell(root: HTMLElement, columnId: string): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('.salmon-data-grid-header-cell[data-column-id]')) {
    if (el.dataset['columnId'] === columnId) return el;
  }
  return null;
}

export function TouchSortPopup({ instance, state }: { instance: DataGridInstance<unknown>; state: TouchSortState }) {
  const render = useDataGridRender<unknown>();
  const ref = useRef<HTMLDivElement>(null);
  const root = instance.root;
  const chrome = instance.chrome;
  const columnId = state.columnId;

  // Position by the header cell (read, then one write), again on scroll and resize.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !root) return;
    // Inside an open modal dialog: the top layer, above the dialog (popover.tsx).
    if (el.showPopover && modalHostOf(el.parentElement)) {
      el.popover = 'manual';
      el.showPopover();
    }
    const win = root.ownerDocument.defaultView;
    const place = (): void => {
      const cell = headerCell(root, columnId);
      if (!cell) {
        chrome.setTouchSort(null);
        return;
      }
      const r = cell.getBoundingClientRect();
      const { x, y } = placeBox(
        { left: r.left, top: r.top, width: r.width, height: r.height },
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: win?.innerWidth ?? 0, height: win?.innerHeight ?? 0 },
        instance.rtl,
      );
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.dataset['placed'] = '';
    };
    place();
    win?.addEventListener('scroll', place, true);
    win?.addEventListener('resize', place);
    return () => {
      win?.removeEventListener('scroll', place, true);
      win?.removeEventListener('resize', place);
    };
  }, [root, columnId, chrome, instance]);

  // A press outside the popup and the grid's header cells, or Escape, hides it.
  useEffect(() => {
    if (!root) return;
    const doc = root.ownerDocument;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (!target || ref.current?.contains(target)) return;
      if (root.contains(target) && target.closest('.salmon-data-grid-header-cell[data-column-id]')) return;
      chrome.setTouchSort(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') chrome.setTouchSort(null);
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown, true);
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown, true);
    };
  }, [root, chrome]);

  if (!root) return null;
  const container = portalScopeOf(root);
  return createPortal(
    <div ref={ref} className="salmon-data-grid-touch-sort" data-grid-id={instance.gridId} dir={instance.rtl ? 'rtl' : 'ltr'}>
      <button
        type="button"
        className="salmon-data-grid-touch-sort__toggle"
        aria-pressed={state.multi}
        data-active={state.multi ? '' : undefined}
        onClick={() => chrome.setTouchSort({ columnId, multi: !state.multi })}
      >
        {render.text('touchMultiSort')}
      </button>
    </div>,
    container,
  );
}
