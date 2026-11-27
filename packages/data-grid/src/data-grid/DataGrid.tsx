'use client';

import {
  Profiler,
  use,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { DEV } from '@salmonui/core/internal/dev';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { CompactDensityContext } from '@salmonui/core/internal/theme/density';
import { cardHeight, DataGridAdaptiveContext, useAdaptiveView } from './adaptive-view.js';
import { DataGridBody } from './Body.js';
import { joinClass } from './Cell.js';
import { DataGridLoadingOverlay, useDataGridBusy } from './data-ui.js';
import { DataGridInstanceContext, DataGridRenderContext, useEngineSelector, type DataGridRenderOptions } from './context.js';
import { DataGridIconsProvider } from './icons.js';
import { DataGridHeader } from './Header.js';
import { childrenOf } from './children.js';
import { footerRowCount, groupingOf } from './group-static.js';
import { filterStatusEnabled, searchOf } from './query-config.js';
import { DEFAULT_HEADER_HEIGHT, DEFAULT_ROW_HEIGHT, DataGridInstance } from './instance.js';
import type { DataGridInstanceDev } from './instance-dev.js';
import { DataGridOverlays } from './overlay-slot.js';
import { DataGridOutputStatus } from './OutputStatus.js';
import type { DataGridPagerProps } from './Pager.js';
import { isGroupedView } from './layout.js';
import { DataGridSheetContext } from './sheet.js';
import { DataGridViewEvents } from './view-events.js';
import type { DataGridAggregateRow, DataGridProps } from './types.js';
import { catalogOf, createDataGridText, resolveDir } from './locale-text.js';
import { readFeatures } from '#data-grid-features';
import { requiredFeatures } from './features/detect.js';
import { mergeFeatures, missingFeatures, NO_FEATURES } from './features/inert.js';
import type { DataGridFeature, DataGridFeatureName, DataGridFeatureThenable } from './features/types.js';
import { normalizeProps } from './normalize-props.js';

const FILL_VIEWPORT: CSSProperties = { flex: '1 1 0', minHeight: 0 };

function cssLength(value: number | string | undefined): string | undefined {
  if (value === undefined || value === 'auto') return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}


/**
 * Virtualized data grid (React 19). One scroll container, one `role="grid"`
 * tree, sticky header, frozen columns outside horizontal virtualization.
 * DataGrid state lives in the `@salmonui/data-grid/engine` engine; scroll and drag
 * transients live in a renderer-local layout store and the DOM.
 *
 * Render features: the features the initial props need
 * are computed once. When none is needed, or the `features` prop provides
 * every needed one, the view renders directly with them. Otherwise a gate
 * reads them from the registry (`#data-grid-features`); the grid has no
 * Suspense boundary of its own. The server registry answers synchronously,
 * so the server markup is the plain grid in every SSR mode. While
 * hydrating, a gate whose chunk has not arrived throws the pending load to
 * the nearest ancestor boundary (or the root), which keeps the server HTML
 * and hydrates when the chunk arrives. On a client-only first use the
 * placeholder shows for one chunk round trip.
 */
export function DataGrid<Row>(props: DataGridProps<Row>) {
  // The nearest `LocaleProvider` catalog and locale under the grid's own props (identity-stable while the
  // own `localeText` is, so the engine sync sees no change).
  const localeText = useLocaleText('dataGrid', props.localeText);
  const locale = useLocale(props.locale);
  props = { ...props, localeText, locale } as DataGridProps<Row>;
  // Compact theme density: smaller default row and header heights; explicit props win. Every
  // consumer of the heights (layout, CSS variables, adaptive cards) reads these props.
  const sized = use(CompactDensityContext) ? { ...props, rowHeight: props.rowHeight ?? 32, headerHeight: props.headerHeight ?? 36 } : props;
  const reactId = useId();
  const [gate] = useState(() => {
    const needed = requiredFeatures(normalizeProps(sized as DataGridProps<unknown>));
    return { needed, lazy: missingFeatures(needed, sized.features).length > 0 };
  });
  if (!gate.lazy) {
    const features = gate.needed.length ? (readFeatures(gate.needed, sized.features) as readonly DataGridFeature[]) : (sized.features ?? NO_FEATURES);
    return <DataGridView props={sized} features={features} reactId={reactId} gated={false} />;
  }
  return <DataGridFeatureGate props={sized} needed={gate.needed} reactId={reactId} />;
}

function isThenable(value: readonly DataGridFeature[] | DataGridFeatureThenable): value is DataGridFeatureThenable {
  return typeof (value as { then?: unknown }).then === 'function';
}

/** The provided features plus the loaded ones of a settled set (the provided object wins). */
function withLoaded(needed: readonly DataGridFeatureName[], provided: readonly DataGridFeature[] | undefined, loaded: readonly DataGridFeature[]): readonly DataGridFeature[] {
  return mergeFeatures(needed, provided, (name) => loaded.find((f) => f.name === name));
}

const noop = (): void => {};
const subscribeNever = (): (() => void) => noop;
const isServerSnapshot = (): boolean => true;
const isClientSnapshot = (): boolean => false;

/** True while React hydrates this component (its server snapshot), false in client renders. */
function useHydrating(): boolean {
  return useSyncExternalStore(subscribeNever, isClientSnapshot, isServerSnapshot);
}

function DataGridFeatureGate<Row>({ props, needed, reactId }: { readonly props: DataGridProps<Row>; readonly needed: readonly DataGridFeatureName[]; readonly reactId: string }) {
  const read = readFeatures(needed, props.features);
  const thenable = isThenable(read) ? read : null;
  const hydrating = useHydrating();
  // The load status as an external store, so a client-only render waits without suspending: React throttles the
  // reveal of a Suspense boundary that showed its fallback (about 300 ms), far longer than a chunk round trip.
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      if (thenable?.status === 'pending') thenable.then(onChange, onChange);
      return noop;
    },
    [thenable],
  );
  const statusOf = (): string => thenable?.status ?? 'fulfilled';
  const status = useSyncExternalStore(subscribe, statusOf, statusOf);
  if (!thenable) return <DataGridView props={props} features={read as readonly DataGridFeature[]} reactId={reactId} gated />;
  // Client-only first use: the sized placeholder until the chunk arrives.
  if (status === 'pending' && !hydrating) return <DataGridPlaceholder props={props as DataGridProps<unknown>} />;
  // Hydration suspends the nearest ancestor boundary (or the root) here, which keeps the server HTML until the
  // chunk arrives. The thenable is thrown rather than passed to `use`: if React abandons the hydration and renders
  // on the client, the retry renders the placeholder, which `use` would reject (a component that suspended in
  // `use` must call it again on its retry).
  if (status === 'pending') throw thenable;
  // A rejected load throws its error to the app's error boundary.
  if (status === 'rejected') throw thenable.reason;
  const features = withLoaded(needed, props.features, thenable.value ?? NO_FEATURES);
  return <DataGridView props={props} features={features} reactId={reactId} gated />;
}

/**
 * Sized stand-in while a client-only grid waits for its render feature chunk:
 * the grid root class, `className` / `style`,
 * the resolved height and width, `dir`, the label, `aria-busy` and
 * `data-salmon-pending`. No role, rows, chrome or focusable element; the
 * server never renders it, and hydration never shows it.
 */
export function DataGridPlaceholder({ props }: { readonly props: DataGridProps<unknown> }) {
  const style: CSSProperties = { ...props.style, ...props.styles?.root };
  const width = cssLength(props.width);
  if (width !== undefined) style.width = width;
  const height = props.height ?? 400;
  if (height !== 'auto') style.height = cssLength(height);
  return (
    <div
      className={joinClass('salmon-data-grid', props.classNames?.root, props.className)}
      style={style}
      dir={resolveDir(props.dir, props.locale)}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      aria-busy="true"
      data-salmon-pending=""
    />
  );
}

function DataGridView<Row>({ props, features, reactId, gated }: { readonly props: DataGridProps<Row>; readonly features: readonly DataGridFeature[]; readonly reactId: string; readonly gated: boolean }) {
  // A gated grid (render features) is marked pending in its server markup and while hydrating, so readiness
  // checks (`waitForGridReady`) also wait for a server-rendered grid to hydrate; the mark clears after hydration.
  const hydrating = useHydrating() && gated;
  // Created once from the initial props; later changes are synced in effects.
  const [instance] = useState(() => new DataGridInstance<Row>(props, reactId, features));
  const layout = instance.layout;

  useLayoutEffect(() => {
    instance.syncProps(props);
    // After commit: warnings queued by this render's column compile (never during render).
    instance.flushWarnings();
  });
  useLayoutEffect(() => instance.mount(), [instance]);
  useImperativeHandle(props.ref, () => instance.api, [instance]);

  // useCallback: a new ref callback identity would detach and re-attach the root on every render.
  const rootRef = useCallback(
    (el: HTMLDivElement | null) => {
      instance.setRoot(el);
      return () => instance.setRoot(null);
    },
    [instance],
  );
  // `<DataGridAggregateRow>` children win over the `aggregates` prop (aria-rowcount counts their footer rows).
  const { children, aggregates: aggregatesProp } = props;
  const aggregates = useMemo(() => (childrenOf(children).aggregates as readonly DataGridAggregateRow<Row>[] | null) ?? aggregatesProp, [children, aggregatesProp]);

  const columnLayout = useSyncExternalStore(layout.subscribe, layout.getColumnLayout, layout.getServerColumnLayout);
  const rowCount = useEngineSelector(instance, (s) => s.rows.count);
  // Grouped models only: detail rows also wrap the model in a view.
  const grouped = useEngineSelector(instance, (s) => isGroupedView(s.rows.view));
  const columnCount = useEngineSelector(instance, (s) => s.columns.visible.length);
  const busy = useDataGridBusy(instance as unknown as DataGridInstance<unknown>);
  const headerDepth = useEngineSelector(instance, (s) => Math.max(1, s.columns.headerRowCount));
  // Text follows the engine catalog and locale (localeText.set, setLocale).
  const catalog = useEngineSelector(instance, (s) => catalogOf(s as never));
  const locale = useEngineSelector(instance, (s) => s.locale);
  const text = useMemo(() => createDataGridText(catalog, locale), [catalog, locale]);
  // `search.highlight`: one highlighter per applied search; the selector is a constant null while off.
  const highlight = searchOf(props)?.highlight === true;
  const searchDescriptor = useEngineSelector(instance, (s) => (highlight ? s.query.search : null));
  const searchLeaves = useEngineSelector(instance, (s) => (highlight ? s.columns.leaves : null));
  // The `search` feature owns the highlighter (inert: a constant null).
  const searchHighlighter = instance.features.selectors.searchHighlighter;
  const searchHighlight = useMemo(
    () => (searchDescriptor && searchLeaves ? searchHighlighter(searchDescriptor, instance.engine.getSnapshot().columns as never) : null),
    [instance, searchHighlighter, searchDescriptor, searchLeaves],
  );
  // The toolbar part, installed late too; the server snapshot is the creation part, so
  // hydration renders what the server rendered.
  const Toolbar = useSyncExternalStore(instance.subscribeColumnRender, instance.getToolbarPart, instance.getServerToolbarPart);
  const direction = instance.resolvedDir(props);
  const { columnMenu, filtering, toolbar } = props;
  const filterBar = instance.chrome.filterBarEnabled(props);
  const headerRows = headerDepth + (filterBar ? 1 : 0);
  const frozenTop = Math.max(0, Math.floor(props.stickyRows ?? 0));
  const frozenBottom = Math.max(0, Math.floor(props.stickyBottomRows ?? 0));
  useLayoutEffect(() => {
    layout.setHeaderRows(headerRows);
  }, [layout, headerRows]);
  // Adaptive UI: a projection of the measured container width; null when the prop is off.
  const adaptive = useAdaptiveView(instance, props.adaptive);
  const rowHeight = props.rowHeight ?? DEFAULT_ROW_HEIGHT;
  const headerHeight = props.headerHeight ?? DEFAULT_HEADER_HEIGHT;
  const cardRowHeight = adaptive?.vertical ? cardHeight(columnCount, rowHeight) : null;
  useLayoutEffect(() => {
    layout.setRowHeightOverride(cardRowHeight);
  }, [layout, cardRowHeight]);
  const interaction = instance.interaction;
  // Initial settings only (the engine owns them afterwards); stable across renders.
  const selectionSettings = interaction.selectionState()?.options;
  const multiselectable = selectionSettings?.enabled === true && selectionSettings.type === 'multiple';

  const { renderRow, renderEmpty, getRowProps, rowClassName, getCellProps, classNames, styles, textWrap, mergeCells, overflow } = props;
  const cellRangeBorder = typeof props.selection === 'object' && props.selection.cellRange === 'boxWithBorder';
  const headerGroupToggle = instance.groupable && groupingOf(props)?.showHeaderToggle === true;
  const sortIndicators = typeof props.sorting === 'object' && props.sorting.indicators === 'always';
  const groupChipRemove = groupingOf(props)?.showRemoveButton !== false;
  const groupChipReorder = groupingOf(props)?.reorderable === true;
  const renderGroupCaption = groupingOf(props)?.renderCaption;
  const resizable = props.resizable ?? false;
  const reorderable = props.reorderable ?? false;
  // useMemo: the context value must keep its identity while these props do,
  // otherwise every cell would re-render on any parent render.
  const render = useMemo<DataGridRenderOptions<Row>>(
    () => ({
      renderRow, renderEmpty, getRowProps, rowClassName, getCellProps, classNames, styles, textWrap, resizable, reorderable, overflow, headerRows, mergeCells,
      columnMenu, filtering, toolbar, filterBar, frozenTop, frozenBottom, cellRangeBorder, headerGroupToggle, sortIndicators, groupChipRemove, groupChipReorder, renderGroupCaption, text, searchHighlight,
    }),
    [
      renderRow, renderEmpty, getRowProps, rowClassName, getCellProps, classNames, styles, textWrap, resizable, reorderable, overflow, headerRows, mergeCells,
      columnMenu, filtering, toolbar, filterBar, frozenTop, frozenBottom, cellRangeBorder, headerGroupToggle, sortIndicators, groupChipRemove, groupChipReorder, renderGroupCaption, text, searchHighlight,
    ],
  );

  const { paging, renderPager } = props;
  const filterStatus = filterStatusEnabled(filtering);
  const pagerProps = useMemo<DataGridPagerProps>(() => ({ paging, renderPager, filterStatus }) as DataGridPagerProps, [paging, renderPager, filterStatus]);

  const rootStyle: CSSProperties = {
    ...props.style,
    ...styles?.root,
    ...(columnLayout.cssVars as CSSProperties),
    ['--salmon-data-grid-row-height' as string]: `${rowHeight}px`,
    ['--salmon-data-grid-header-height' as string]: `${headerHeight}px`,
  };
  if (cardRowHeight !== null) (rootStyle as Record<string, string>)['--salmon-data-grid-card-height'] = `${cardRowHeight}px`;
  if (headerRows > 1) (rootStyle as Record<string, string>)['--salmon-data-grid-header-total-height'] = `${headerRows * headerHeight}px`;
  const width = cssLength(props.width);
  if (width !== undefined) rootStyle.width = width;
  const height = props.height ?? 400;
  // A percentage height resolves against the parent: the root takes it and the viewport fills the root
  // (a percentage on the size-contained viewport alone would resolve against the auto-height root, i.e. 0 px).
  const fillHeight = typeof height === 'string' && height.includes('%');
  if (fillHeight) rootStyle.height = height;
  const wrap = textWrap === true ? 'both' : textWrap || undefined;
  // The `editing` and `rowDrag` features own these parts (inert `null` without them).
  const { EditSlot, RowDragLayer } = instance.features.parts;

  // The `aggregates` render feature owns the footer rows (inert `null` without it).
  const FooterRows = instance.features.parts.FooterRows;
  const grid: ReactNode = (
    <div
      ref={rootRef}
      id={instance.gridId}
      role={instance.features.selectors.treeRow ? 'treegrid' : 'grid'}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      aria-describedby={props['aria-describedby']}
      aria-rowcount={headerRows + rowCount + footerRowCount(aggregates)}
      aria-colcount={columnCount}
      aria-busy={busy || undefined}
      aria-multiselectable={multiselectable || undefined}
      data-salmon-pending={hydrating ? '' : undefined}
      dir={direction}
      className={joinClass('salmon-data-grid', classNames?.root, props.className)}
      style={rootStyle}
      data-grid-lines={props.gridLines && props.gridLines !== 'default' ? props.gridLines : undefined}
      data-hover={props.highlightOnHover === false ? undefined : ''}
      data-striped={props.striped === false ? undefined : ''}
      data-text-wrap={wrap}
      data-measure-rows={layout.config.measureRows ? '' : undefined}
      data-auto-height={height === 'auto' ? '' : undefined}
      data-grouped={grouped ? '' : undefined}
      data-adaptive={adaptive?.active ? '' : undefined}
      data-row-layout={adaptive?.vertical ? 'vertical' : undefined}
      onPointerOver={instance.onPointerOver}
      onPointerDown={adaptive ? instance.adaptive?.onPointerDown : undefined}
      onPointerMove={adaptive ? instance.adaptive?.onPointerMove : undefined}
      onPointerUp={adaptive ? instance.adaptive?.onPointerEnd : undefined}
      onPointerCancel={adaptive ? instance.adaptive?.onPointerEnd : undefined}
      onClickCapture={adaptive ? instance.adaptive?.onClickCapture : undefined}
      onContextMenuCapture={adaptive ? instance.adaptive?.onContextMenuCapture : undefined}
      onKeyDown={interaction.onKeyDown}
      onFocus={interaction.onFocus}
      onMouseDown={interaction.onMouseDown}
      onClick={interaction.onClick}
      onContextMenu={props.contextMenu ? instance.chrome.onContextMenu : undefined}
    >
      <div className="salmon-data-grid-viewport" ref={instance.setViewport} style={height === 'auto' ? undefined : fillHeight ? FILL_VIEWPORT : { height: cssLength(height) }}>
        <DataGridHeader />
        {EditSlot && instance.editing.active ? <EditSlot part="top" /> : null}
        <DataGridBody />
        {EditSlot && instance.editing.active ? <EditSlot part="bottom" /> : null}
        {FooterRows ? <FooterRows /> : null}
      </div>
      <DataGridLoadingOverlay indicator={props.loadingIndicator} renderLoading={props.renderLoading} className={classNames?.loading} style={styles?.loading} />
      <div className="salmon-data-grid-drop-indicator" ref={instance.setIndicator} aria-hidden="true" />
      <div className="salmon-data-grid-drag-preview" ref={instance.setPreview} aria-hidden="true" />
      {RowDragLayer && instance.rowDragUi.enabled ? <RowDragLayer /> : null}
    </div>
  );
  // The toolbar is the previous sibling of role="grid": a toolbar owned by a grid fails aria-required-children.
  // DOM order keeps the Tab flow (toolbar, then the grid's single tab stop).
  // The `toolbar` render feature owns the part (inert `null` without it, also until a late enable installs it).
  const toolbarPart: ReactNode =
    Toolbar && (props.toolbar?.length || props.renderToolbar) ? <Toolbar width={width} dir={props.dir} renderToolbar={props.renderToolbar as DataGridProps<unknown>['renderToolbar']} columnChooser={props.columnChooser} /> : null;
  // The adaptive bar is a sibling of role="grid" (a grid may own rows and rowgroups only).
  // The `adaptive` render feature owns the bar and the sheet slot (inert `null` without it).
  const { AdaptiveBar, AdaptiveOverlays } = instance.features.parts;
  const adaptiveBar: ReactNode = adaptive?.active && AdaptiveBar ? <AdaptiveBar view={adaptive} /> : null;
  // The group drop area is a sibling before role="grid" too (a region owned by a grid fails aria-required-children);
  // DOM order keeps the Tab flow (toolbar, group chips, then the grid's single tab stop).
  // The `grouping` render feature owns the part (inert `null` without it).
  const GroupPanel = instance.features.parts.GroupPanel;
  const groupPanel: ReactNode = GroupPanel && instance.groupable && groupingOf(props)?.showDropArea !== false ? <GroupPanel width={width} dir={direction} /> : null;
  // The pager is a sibling of role="grid" too: a navigation landmark inside the grid fails aria-required-children.
  // Render-time paging props: the memoized pager re-renders when `paging` or `renderPager` changes.
  // The `paging` render feature owns the part (inert `null` without it).
  const Pager = instance.features.parts.Pager;
  const pager: ReactNode = Pager && instance.query.pagingState() ? <Pager pagerProps={pagerProps} /> : null;
  // Live regions are siblings of role="grid": grid may only own rows and rowgroups (axe aria-required-children).
  const regions: ReactNode = (
    <>
      <div className="salmon-data-grid-live" role="status" aria-live="polite" aria-atomic="true" ref={interaction.setLiveRegion} />
      <div className="salmon-data-grid-live salmon-data-grid-live-assertive" role="alert" aria-atomic="true" ref={interaction.setAlertRegion} />
      <DataGridOutputStatus />
    </>
  );

  // Adaptive mode turns every overlay into a full-screen (dialog) or bottom (menu) sheet.
  const overlays: ReactNode = (
    <DataGridSheetContext value={adaptive?.sheet ?? null}>
      <DataGridOverlays />
      {EditSlot && instance.editing.active ? <EditSlot part="overlays" /> : null}
      {adaptive && AdaptiveOverlays ? <AdaptiveOverlays /> : null}
    </DataGridSheetContext>
  );

  return (
    <DataGridInstanceContext value={instance as unknown as DataGridInstance<unknown>}>
      <DataGridRenderContext value={render as unknown as DataGridRenderOptions<unknown>}>
      <DataGridIconsProvider icons={props.icons}>
      <DataGridAdaptiveContext value={adaptive}>
        {DEV ? (
          <Profiler id={instance.gridId} onRender={(instance.dev as DataGridInstanceDev<Row>).onProfilerRender}>
            {toolbarPart}
            {adaptiveBar}
            {groupPanel}
            {grid}
            {pager}
            {regions}
            {overlays}
            {props.onViewChange ? <DataGridViewEvents /> : null}
          </Profiler>
        ) : (
          <>
            {toolbarPart}
            {adaptiveBar}
            {groupPanel}
            {grid}
            {pager}
            {regions}
            {overlays}
            {props.onViewChange ? <DataGridViewEvents /> : null}
          </>
        )}
      </DataGridAdaptiveContext>
      </DataGridIconsProvider>
      </DataGridRenderContext>
    </DataGridInstanceContext>
  );
}
