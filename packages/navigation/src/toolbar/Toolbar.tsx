'use client';

// Toolbar family (APG Toolbar). One tab stop with
// focus memory, arrows by orientation (mirrored in RTL), Home / End, and a
// measured overflow (`internal/overflow`): overflowed items stay in the DOM
// with `hidden`, and the lazily loaded overflow menu clicks them. Every
// browser read happens in effects and event handlers.

import {
  Children,
  createContext,
  isValidElement,
  lazy,
  Suspense,
  use,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { focusableIn } from '@salmonui/core/internal/focusable';
import type { OverflowMode } from '../internal/overflow.js';
import { applyRovingMove, rovingMove } from '@salmonui/core/internal/roving';
import type { ToolbarItemMeta } from './overflow-menu.js';
import type { ToolbarFit, ToolbarWatcher } from './runtime.js';
import type { ToolbarItemSize } from './sizing.js';

export type { ToolbarItemSize };

/** User-visible strings of `Toolbar`. */
export interface ToolbarLocaleText {
  /** Name of the overflow menu button. */
  readonly more: string;
  /** Scroll button toward the inline start (`overflow="scroll"`). */
  readonly scrollBack: string;
  /** Scroll button toward the inline end (`overflow="scroll"`). */
  readonly scrollForward: string;
}

export const TOOLBAR_DEFAULT_LOCALE_TEXT: ToolbarLocaleText = Object.freeze({
  more: 'More',
  scrollBack: 'Scroll back',
  scrollForward: 'Scroll forward',
});

export type ToolbarOverflow = 'menu' | 'scroll' | 'wrap';
export type ToolbarOrientation = 'horizontal' | 'vertical';

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  /** Toolbar content: buttons, `ToolbarItem`, `ToolbarGroup`, `ToolbarSpacer`, `ToolbarSeparator`. */
  readonly children?: ReactNode;
  /** Layout and arrow-key axis. Default `'horizontal'`. */
  readonly orientation?: ToolbarOrientation | undefined;
  /** What happens to items that do not fit. Default `'menu'`. */
  readonly overflow?: ToolbarOverflow | undefined;
  /** Distance of one scroll-button press in px (`overflow="scroll"`). Default 120. */
  readonly scrollStep?: number | undefined;
  /** Disables every control (a disabled `<fieldset>`); `aria-disabled` on the toolbar. */
  readonly disabled?: boolean | undefined;
  /** Icon of the overflow menu button (default: three dots). */
  readonly moreIcon?: ReactNode;
  readonly localeText?: Partial<ToolbarLocaleText> | undefined;
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

export interface ToolbarItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Content, or a function of the item's current size (`sizes`). */
  readonly children?: ReactNode | ((size: ToolbarItemSize) => ReactNode);
  /**
   * Sizes the item may take, largest first (`'lg' | 'md' | 'sm'`). It
   * renders `sizes[0]` until measured; with `overflow="menu"` it steps down
   * by `overflowPriority` before anything overflows. Current size:
   * `data-size` and the function child's argument (`'md'` without `sizes`).
   */
  readonly sizes?: readonly ToolbarItemSize[] | undefined;
  /** Text of the item's overflow menu entry (default: the control's `aria-label` or text). */
  readonly label?: string | undefined;
  /** Icon of the item's overflow menu entry. */
  readonly icon?: ReactNode;
  /**
   * `'auto'` overflows when space runs out, `'never'` stays, `'always'` lives
   * in the overflow menu. Default `'auto'`, or `'never'` for an item whose
   * content is a form field (it cannot be a menu entry).
   */
  readonly overflow?: OverflowMode | undefined;
  /** Higher stays longer (steps down and overflows later) when space runs out. Default 0. */
  readonly overflowPriority?: number | undefined;
}

export interface ToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode;
  /** Pushes the group to the start, center or end of the bar. Default `'start'`. */
  readonly align?: 'start' | 'center' | 'end' | undefined;
  /** Visible label under the items; names the group (`role="group"`). */
  readonly label?: ReactNode;
  /** Launcher slot next to the label (for example a `Button iconOnly`); never overflows. */
  readonly action?: ReactNode;
}

export type ToolbarSeparatorProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'>;
export type ToolbarSpacerProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

interface ToolbarContextValue {
  readonly hidden: ReadonlySet<string>;
  /** Stepped-down sizes by item key (items not listed are at `sizes[0]`). */
  readonly sizes: ReadonlyMap<string, ToolbarItemSize> | undefined;
  readonly orientation: ToolbarOrientation;
  /** Overflow menu data of `ToolbarItem`s, written in layout effects, read when the menu opens. */
  readonly meta: Map<string, ToolbarItemMeta>;
}

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

// The overflow menu (Menu family + overlay) loads on first use.
const loadMenu = () => import('./overflow-menu.js');
const ToolbarOverflowMenu = lazy(loadMenu);
// The measuring runtime (overflow measurer, scroll state) loads after mount.
const loadRuntime = () => import('./runtime.js');
// The multi-size stepping chunk, loaded by the runtime once an item declares more than one size.
const loadSizing = () => import('./sizing.js');
const FIT: ToolbarFit = [new Set<string>()];

// Icons share one attribute set; the dots are zero-length round-capped strokes.
const SVG = {
  viewBox: '0 0 16 16',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  'aria-hidden': true,
} as const;
const DOTS = (
  <svg {...SVG} strokeWidth={3}>
    <path d="M3 8h0m5 0h0m5 0h0" />
  </svg>
);
const CHEVRON = (
  <svg {...SVG} strokeWidth={1.75} strokeLinejoin="round">
    <path d="M10 4 6 8l4 4" />
  </svg>
);

/** Direction read at event time. */
const isRtl = (el: Element): boolean => el.ownerDocument.defaultView?.getComputedStyle(el).direction === 'rtl';

function cx(base: string, extra: string | undefined): string {
  return extra ? `${base} ${extra}` : base;
}

// Function declarations are hoisted, so the parts are defined here.
const STRUCTURAL: ReadonlySet<unknown> = new Set<unknown>([ToolbarItem, ToolbarGroup, ToolbarSpacer, ToolbarSeparator]);

/** Wraps every direct child that is not a toolbar part in a measured `ToolbarItem`. */
function wrapChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (child == null || typeof child === 'boolean') return child;
    if (isValidElement(child) && STRUCTURAL.has(child.type)) return child;
    return <ToolbarItem>{child}</ToolbarItem>;
  });
}

function inputKeepsKey(target: HTMLElement, key: string): boolean {
  if (target.matches('select, textarea, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], input[type="range"], input[type="number"], input[type="radio"]')) return true;
  if (target.tagName !== 'INPUT' || /^(button|submit|reset|checkbox|image|file|color)$/.test((target as HTMLInputElement).type)) return false;
  // Text inputs keep their caret keys; arrows leave at the caret's ends (as the Data Grid toolbar).
  if (key === 'Home' || key === 'End') return true;
  const input = target as HTMLInputElement;
  const start = input.selectionStart;
  if (start === null) return false;
  if (start !== input.selectionEnd) return true;
  const rtl = isRtl(target);
  const back = key === (rtl ? 'ArrowRight' : 'ArrowLeft') || key === 'ArrowUp';
  return back ? start > 0 : start < input.value.length;
}

/**
 * APG Toolbar: `role="toolbar"` with one tab stop (Tab enters on the last
 * focused control, or the first), arrow keys by `orientation` (mirrored in
 * RTL), Home / End. `.salmon-toolbar` with `data-orientation`,
 * `data-overflow` and `data-disabled`.
 */
export function Toolbar(props: ToolbarProps): ReactElement {
  const { children, orientation = 'horizontal', overflow = 'menu', scrollStep = 120, disabled = false, moreIcon, localeText, className, onKeyDown, onFocus, onPointerDown, ref, ...rest } = props;
  const text = { ...TOOLBAR_DEFAULT_LOCALE_TEXT, ...useLocaleText('toolbar', localeText) };
  const root = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(ref, () => root.current as HTMLDivElement, []);
  const content = useRef<HTMLFieldSetElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const last = useRef<HTMLElement | null>(null);
  const pointer = useRef(false);
  const leaving = useRef(false);
  const [meta] = useState(() => new Map<string, ToolbarItemMeta>());
  const [open, setOpen] = useState(false);
  const [[hidden, sizes], setFit] = useState<ToolbarFit>(FIT);
  const menuId = useId();
  const vertical = orientation === 'vertical';
  const more = hidden.size > 0;
  const watcher = useRef<ToolbarWatcher | null>(null);
  // Read by the runtime: the measured axis and the scroll-button step.
  const axis = useRef<readonly [boolean, number]>([vertical, scrollStep]);

  // Re-measure after every commit (children or props changed); the watcher commits only when the fit changes.
  useLayoutEffect(() => {
    axis.current = [vertical, scrollStep];
    watcher.current?.measure();
  });
  // The measuring runtime is a lazy chunk; every item stays rendered until it arrives (as on the server).
  useLayoutEffect(() => {
    if (overflow === 'wrap') return;
    const bar = root.current as HTMLDivElement;
    let live = true;
    void loadRuntime().then((m) => {
      if (live) watcher.current = m.watchToolbar(bar, overflow === 'menu', () => axis.current, setFit, loadSizing);
    });
    return () => {
      live = false;
      watcher.current?.stop();
      watcher.current = null;
      setFit(FIT);
    };
  }, [overflow]);

  const stops = (): HTMLElement[] => {
    const el = root.current;
    return el ? focusableIn(el).filter((s) => !s.closest('[data-salmon-overlay],[data-scroll]')) : [];
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    const el = root.current;
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || !el || !el.contains(target) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      // One tab stop: move to the edge stop and let the browser's Tab leave from there.
      const list = stops();
      const edge = event.shiftKey ? list[0] : list[list.length - 1];
      if (edge && edge !== target) {
        // Passing through the edge stop is not a new focus position to remember.
        leaving.current = true;
        edge.focus({ preventScroll: true });
        leaving.current = false;
      }
      return;
    }
    const move = rovingMove(event.key, {
      orientation,
      rtl: !vertical && isRtl(target),
    });
    if (!move || inputKeepsKey(target, event.key)) return;
    const list = stops();
    const from = list.findIndex((s) => s === target || s.contains(target));
    const next = list[applyRovingMove(move, list.length, from, () => true)];
    if (!next) return;
    event.preventDefault();
    if (next !== target) next.focus();
  };

  const handleFocus = (event: FocusEvent<HTMLDivElement>): void => {
    onFocus?.(event);
    const el = root.current;
    const target = event.target as HTMLElement;
    if (!el || !el.contains(target)) return;
    const from = event.relatedTarget as Node | null;
    const entering = !from || !el.contains(from);
    const byPointer = pointer.current;
    pointer.current = false;
    if (entering && !byPointer && !(from instanceof Element && from.closest('[data-salmon-overlay]'))) {
      // Tab entered: restore the last focused control (APG), or the first one.
      const list = stops();
      const remembered = last.current && list.includes(last.current) ? last.current : list[0];
      if (remembered && remembered !== target && !remembered.contains(target)) {
        last.current = remembered;
        remembered.focus();
        return;
      }
    }
    if (!leaving.current) last.current = target;
  };

  // Pointer-only scroll buttons; the runtime handles their clicks (delegated on the bar).
  const scrollButton = (side: 'back' | 'forward', title: string): ReactElement | null =>
    overflow === 'scroll' ? (
      <button type="button" className="salmon-toolbar-scroll-button" data-scroll={side} tabIndex={-1} aria-hidden title={title}>
        {CHEVRON}
      </button>
    ) : null;

  return (
    <div
      {...rest}
      ref={root}
      role="toolbar"
      aria-orientation={orientation}
      aria-disabled={disabled || undefined}
      className={cx('salmon-toolbar', className)}
      data-orientation={orientation}
      data-overflow={overflow}
      data-disabled={disabled ? '' : undefined}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onPointerDown={(event) => {
        pointer.current = true;
        onPointerDown?.(event);
      }}
    >
      {scrollButton('back', text.scrollBack)}
      <fieldset role="none" className="salmon-toolbar-content" disabled={disabled} ref={content} data-overflow-root="">
        <ToolbarContext value={{ hidden, sizes, orientation, meta }}>{wrapChildren(children)}</ToolbarContext>
        {overflow === 'menu' ? (
          <button
            ref={trigger}
            type="button"
            className="salmon-toolbar-more"
            data-overflow-trigger=""
            hidden={!more}
            aria-label={text.more}
            title={text.more}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            data-open={open ? '' : undefined}
            onPointerEnter={loadMenu}
            onClick={() => setOpen(!open)}
            onKeyDown={(event) => {
              if (event.key === (vertical ? 'ArrowRight' : 'ArrowDown') && !open) {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            {moreIcon ?? DOTS}
          </button>
        ) : null}
      </fieldset>
      {scrollButton('forward', text.scrollForward)}
      {open ? (
        <Suspense fallback={null}>
          <ToolbarOverflowMenu id={menuId} anchor={trigger} content={content} meta={meta} disabled={disabled} placement={vertical ? 'end-start' : 'bottom-end'} label={text.more} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * A measured toolbar slot around any content (`.salmon-toolbar-item`).
 * Direct children of `Toolbar` and `ToolbarGroup` that are not toolbar parts
 * are wrapped in one automatically.
 */
export function ToolbarItem(props: ToolbarItemProps): ReactElement {
  const { children, label, icon, overflow, overflowPriority, sizes, className, ...rest } = props;
  const ctx = use(ToolbarContext);
  const id = useId();
  const stepped = ctx?.sizes?.get(id);
  const size = sizes && (stepped && sizes.includes(stepped) ? stepped : sizes[0]);
  const meta = ctx?.meta;
  useLayoutEffect(() => {
    if (!meta) return;
    meta.set(id, { label, icon });
    return () => {
      meta.delete(id);
    };
  }, [meta, id, label, icon]);
  return (
    <div
      {...rest}
      className={cx('salmon-toolbar-item', className)}
      data-overflow-item={id}
      data-overflow-mode={overflow === 'auto' ? undefined : overflow}
      data-overflow-priority={overflowPriority || undefined}
      data-overflow-sizes={sizes?.[1] ? sizes.join(' ') : undefined}
      data-size={size}
      hidden={ctx?.hidden.has(id) || undefined}
    >
      {typeof children === 'function' ? children(size ?? 'md') : children}
    </div>
  );
}

/** A visual and semantic separator between items (`role="separator"`); hidden when it would end up leading, trailing or doubled. */
export function ToolbarSeparator(props: ToolbarSeparatorProps): ReactElement {
  const { className, ...rest } = props;
  const ctx = use(ToolbarContext);
  const id = useId();
  return (
    <div
      {...rest}
      role="separator"
      aria-orientation={ctx?.orientation === 'vertical' ? 'horizontal' : 'vertical'}
      className={cx('salmon-toolbar-separator', className)}
      data-overflow-item={id}
      data-overflow-separator=""
      hidden={ctx?.hidden.has(id) || undefined}
    />
  );
}

/** Flexible space: items after it go to the end of the bar. */
export function ToolbarSpacer(props: ToolbarSpacerProps): ReactElement {
  const { className, ...rest } = props;
  return <div aria-hidden {...rest} className={cx('salmon-toolbar-spacer', className)} />;
}

/**
 * A run of items aligned to the start, center or end of the bar
 * (`.salmon-toolbar-group` with `data-align`). Give it `aria-label` to expose
 * it as a named `role="group"`.
 */
export function ToolbarGroup(props: ToolbarGroupProps): ReactElement {
  const { children, align = 'start', label, action, className, ...rest } = props;
  const labelId = useId();
  const labelled = label != null;
  const items = wrapChildren(children);
  return (
    <div
      role={labelled || rest['aria-label'] || rest['aria-labelledby'] ? 'group' : undefined}
      aria-labelledby={labelled ? labelId : undefined}
      {...rest}
      className={cx('salmon-toolbar-group', className)}
      data-align={align}
      data-labelled={labelled ? '' : undefined}
    >
      {labelled ? (
        <>
          <div className="salmon-toolbar-group-items">{items}</div>
          <div className="salmon-toolbar-group-label">
            <span id={labelId}>{label}</span>
            {action}
          </div>
        </>
      ) : (
        items
      )}
    </div>
  );
}
