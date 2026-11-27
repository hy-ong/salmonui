'use client';

// Breadcrumbs (APG Breadcrumb): a `<nav>`
// landmark with an `<ol>`, the current item `aria-current="page"`.
// Collapse is structural with `maxItems` (server and client render the same
// `hidden` attributes) or measured without it (`overflow="menu"`): the
// server renders every item, and after mount the shared measurer
// (internal/overflow.ts, a lazy chunk) only toggles `hidden` on items and
// on the ellipsis. The ellipsis of `overflow="menu"` is a Buttons
// `MenuButton` loaded with the Menu family on first activation
// (./ellipsis-menu.tsx); until then a same-looking native button stands in.

import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  use,
  useLayoutEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ComponentType,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import type { PressSource } from '@salmonui/core/internal/press';
import type { BreadcrumbsMenuProps } from './ellipsis-menu.js';

export type BreadcrumbsOverflow = 'menu' | 'expand' | 'wrap' | 'scroll' | 'none';

export interface BreadcrumbsLocaleText {
  /** Accessible name of the `<nav>` landmark. */
  readonly label: string;
  /** Accessible name of the ellipsis button. */
  readonly ellipsis: string;
}

export const BREADCRUMBS_DEFAULT_LOCALE_TEXT: BreadcrumbsLocaleText = Object.freeze({
  label: 'Breadcrumb',
  ellipsis: 'Show hidden breadcrumbs',
});

/** `onItemClick` event. `preventDefault()` cancels the link's navigation. */
export interface BreadcrumbsItemClickEvent {
  /** Position of the item among the `BreadcrumbItem` children. */
  readonly index: number;
  /** The clicked item's props. */
  readonly item: BreadcrumbItemProps;
  readonly href: string | undefined;
  readonly source: PressSource;
  /** The item was chosen in the ellipsis menu. */
  readonly menu: boolean;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/**
 * Props a `BreadcrumbItem` `render` function receives: spread them all onto the returned element.
 */
export type BreadcrumbItemRenderProps = AnchorHTMLAttributes<HTMLElement> & {
  ref?: Ref<never> | undefined;
  [dataAttribute: `data-${string}`]: string | number | undefined;
};

export interface BreadcrumbItemProps {
  /** The item's label. */
  readonly children?: ReactNode;
  /** Link target. Without `href` the item renders as text. */
  readonly href?: string | undefined;
  readonly target?: string | undefined;
  readonly rel?: string | undefined;
  /** Decorative icon before the label (`aria-hidden`). */
  readonly icon?: ReactNode;
  /** Not interactive: text with `aria-disabled="true"`. */
  readonly disabled?: boolean | undefined;
  /** The current page (`aria-current="page"`). Default: the last item. */
  readonly current?: boolean | undefined;
  /** Renders another element for the link (a router link): `render={(props) => <Link {...props} to="/x" />}`. */
  readonly render?: ((props: BreadcrumbItemRenderProps) => ReactElement) | undefined;
  readonly onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
  /** On the `<li>`. */
  readonly className?: string | undefined;
  /** On the `<li>`. */
  readonly style?: CSSProperties | undefined;
  /** On the `<li>`. */
  readonly id?: string | undefined;
  readonly title?: string | undefined;
}

export interface BreadcrumbsProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** `BreadcrumbItem` elements (fragments and arrays are flattened). */
  readonly children?: ReactNode;
  /** Default `'menu'`. */
  readonly overflow?: BreadcrumbsOverflow | undefined;
  /** `'menu'` / `'expand'`: keep the first item and the last `maxItems - 1` items; the rest collapse behind the ellipsis. */
  readonly maxItems?: number | undefined;
  /** Separator between items. Default a CSS chevron (mirrored in RTL). */
  readonly separator?: ReactNode;
  /** The current item renders as a link (when it has `href`) instead of text. */
  readonly currentNavigable?: boolean | undefined;
  /** Disables every item and the ellipsis. */
  readonly disabled?: boolean | undefined;
  /** A link item was activated (in the list or the ellipsis menu); `preventDefault()` cancels navigation. */
  readonly onItemClick?: ((event: BreadcrumbsItemClickEvent) => void) | undefined;
  readonly localeText?: Partial<BreadcrumbsLocaleText> | undefined;
  /** The `<nav>`. */
  readonly ref?: Ref<HTMLElement> | undefined;
}

interface ItemContextValue {
  readonly index: number;
  readonly current: boolean;
  readonly hidden: boolean;
  readonly measured: boolean;
  readonly separator: ReactNode;
  readonly disabled: boolean;
  readonly currentNavigable: boolean;
  readonly click: ((index: number, item: BreadcrumbItemProps, event: MouseEvent<HTMLElement>) => void) | undefined;
}

const ItemContext = createContext<ItemContextValue | null>(null);

// internal/dev.ts `DEV`, inlined: a module shared with the lazy Menu family becomes its own initial chunk.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
const freeze = <T extends object>(o: T): T => (process.env.NODE_ENV !== 'production' ? Object.freeze(o) : o);
const cx = (a: string, b: string | undefined): string => (b ? `${a} ${b}` : a);
const flag = (on: boolean): '' | undefined => (on ? '' : undefined);
const NONE: ReadonlySet<number> = new Set();
// internal/press.ts `pressSource`, inlined for the same reason.
const sourceOf = (event: MouseEvent<HTMLElement>): PressSource => (event.detail === 0 ? 'keyboard' : (event.nativeEvent as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer');

// The ellipsis glyph; the button's name comes from `aria-label`.
const DOTS = '\u2026';

function flatten(children: ReactNode, out: ReactElement<BreadcrumbItemProps>[]): ReactElement<BreadcrumbItemProps>[] {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === Fragment) flatten(child.props.children, out);
    else out.push(child as ReactElement<BreadcrumbItemProps>);
  }
  return out;
}

/** Fires `onItemClick`; returns true when it was prevented. */
function fire(handler: BreadcrumbsProps['onItemClick'], index: number, item: BreadcrumbItemProps, source: PressSource, menu: boolean): boolean {
  let prevented = false;
  handler?.(
    freeze({
      index,
      item,
      href: item.href,
      source,
      menu,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    }),
  );
  return prevented;
}

/**
 * APG Breadcrumb trail. Styling hooks: `.salmon-breadcrumbs` with
 * `data-overflow`, `data-disabled`, `data-separator`; `.salmon-breadcrumbs-list`,
 * `.salmon-breadcrumbs-item` (`data-current`, `data-disabled`),
 * `.salmon-breadcrumbs-link`, `.salmon-breadcrumbs-text`,
 * `.salmon-breadcrumbs-ellipsis`.
 */
export function Breadcrumbs(props: BreadcrumbsProps): ReactElement {
  const { children, overflow = 'menu', maxItems, separator, currentNavigable = false, disabled = false, onItemClick, localeText, className, ref, ...rest } = props;
  const text = { ...BREADCRUMBS_DEFAULT_LOCALE_TEXT, ...useLocaleText('breadcrumbs', localeText) };
  const items = flatten(children, []);
  const n = items.length;
  let currentIndex = items.findIndex((item) => item.props.current === true);
  // With no items `n - 1` is the same -1.
  if (currentIndex < 0 && items[n - 1]?.props.current !== false) currentIndex = n - 1;

  const collapsible = overflow === 'menu' || overflow === 'expand';
  const structural = collapsible && maxItems !== undefined;
  const measuring = overflow === 'menu' && maxItems === undefined;
  const [expanded, setExpanded] = useState(false);
  const [measuredHidden, setMeasuredHidden] = useState<ReadonlySet<number>>(NONE);
  const [MenuComponent, setMenuComponent] = useState<ComponentType<BreadcrumbsMenuProps> | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  // Index of the first item revealed by `overflow="expand"`, focused after the commit.
  const focusRevealed = useRef(-1);
  const watcher = useRef<{ readonly measure: () => void; readonly stop: () => void } | null>(null);

  // Structural collapse: the first item and the last `maxItems - 1` stay.
  let hiddenFrom = 0;
  let hiddenTo = 0;
  if (structural && !expanded && n > Math.max(1, maxItems)) {
    const keep = Math.max(1, Math.floor(maxItems));
    hiddenFrom = keep >= 2 ? 1 : 0;
    hiddenTo = n - (keep >= 2 ? keep - 1 : 1);
  }
  const isHidden = (i: number): boolean => (structural ? i >= hiddenFrom && i < hiddenTo : measuring && measuredHidden.has(i));
  const hiddenIndexes: number[] = [];
  for (let i = 0; i < n; i++) if (isHidden(i)) hiddenIndexes.push(i);
  const collapsed = hiddenIndexes.length > 0;

  useLayoutEffect(() => {
    if (!measuring) return;
    const el = listRef.current;
    if (!el) return;
    let live = true;
    void import('../internal/overflow.js').then((m) => {
      if (!live) return;
      watcher.current = m.watchOverflow(el, () => ({}), (hidden) => setMeasuredHidden(new Set(Array.from(hidden, Number))));
    });
    return () => {
      live = false;
      watcher.current?.stop();
      watcher.current = null;
      setMeasuredHidden(NONE);
    };
  }, [measuring]);
  // Children may change sizes: re-measure after each commit (read phase only).
  useLayoutEffect(() => {
    watcher.current?.measure();
    const from = focusRevealed.current;
    if (from >= 0) {
      focusRevealed.current = -1;
      listRef.current?.querySelector<HTMLElement>(`li[data-index="${from}"] [href]`)?.focus();
    }
  });
  useLayoutEffect(() => {
    if (overflow !== 'scroll') return;
    const list = listRef.current;
    const cur = list?.querySelector<HTMLElement>('[data-current]');
    if (!list || !cur) return;
    // Scrolls the list only (scrollIntoView could scroll the page).
    const a = list.getBoundingClientRect();
    const b = cur.getBoundingClientRect();
    list.scrollLeft += b.right > a.right ? b.right - a.right : Math.min(0, b.left - a.left);
  }, [overflow, currentIndex, n]);

  const click =
    onItemClick &&
    ((index: number, item: BreadcrumbItemProps, event: MouseEvent<HTMLElement>): void => {
      if (fire(onItemClick, index, item, sourceOf(event), false)) event.preventDefault();
    });

  const loadMenu = () => import('./ellipsis-menu.js');
  const activate = (): void => {
    if (disabled) return;
    void loadMenu().then((m) => setMenuComponent(() => m.default));
  };

  let ellipsis: ReactNode = null;
  if (collapsible) {
    const label = text.ellipsis;
    let control: ReactNode;
    if (overflow === 'expand') {
      control = (
        <button
          type="button"
          className="salmon-breadcrumbs-ellipsis"
          aria-label={label}
          disabled={disabled}
          onClick={() => {
            focusRevealed.current = hiddenIndexes[0] ?? 0;
            setExpanded(true);
          }}
        >
          {DOTS}
        </button>
      );
    } else if (MenuComponent) {
      const entries = hiddenIndexes.map((index) => ({ index, props: (items[index] as ReactElement<BreadcrumbItemProps>).props }));
      control = <MenuComponent label={label} icon={DOTS} disabled={disabled} entries={entries} onPick={(index, item, source) => fire(onItemClick, index, item, source, true)} />;
    } else {
      // Stand-in for the MenuButton until the Menu family loads (same markup).
      control = (
        <button
          type="button"
          className="salmon-button salmon-menu-button salmon-breadcrumbs-ellipsis"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label={label}
          disabled={disabled}
          onPointerEnter={loadMenu}
          onFocus={loadMenu}
          onClick={activate}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              activate();
            }
          }}
        >
          <span className="salmon-button__icon" aria-hidden="true">
            {DOTS}
          </span>
        </button>
      );
    }
    ellipsis = (
      <li key="salmon-ellipsis" className="salmon-breadcrumbs-item salmon-breadcrumbs-more" hidden={!collapsed} data-overflow-trigger={flag(measuring)}>
        {separator != null ? (
          <span className="salmon-breadcrumbs-separator" aria-hidden="true">
            {separator}
          </span>
        ) : null}
        {control}
      </li>
    );
  }

  const rendered: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const item = items[i] as ReactElement<BreadcrumbItemProps>;
    const value: ItemContextValue = {
      index: i,
      current: i === currentIndex,
      hidden: isHidden(i),
      measured: measuring,
      separator,
      disabled,
      currentNavigable,
      click,
    };
    rendered.push(
      <ItemContext key={item.key ?? i} value={value}>
        {item}
      </ItemContext>,
    );
    if (i === 0 && ellipsis) rendered.push(ellipsis);
  }

  return (
    <nav
      aria-label={rest['aria-labelledby'] ? undefined : text.label}
      {...rest}
      ref={ref}
      className={cx('salmon-breadcrumbs', className)}
      data-overflow={overflow}
      data-disabled={flag(disabled)}
      data-separator={separator != null ? 'custom' : undefined}
      data-expanded={flag(expanded)}
    >
      <ol ref={listRef} className="salmon-breadcrumbs-list" data-overflow-root={flag(measuring)}>
        {rendered}
      </ol>
    </nav>
  );
}

/**
 * One step of the trail: a link (`href`), or text (no `href`, the current
 * item unless `currentNavigable`, or `disabled`). Must be a child of
 * `Breadcrumbs`.
 */
export function BreadcrumbItem(props: BreadcrumbItemProps): ReactElement {
  const ctx = use(ItemContext);
  if (!ctx) throw new Error('[salmonui] <BreadcrumbItem> must be inside <Breadcrumbs>.');
  const { children, href, target, rel, icon, disabled: itemDisabled, current: _current, render, onClick, className, style, id, title } = props;
  const { index, current, hidden, measured, separator } = ctx;
  const disabled = ctx.disabled || itemDisabled === true;
  const link = href !== undefined && !disabled && (!current || ctx.currentNavigable);
  const content = (
    <>
      {icon != null ? (
        <span className="salmon-breadcrumbs-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </>
  );
  const own: BreadcrumbItemRenderProps = {
    className: link ? 'salmon-breadcrumbs-link' : 'salmon-breadcrumbs-text',
    title,
    'aria-current': current ? 'page' : undefined,
    'aria-disabled': disabled || undefined,
    children: content,
  };
  if (link) {
    own.href = href;
    own.target = target;
    own.rel = rel;
    own.onClick = (event: MouseEvent<HTMLElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) ctx.click?.(index, props, event);
    };
  } else if (render && disabled) {
    own.onClick = (event: MouseEvent<HTMLElement>) => event.preventDefault();
  }
  const inner = render && (link || disabled) ? render(own) : link ? <a {...own} /> : <span {...own} />;
  return (
    <li
      id={id}
      className={cx('salmon-breadcrumbs-item', className)}
      style={style}
      hidden={hidden}
      data-index={index}
      data-current={flag(current)}
      data-disabled={flag(disabled)}
      data-overflow-item={measured ? String(index) : undefined}
      data-overflow-mode={measured && (index === 0 || current) ? 'never' : undefined}
      data-overflow-priority={measured ? index : undefined}
    >
      {index > 0 && separator != null ? (
        <span className="salmon-breadcrumbs-separator" aria-hidden="true">
          {separator}
        </span>
      ) : null}
      {inner}
    </li>
  );
}
