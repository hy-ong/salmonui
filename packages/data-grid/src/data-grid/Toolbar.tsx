'use client';

// DataGrid toolbar: built-in and custom items, roving tabindex with
// ArrowLeft/Right (mirrored in RTL), Home/End, start/center/end alignment,
// a `role="search"` box wired to the search module, and a measured overflow
// menu on narrow widths (observed by the grid's single ResizeObserver).
// Rendered as the previous sibling of `role="grid"` (a grid may own only rows
// and rowgroups); its keys stay inside the toolbar.

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { joinClass } from './Cell.js';
import type { ResolvedToolbarItem } from './chrome.js';
import { useDataGridInstance, useDataGridRender } from './context.js';
import { customIcon, useDataGridIcons } from './icons.js';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { DataGridSearchBox } from './Search.js';
import { editItemDisabled, subscribeToolbarEdit, toolbarEditBits } from './toolbar-edit-state.js';
import type { DataGridProps } from './types.js';

const MORE_WIDTH = 44;

export interface DataGridToolbarProps {
  /** The grid's `width` prop, so the toolbar (a sibling of the root) matches the grid and overflows with it. */
  readonly width?: string | undefined;
  /** The grid's `dir` prop. */
  readonly dir?: DataGridProps<unknown>['dir'] | undefined;
  readonly renderToolbar?: DataGridProps<unknown>['renderToolbar'] | undefined;
  /** `columnChooser={false}` disables the built-in columnChooser item. */
  readonly columnChooser?: DataGridProps<unknown>['columnChooser'] | undefined;
}

/**
 * Props come from the current render: `instance.props` is synced in a layout
 * effect after the render, so reading it here would lag one render behind.
 */
function DataGridToolbarImpl({ width, dir, renderToolbar, columnChooser }: DataGridToolbarProps) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const icons = useDataGridIcons();
  const chrome = instance.chrome;
  const text = render.text;
  const toolbarProp = render.toolbar;
  // Recomputed when the toolbar prop or handler registrations change.
  // Server snapshot: the version the server rendered, frozen until mount (hydration).
  const readServerVersion = (): number => instance.serverRead('toolbar', chrome.getToolbarVersion);
  const version = useSyncExternalStore(chrome.subscribeToolbar, chrome.getToolbarVersion, readServerVersion);
  // edit item enablement follows the edit state, selection, and focus; a small
  // bit mask, so the toolbar re-renders only when an input of the enablement flips.
  const engine = instance.engine;
  const subscribeEdit = useCallback((listener: () => void) => subscribeToolbarEdit(engine, listener), [engine]);
  const editBits = useSyncExternalStore(subscribeEdit, () => toolbarEditBits(engine), () => instance.serverRead('toolbarEdit', () => toolbarEditBits(engine)));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` invalidates enablement
  const items = useMemo(() => chrome.toolbarItems(toolbarProp, text), [chrome, toolbarProp, text, version]);
  // Initial text of the uncontrolled search box (read once, not on every engine change).
  const [initialSearch] = useState(() => instance.engine.getSnapshot().query.search?.text ?? '');
  const [active, setActive] = useState(0);
  const [hiddenFrom, setHiddenFrom] = useState(items.length);
  const ref = useRef<HTMLDivElement | null>(null);
  const widths = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    if (DEV) {
      for (const item of items) {
        if (item.render && item.label === undefined && item.title === undefined) {
          warnOnce(`${instance.gridId}:toolbar-label:${item.id}`, `DataGrid "${instance.gridId}": toolbar item "${item.id}" has a render function but no label; set label (or title) so the overflow menu and assistive technology can name it.`);
        }
      }
    }
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      // Read phase only: cached item widths, one container width read.
      for (const child of el.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
        if (!child.hidden) widths.current.set(child.dataset['toolbarItem'] as string, child.offsetWidth + 4);
      }
      // The search box never overflows (the overflow menu cannot host it): its width is reserved first.
      let available = el.clientWidth - 16;
      for (const item of items) if (item.builtIn === 'search') available -= widths.current.get(item.id) ?? 80;
      let used = 0;
      let fit = items.length;
      const total = items.reduce((sum, item) => (item.builtIn === 'search' ? sum : sum + (widths.current.get(item.id) ?? 80)), 0);
      if (total > available) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i] as ResolvedToolbarItem;
          if (item.builtIn === 'search') continue;
          used += widths.current.get(item.id) ?? 80;
          if (used > available - MORE_WIDTH) {
            fit = i;
            break;
          }
        }
      }
      setHiddenFrom(fit);
    };
    measure();
    return instance.observeElement(el, measure);
  }, [instance, items]);

  const editDisabled = (builtIn: string): boolean | null => editItemDisabled(builtIn, editBits);
  const enabledState = items.map((item) => chrome.toolbarItemState(item, { columnChooser, filtering: render.filtering }, editDisabled));
  const visibleCount = Math.min(hiddenFrom, items.length);
  const overflow = items.slice(visibleCount).filter((item) => item.builtIn !== 'search');
  // Roving stops in DOM order: shown items (the search box always), then the overflow button.
  const stopOf: number[] = [];
  let shown = 0;
  items.forEach((item, i) => {
    stopOf[i] = i < visibleCount || item.builtIn === 'search' ? shown++ : -1;
  });
  const moreStop = shown;
  const stops = shown + (overflow.length ? 1 : 0);
  const current = Math.min(active, Math.max(0, stops - 1));

  const focusStop = (index: number): void => {
    setActive(index);
    const el = ref.current?.querySelector<HTMLElement>(`[data-stop="${index}"]`);
    const target = el?.matches('input, button') ? el : el?.querySelector<HTMLElement>('input, button');
    target?.focus();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // F6 / Shift+F6 leave the toolbar for the next grid region.
    if (instance.interaction.regionKey(event.nativeEvent)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target as HTMLElement;
    const inInput = target.tagName === 'INPUT';
    const forward = instance.rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = instance.rtl ? 'ArrowRight' : 'ArrowLeft';
    let next = -1;
    if (event.key === forward && (!inInput || (target as HTMLInputElement).selectionStart === (target as HTMLInputElement).value.length)) next = (current + 1) % stops;
    else if (event.key === back && (!inInput || (target as HTMLInputElement).selectionStart === 0)) next = (current - 1 + stops) % stops;
    else if (event.key === 'Home' && !inInput) next = 0;
    else if (event.key === 'End' && !inInput) next = stops - 1;
    // Toolbar keys never reach the grid keymap (the toolbar is not a grid region).
    event.stopPropagation();
    if (next < 0) return;
    event.preventDefault();
    focusStop(next);
  };
  // Overflow menu text: `label`, `title`, then a render item's own text or aria-label, then the id.
  const menuLabel = (item: ResolvedToolbarItem): string => {
    if (item.label ?? item.title) return (item.label ?? item.title) as string;
    const el = ref.current?.querySelector(`[data-toolbar-item="${CSS.escape(item.id)}"]`);
    return el?.textContent?.trim() || el?.querySelector('[aria-label]')?.getAttribute('aria-label') || item.id;
  };
  const run = (item: ResolvedToolbarItem, el: Element, index: number, source: 'pointer' | 'keyboard'): void => {
    const state = enabledState[index];
    setActive(stopOf[index] ?? 0);
    // Items disabled by the application do nothing; unavailable built-ins explain why (dev warning).
    if (state?.disabled && state.reason === undefined) return;
    chrome.runToolbarItem(item, el, source);
  };

  const nodes: ReactNode[] = [];
  items.forEach((item, i) => {
    const state = enabledState[i] as { disabled: boolean; reason: string | undefined };
    const hidden = i >= visibleCount && item.builtIn !== 'search';
    const stop = stopOf[i] ?? -1;
    const tab = stop === current ? 0 : -1;
    const label = item.label ?? item.id;
    let node: ReactNode;
    if (item.builtIn === 'search') {
      node = (
        <DataGridSearchBox
          key={item.id}
          className="salmon-data-grid-toolbar__search"
          dataAttributes={{ 'data-toolbar-item': item.id, 'data-stop': stop, 'data-align': item.align ?? 'end' }}
          hidden={hidden}
          tabIndex={tab}
          disabled={state.disabled}
          title={state.reason}
          onFocus={() => setActive(stop)}
          onBeforeSearch={(event) => {
            if (!chrome.toolbarItemClick(item, 'keyboard')) event.preventDefault();
          }}
        />
      );
    } else {
      node = (
        <button
          key={item.id}
          type="button"
          className="salmon-data-grid-toolbar__item"
          tabIndex={tab}
          aria-disabled={state.disabled ? true : undefined}
          title={state.reason ?? item.title}
          // A render item's name when its content has no text (icon-only).
          aria-label={item.render ? item.label : undefined}
          data-toolbar-item={item.id}
          data-stop={stop}
          data-align={item.align ?? 'start'}
          data-builtin={item.builtIn}
          hidden={hidden}
          onFocus={() => setActive(stop)}
          // Enter / Space on a button synthesize a click with `detail === 0`.
          onClick={(e) => run(item, e.currentTarget, i, e.detail === 0 ? 'keyboard' : 'pointer')}
        >
          {item.render ? (
            item.render({ disabled: state.disabled })
          ) : (
            <>
              {item.icon ? (
                <span className="salmon-data-grid-toolbar__icon" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span>{label}</span>
            </>
          )}
        </button>
      );
    }
    nodes.push(node);
  });
  const more = overflow.length ? (
    <button
      key="__more"
      type="button"
      className="salmon-data-grid-toolbar__item salmon-data-grid-toolbar__more"
      aria-haspopup="menu"
      aria-label={text('more')}
      tabIndex={current === moreStop ? 0 : -1}
      data-stop={moreStop}
      onFocus={() => setActive(moreStop)}
      onClick={(e) =>
        chrome.openToolbarOverflow(
          e.currentTarget,
          overflow.map((item) => {
            const s = enabledState[items.indexOf(item)];
            return { id: item.id, label: menuLabel(item), disabled: s?.disabled === true && s.reason === undefined, ...(s?.reason ? { disabledReason: s.reason } : {}) };
          }),
        )
      }
    >
      <span className="salmon-data-grid-toolbar__more-icon" aria-hidden="true" data-custom-icon={customIcon(icons, 'overflow')}>
        {icons?.overflow}
      </span>
    </button>
  ) : null;
  const toolbar = (
    <div
      ref={ref}
      role="toolbar"
      aria-label={text('toolbarLabel')}
      aria-orientation="horizontal"
      dir={dir}
      className={joinClass('salmon-data-grid-toolbar', render.classNames?.toolbar)}
      style={width === undefined ? render.styles?.toolbar : { width, ...render.styles?.toolbar }}
      onKeyDown={onKeyDown}
    >
      {nodes}
      {more}
    </div>
  );
  return renderToolbar ? <>{renderToolbar({ items, defaultToolbar: toolbar, api: instance.api })}</> : toolbar;
}

/** Toolbar part (`toolbar` prop). */
export const DataGridToolbar = memo(DataGridToolbarImpl);
