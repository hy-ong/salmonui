'use client';

import { createContext, use, useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { useCollapse } from '../internal/collapse.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { DEV } from '@salmonui/core/internal/dev';
import { pressSource } from '@salmonui/core/internal/press';
import { applyRovingMove, rovingMove } from '@salmonui/core/internal/roving';

/** Input that changed the expanded items; `'find'` is the browser's find-in-page revealing a collapsed panel. */
export type AccordionSource = 'pointer' | 'keyboard' | 'touch' | 'find';

/** Second argument of `onValueChange` (frozen in development). */
export interface AccordionChangeEvent {
  /** The item whose header was toggled. */
  readonly item: string;
  /** Whether that item is now expanded. */
  readonly expanded: boolean;
  readonly source: AccordionSource;
}

/** `onBeforeValueChange` event; `preventDefault()` cancels the change. */
export interface AccordionBeforeChangeEvent extends AccordionChangeEvent {
  /** The proposed expanded items. */
  readonly value: readonly string[];
  readonly previousValue: readonly string[];
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface AccordionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  /** `AccordionItem` children. */
  children?: ReactNode;
  /** `'single'` keeps at most one item expanded; default `'multiple'`. */
  type?: 'single' | 'multiple' | undefined;
  /** In single mode, whether the expanded item may be collapsed. Default `true`. */
  collapsible?: boolean | undefined;
  /** Expanded item values; always an array, one element at most in single mode. */
  value?: readonly string[] | undefined;
  defaultValue?: readonly string[] | undefined;
  onValueChange?: ((value: readonly string[], event: AccordionChangeEvent) => void) | undefined;
  /** Runs before a change; `event.preventDefault()` cancels it. */
  onBeforeValueChange?: ((event: AccordionBeforeChangeEvent) => void) | undefined;
  /** Level of the heading around each header button. Default 3. */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  /** Keep a panel's content mounted after it collapses. Default `true`. */
  keepMounted?: boolean | undefined;
  /** Mount every panel's content, expanded or not (server HTML, find-in-page). Default `false`. */
  forceMount?: boolean | undefined;
  /** Disables every item. */
  disabled?: boolean | undefined;
  ref?: Ref<HTMLDivElement> | undefined;
}

export interface AccordionItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Stable item key reported in `value`. */
  value: string;
  /** Header content (the label of the header button and of the panel region). */
  header: ReactNode;
  /** Decorative icon before the header content. */
  icon?: ReactNode;
  /** Header button gets `aria-disabled` and does not toggle. */
  disabled?: boolean | undefined;
  /** Renders nothing. */
  hidden?: boolean | undefined;
  /** Overrides the accordion's `keepMounted` for this item. */
  keepMounted?: boolean | undefined;
  /** Overrides the accordion's `forceMount` for this item. */
  forceMount?: boolean | undefined;
  /** Props of the header `<button>` (`className`, `style`, `onClick`, `data-*`, ...). */
  headerProps?: ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  /** Props of the panel region (`className`, `style`, ...). */
  panelProps?: HTMLAttributes<HTMLDivElement> | undefined;
  /** Panel content; mounted on first expand. */
  children?: ReactNode;
  ref?: Ref<HTMLDivElement> | undefined;
}

interface AccordionState {
  readonly expanded: readonly string[];
  readonly single: boolean;
  readonly collapsible: boolean;
  readonly level: number;
  readonly keepMounted: boolean;
  readonly forceMount: boolean;
  readonly disabled: boolean;
  toggle(item: string, source: AccordionSource): void;
}

const AccordionContext = createContext<AccordionState | null>(null);
const NONE: readonly string[] = Object.freeze([]);
const TRIGGER = '.salmon-accordion-trigger';

/** The expanded items after toggling `item` (pure). */
export function toggleAccordionValue(value: readonly string[], item: string, single: boolean, collapsible: boolean): readonly string[] {
  const open = value.includes(item);
  if (single) return open ? (collapsible ? NONE : value) : [item];
  return open ? value.filter((v) => v !== item) : [...value, item];
}

const freeze = <T extends object>(object: T): T => (DEV ? Object.freeze(object) : object);
const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/**
 * APG Accordion: a stack of `AccordionItem`s, each a header button inside a
 * heading and a `role="region"` panel. `.salmon-accordion` with `data-type`.
 * `ref` is the root `<div>`.
 */
export function Accordion(props: AccordionProps): ReactElement {
  const {
    children,
    type = 'multiple',
    collapsible = true,
    value,
    defaultValue,
    onValueChange,
    onBeforeValueChange,
    headingLevel = 3,
    keepMounted = true,
    forceMount = false,
    disabled = false,
    className,
    onKeyDown,
    ref,
    ...rest
  } = props;
  const single = type === 'single';
  const [expanded, propose] = useControllableState<readonly string[], [AccordionChangeEvent]>(value, defaultValue ?? NONE, onValueChange, 'Accordion value');
  const root = useRef<HTMLDivElement | null>(null);

  const toggle = (item: string, source: AccordionSource): void => {
    const next = toggleAccordionValue(expanded, item, single, collapsible);
    if (next === expanded) return;
    const isOpen = next.includes(item);
    if (onBeforeValueChange) {
      let prevented = false;
      onBeforeValueChange(
        freeze({
          item,
          expanded: isOpen,
          value: next,
          previousValue: expanded,
          source,
          get defaultPrevented() {
            return prevented;
          },
          preventDefault() {
            prevented = true;
          },
        }),
      );
      if (prevented) return;
    }
    propose(next, onValueChange ? freeze({ item, expanded: isOpen, source }) : (undefined as never));
  };

  // ArrowUp / ArrowDown / Home / End between this accordion's headers;
  // headers of nested accordions belong to their own root.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    const el = root.current;
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || !el || !target.matches(TRIGGER) || target.closest('.salmon-accordion') !== el) return;
    const move = rovingMove(event.key, { orientation: 'vertical' });
    if (!move) return;
    const headers = [...el.querySelectorAll<HTMLElement>(TRIGGER)].filter((h) => h.closest('.salmon-accordion') === el);
    const next = headers[applyRovingMove(move, headers.length, headers.indexOf(target), () => true)];
    event.preventDefault();
    next?.focus();
  };

  const setRef = (node: HTMLDivElement | null): void => {
    root.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <div {...rest} ref={setRef} className={cx('salmon-accordion', className)} data-type={type} data-disabled={disabled ? '' : undefined} onKeyDown={handleKeyDown}>
      <AccordionContext value={{ expanded, single, collapsible, level: headingLevel, keepMounted, forceMount, disabled, toggle }}>{children}</AccordionContext>
    </div>
  );
}

const chevron = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 6l4 4 4-4" />
  </svg>
);

/**
 * One accordion section. `.salmon-accordion-item` with `data-state`
 * (`open` / `closed`) and `data-disabled`; parts `.salmon-accordion-heading`,
 * `.salmon-accordion-trigger`, `.salmon-accordion-panel`,
 * `.salmon-accordion-content`. `ref` is the item `<div>`.
 */
export function AccordionItem(props: AccordionItemProps): ReactElement | null {
  const { value, header, icon, disabled: ownDisabled, hidden, keepMounted, forceMount, headerProps, panelProps, children, className, ref, ...rest } = props;
  const ctx = use(AccordionContext);
  const id = useId();
  const open = ctx ? ctx.expanded.includes(value) : false;
  const disabled = ownDisabled || ctx?.disabled || false;
  // APG: the header of an expanded panel that cannot collapse is aria-disabled.
  const locked = open && !!ctx && ctx.single && !ctx.collapsible;
  const collapse = useCollapse<HTMLDivElement>(open, {
    keepMounted: keepMounted ?? ctx?.keepMounted,
    forceMount: forceMount ?? ctx?.forceMount,
    onReveal: () => {
      if (!disabled) ctx?.toggle(value, 'find');
    },
  });
  if (hidden) return null;
  const headerId = `${id}h`;
  const panelId = `${id}p`;
  const Heading = `h${ctx?.level ?? 3}` as 'h3';
  const state = collapse.state;
  const { className: headerClass, onClick, ...headerRest } = headerProps ?? {};
  const { className: panelClass, ...panelRest } = panelProps ?? {};

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented || disabled || locked) return;
    ctx?.toggle(value, pressSource(event));
  };

  return (
    <div {...rest} ref={ref} className={cx('salmon-accordion-item', className)} data-state={state} data-disabled={disabled ? '' : undefined}>
      <Heading className="salmon-accordion-heading">
        <button
          type="button"
          {...headerRest}
          id={headerId}
          className={cx('salmon-accordion-trigger', headerClass)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-disabled={disabled || locked ? true : undefined}
          data-state={state}
          onClick={handleClick}
        >
          {icon != null ? (
            <span className="salmon-accordion-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="salmon-accordion-label">{header}</span>
          <span className="salmon-accordion-indicator">{chevron}</span>
        </button>
      </Heading>
      <div {...panelRest} ref={collapse.ref} id={panelId} role="region" aria-labelledby={headerId} className={cx('salmon-accordion-panel', panelClass)} data-state={state}>
        <div className="salmon-accordion-content">{collapse.mounted ? children : null}</div>
      </div>
    </div>
  );
}
