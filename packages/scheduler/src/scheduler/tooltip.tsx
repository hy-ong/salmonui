'use client';

// Event tooltip chunk: one public `Tooltip`
// (`@salmonui/overlays/tooltip`), controlled and anchored at the hovered or
// keyboard-focused event. Delegated native listeners on the Scheduler root
// (pointerover / pointerout / focusin / focusout / pointerdown) pick the
// event; the open and close delays are timers in a per-instance box, never
// React state. React state changes only when the tooltip opens, moves to
// another event or closes. Lazy: loaded when the browser is idle after
// mount. The tooltip's rules are `tooltip/styles.css`.

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { themeScopeOf } from '@salmonui/core/internal/overlay';
import type { Occurrence } from '../internal/scheduler/types.js';
import { Tooltip, type TooltipContentProps } from '@salmonui/overlays/tooltip';
import type { SchedulerContextValue } from './context.js';
import type { SchedulerBeforeTooltipOpenEvent, SchedulerEventInfo, SchedulerTooltipContext } from './types.js';

/** Hover open delay and close delay in ms. */
const OPEN_MS = 400;
const CLOSE_MS = 100;
const EVENT = '.salmon-scheduler__event[data-key]';

interface Shown {
  readonly el: HTMLElement;
  readonly ctx: SchedulerTooltipContext<unknown>;
  readonly occ: Occurrence<unknown>;
  readonly scope: Element | null;
}

/** Hands the event element to the Tooltip as its trigger and points its `aria-describedby` at the open tooltip; renders nothing. */
function Anchor(props: { readonly el: HTMLElement; readonly set: (el: HTMLElement | null) => void; readonly describedBy: string | undefined }): ReactNode {
  const { el, describedBy } = props;
  useLayoutEffect(() => props.set(el));
  useLayoutEffect(() => {
    if (!describedBy) return;
    const before = el.getAttribute('aria-describedby');
    el.setAttribute('aria-describedby', before ? `${before} ${describedBy}` : describedBy);
    return () => {
      if (before) el.setAttribute('aria-describedby', before);
      else el.removeAttribute('aria-describedby');
    };
  }, [el, describedBy]);
  return null;
}

export function SchedulerTooltip(props: {
  readonly ctx: SchedulerContextValue;
  readonly find: (key: string) => Occurrence<unknown> | null;
  readonly info: (o: Occurrence<unknown>) => SchedulerEventInfo<unknown>;
  /** Receives the close function (`api.closeTooltip`). */
  readonly closer: { current: (() => void) | null };
}) {
  const { root, props: p, fmt, t } = props.ctx;
  const [shown, setShown] = useState<Shown | null>(null);
  // Timers and the pending element: transients in a per-instance box.
  const [box] = useState(() => ({ timer: 0 as ReturnType<typeof setTimeout> | 0, shown: null as Shown | null, latest: { p, props } }));
  useLayoutEffect(() => {
    box.shown = shown;
    box.latest = { p, props };
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const clear = (): void => {
      if (box.timer) clearTimeout(box.timer);
      box.timer = 0;
    };
    const hide = (): void => {
      clear();
      if (box.shown) setShown(null);
    };
    const show = (target: HTMLElement, source: 'pointer' | 'keyboard'): void => {
      clear();
      const { p: cur, props: own } = box.latest;
      if (!cur.tooltip || target === box.shown?.el) return;
      const occ = own.find(target.getAttribute('data-key') as string);
      if (!occ) return hide();
      const ctx: SchedulerTooltipContext<unknown> = { occurrence: own.info(occ), row: occ.event.row, element: target };
      if (cur.onBeforeTooltipOpen) {
        let prevented = false;
        const e: SchedulerBeforeTooltipOpenEvent<unknown> = {
          type: 'beforeTooltipOpen',
          source,
          ...ctx,
          get defaultPrevented() {
            return prevented;
          },
          preventDefault() {
            prevented = true;
          },
        };
        cur.onBeforeTooltipOpen(e);
        if (prevented) return hide();
      }
      setShown({ el: target, ctx, occ, scope: themeScopeOf(target) ?? null });
    };
    const eventOf = (node: EventTarget | null): HTMLElement | null => (node instanceof Element ? node.closest<HTMLElement>(EVENT) : null);
    const onOver = (e: PointerEvent): void => {
      if (e.pointerType === 'touch' || e.buttons) return;
      const target = eventOf(e.target);
      if (!target) return;
      if (target === box.shown?.el) return clear();
      clear();
      box.timer = setTimeout(() => show(target, 'pointer'), box.shown ? 0 : OPEN_MS);
    };
    const onOut = (e: PointerEvent): void => {
      const from = eventOf(e.target);
      const to = e.relatedTarget as Element | null;
      if (!from || eventOf(to) === from || to?.closest?.('.salmon-tooltip')) return;
      clear();
      box.timer = setTimeout(hide, CLOSE_MS);
    };
    const onFocusIn = (e: FocusEvent): void => {
      const target = eventOf(e.target);
      if (target && target === e.target && target.matches(':focus-visible')) show(target, 'keyboard');
    };
    const onFocusOut = (e: FocusEvent): void => {
      if (eventOf(e.target) && eventOf(e.relatedTarget) !== eventOf(e.target)) hide();
    };
    el.addEventListener('pointerover', onOver);
    el.addEventListener('pointerout', onOut);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    el.addEventListener('pointerdown', hide);
    props.closer.current = hide;
    // An event hovered before this chunk loaded gets its tooltip now.
    const hovered = el.querySelector<HTMLElement>(`${EVENT}:hover`);
    if (hovered) box.timer = setTimeout(() => show(hovered, 'pointer'), OPEN_MS);
    return () => {
      clear();
      el.removeEventListener('pointerover', onOver);
      el.removeEventListener('pointerout', onOut);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      el.removeEventListener('pointerdown', hide);
      props.closer.current = null;
    };
    // Bound once per root; the latest props are read from the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, box]);

  if (!shown) return null;
  const cfg = typeof p.tooltip === 'object' ? p.tooltip : {};
  const o = shown.occ;
  const content = cfg.render ? (
    cfg.render(shown.ctx)
  ) : (
    <span className="salmon-scheduler__tooltip" style={{ display: 'grid' }}>
      <strong>{o.event.title || t('noTitle')}</strong>
      <span>{fmt.range(o)}</span>
      {o.event.location ? <span>{o.event.location}</span> : null}
    </span>
  );
  return (
    <Tooltip
      open
      onOpenChange={(next) => {
        if (!next) setShown(null);
      }}
      content={content}
      contentProps={{ dir: p.dir } as TooltipContentProps}
      container={shown.scope}
      placement="top"
      render={(tp) => <Anchor el={shown.el} set={tp.ref} describedBy={tp['aria-describedby']} />}
    />
  );
}
