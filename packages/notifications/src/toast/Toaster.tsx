'use client';

// Toaster: the labelled
// region that renders a toast queue. The server HTML is the empty region
// with its live regions, so toasts inserted after hydration are announced.
// State lives in the queue store (internal/toast-queue.ts), read with
// `useSyncExternalStore`; pause and resume (hover, focus, hidden document)
// call the store and toggle `data-paused` on the region directly, so timers
// and the CSS countdown never cause a React render.
import { createContext, use, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type HTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { announce } from '@salmonui/core/internal/live-region';
import { createToastQueue, durationOf, type ToastQueue, type ToastState, type ToastTone } from '../internal/toast-queue.js';

/** Where the region sits; logical, so `Start` / `End` follow `dir`. */
export type ToastPlacement = 'topStart' | 'top' | 'topEnd' | 'bottomStart' | 'bottom' | 'bottomEnd';

/** Strings of `Toaster`. */
export interface ToasterLocaleText {
  /** Accessible name of the region landmark. Default `"Notifications"`. */
  notifications: string;
  /** Accessible name of the close buttons. Default `"Dismiss"`. */
  dismiss: string;
}

export interface ToasterProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'popover'> {
  /** The queue to render. Default: a queue the `Toaster` creates, reached with `useToast()`. */
  queue?: ToastQueue | undefined;
  /** Region position. Default `'bottomEnd'`. */
  placement?: ToastPlacement | undefined;
  /** Newest toast first in the stack. Default `true`. */
  newestOnTop?: boolean | undefined;
  /** Visible toasts; the rest wait in the queue. Default 5. */
  max?: number | undefined;
  /**
   * Renders the region inside this element (scoped, absolutely positioned;
   * give it `position: relative`) instead of the top layer. `null` renders
   * nothing until the element exists.
   */
  container?: Element | null | undefined;
  /** F6 moves focus into the region and back. Default `true`. */
  hotkey?: boolean | undefined;
  /** Overrides of the built-in strings. */
  localeText?: Partial<ToasterLocaleText> | undefined;
  /** Content that can call `useToast()` to reach this queue. */
  children?: ReactNode;
  /** The region element. */
  ref?: Ref<HTMLElement> | undefined;
}

const ToastContext = createContext<ToastQueue | null>(null);

/** The queue of the nearest `Toaster`. Throws outside a `Toaster`. */
export function useToast(): ToastQueue {
  const queue = use(ToastContext);
  if (!queue) throw new Error('[salmonui] useToast() needs a <Toaster> ancestor');
  return queue;
}

const NONE: readonly ToastState[] = [];
const none = (): readonly ToastState[] => NONE;
// 16x16 stroke glyphs inside a circle; the info glyph for neutral, primary, info.
const GLYPH: Partial<Record<ToastTone, string>> = { success: 'M5 8l2 2 4-4', warning: 'M8 4.5v4m0 2.5v.5', danger: 'M6 6l4 4m0-4-4 4' };

/**
 * Toaster. Styling hooks: `.salmon-toaster` (`data-placement`, `data-paused`,
 * `data-scoped`), its `.salmon-toaster-list`; `.salmon-toast` (`data-tone`,
 * `data-closing`) with parts `-icon`, `-main`, `-title`, `-description`,
 * `-actions`, `-action`, `-dismiss`, `-progress`.
 */
export function Toaster(props: ToasterProps): ReactElement {
  const { queue: given, placement = 'bottomEnd', newestOnTop = true, max, container, hotkey = true, localeText: ownText, children, className, ref, onKeyDown, ...rest } = props;
  const localeText = useLocaleText('toaster', ownText);
  const [own] = useState(() => given ?? createToastQueue(max === undefined ? {} : { max }));
  const queue = given ?? own;
  const visible = useSyncExternalStore(queue.subscribe, () => queue.getSnapshot().visible, none);
  const region = useRef<HTMLElement | null>(null);
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);
  const announced = useRef(new Set<string>());
  const back = useRef<Element | null>(null);
  const hydrated = useHydrated();
  const scoped = container !== undefined;
  const dismissLabel = localeText?.dismiss ?? 'Dismiss';

  useLayoutEffect(() => {
    if (max !== undefined) queue.setMax(max);
  }, [queue, max]);

  // Pause sources: hover, focus inside, hidden document. The region mirrors
  // the queue's paused state in data-paused (the countdown bars read it).
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const doc = el.ownerDocument;
    let hover = false;
    let focus = false;
    let on = false;
    const sync = (): void => {
      const next = hover || focus || doc.visibilityState === 'hidden';
      if (next !== on) {
        on = next;
        if (on) queue.pause();
        else queue.resume();
      }
    };
    const mirror = (): void => {
      el.toggleAttribute('data-paused', queue.getSnapshot().paused);
    };
    const listen = (type: string, fn: (event: Event) => void, target: EventTarget = el): void => {
      target.addEventListener(type, fn);
      offs.push(() => target.removeEventListener(type, fn));
    };
    const offs: (() => void)[] = [queue.subscribe(mirror)];
    listen('pointerenter', () => ((hover = true), sync()));
    listen('pointerleave', () => ((hover = false), sync()));
    listen('focusin', () => ((focus = true), sync()));
    listen('focusout', (event) => ((focus = el.contains((event as FocusEvent).relatedTarget as Node | null)), sync()));
    listen('visibilitychange', sync, doc);
    sync();
    mirror();
    return () => {
      for (const off of offs) off();
      if (on) queue.resume();
    };
  }, [queue, hydrated, container]);

  // Top layer: the region is popover="manual", shown once mounted.
  useLayoutEffect(() => {
    const el = region.current;
    if (el && !scoped && 'showPopover' in el && !el.matches(':popover-open')) el.showPopover();
  });

  // Announce newly visible toasts through the pre-existing live regions.
  useLayoutEffect(() => {
    const text: Record<'polite' | 'assertive', string[]> = { polite: [], assertive: [] };
    const ids = new Set<string>();
    for (const t of visible) {
      ids.add(t.id);
      if (t.closing || announced.current.has(t.id)) continue;
      announced.current.add(t.id);
      const main = region.current?.querySelector(`[data-id="${t.id}"] .salmon-toast-main`);
      const parts = [main?.textContent ?? '', ...(t.actions ?? []).map((a) => a.altText)].filter(Boolean);
      text[t.tone === 'danger' ? 'assertive' : 'polite'].push(parts.join('. '));
    }
    for (const id of announced.current) if (!ids.has(id)) announced.current.delete(id);
    if (text.polite.length) announce(polite.current, text.polite.join('. '));
    if (text.assertive.length) announce(assertive.current, text.assertive.join('. '));
  }, [visible]);

  // F6 moves focus to the first toast and back to where it came from.
  useEffect(() => {
    const el = region.current;
    if (!hotkey || !el) return;
    const doc = el.ownerDocument;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'F6' || event.defaultPrevented) return;
      if (el.contains(doc.activeElement)) {
        event.preventDefault();
        (back.current as HTMLElement | null)?.focus?.();
        back.current = null;
        return;
      }
      const first = el.querySelector<HTMLElement>('.salmon-toast:not([data-closing])');
      if (!first) return;
      event.preventDefault();
      back.current = doc.activeElement;
      first.focus();
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [hotkey, hydrated, container]);

  // Closes a toast from inside the region; focus moves to a neighbor or back.
  const close = (t: ToastState, reason: 'dismiss' | 'action', from: Element): void => {
    const item = from.closest('.salmon-toast');
    const hadFocus = item?.contains(from.ownerDocument.activeElement);
    queue.dismiss(t.id, reason);
    if (!hadFocus || !queue.getSnapshot().visible.some((x) => x.id === t.id && x.closing)) return;
    // The store has emitted but React has not rendered data-closing yet: skip the item itself.
    const next = [...(region.current?.querySelectorAll<HTMLElement>('.salmon-toast:not([data-closing])') ?? [])].find((el) => el !== item);
    if (next) next.focus();
    else (back.current as HTMLElement | null)?.focus?.();
  };

  const onRegionKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    onKeyDown?.(event);
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const item = (event.target as Element).closest('.salmon-toast');
    const t = visible.find((x) => x.id === item?.getAttribute('data-id'));
    if (t?.dismissible && item) {
      event.preventDefault();
      close(t, 'dismiss', item);
    }
  };

  const items = newestOnTop ? [...visible].reverse() : visible;
  const section = (
    <section
      {...rest}
      ref={(el) => {
        region.current = el;
        if (typeof ref === 'function') return ref(el);
        if (ref) ref.current = el;
      }}
      className={className ? `salmon-toaster ${className}` : 'salmon-toaster'}
      aria-label={localeText?.notifications ?? 'Notifications'}
      data-placement={placement}
      data-scoped={scoped ? '' : undefined}
      popover={scoped ? undefined : 'manual'}
      onKeyDown={onRegionKeyDown}
    >
      {/* The attributes of live-region.ts `liveRegionProps`, inlined (fewer bytes). */}
      <div className="salmon-visually-hidden" ref={polite} role="status" aria-live="polite" aria-atomic="true" />
      <div className="salmon-visually-hidden" ref={assertive} role="alert" aria-live="assertive" aria-atomic="true" />
      <ol className="salmon-toaster-list">
        {items.map((t) => (
          <li
            key={t.id}
            data-id={t.id}
            className={t.className ? `salmon-toast ${t.className}` : 'salmon-toast'}
            style={t.style}
            data-tone={t.tone ?? 'neutral'}
            data-closing={t.closing ? '' : undefined}
            inert={t.closing}
            tabIndex={0}
            onClick={t.onClick}
          >
            <div className="salmon-toast-body" role={t.tone === 'danger' ? 'alert' : 'status'} aria-live="off" aria-atomic="true">
              {t.content ?? (
                <>
                  {t.icon === false ? null : (
                    <span className="salmon-toast-icon" aria-hidden="true">
                      {t.icon ?? (
                        <svg viewBox="0 0 16 16">
                          <path d={`M1.5 8a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0${(t.tone && GLYPH[t.tone]) || 'M8 7.5v4m0-6.5v.5'}`} />
                        </svg>
                      )}
                    </span>
                  )}
                  <div className="salmon-toast-main">
                    {t.title ? <div className="salmon-toast-title">{t.title}</div> : null}
                    {t.description ? <div className="salmon-toast-description">{t.description}</div> : null}
                  </div>
                  {t.actions?.length ? (
                    <div className="salmon-toast-actions">
                      {t.actions.map((a, i) => (
                        <button
                          key={i}
                          type="button"
                          className="salmon-toast-action"
                          onClick={(event) => {
                            a.onAction?.(event);
                            if (!event.defaultPrevented) close(t, 'action', event.currentTarget);
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
              {t.dismissible ? (
                <button type="button" className="salmon-toast-dismiss" aria-label={dismissLabel} onClick={(event) => close(t, 'dismiss', event.currentTarget)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4l8 8m0-8-8 8" />
                  </svg>
                </button>
              ) : null}
            </div>
            {t.progress && durationOf(t) < Infinity ? <div key={t.run} className="salmon-toast-progress" style={{ animationDuration: `${durationOf(t)}ms` }} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
  let out: ReactNode = section;
  if (scoped) out = container && hydrated ? createPortal(section, container) : null;
  return (
    <ToastContext value={queue}>
      {children}
      {out}
    </ToastContext>
  );
}
