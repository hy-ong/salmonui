'use client';

// Grouping rows of the `grouping` render feature (feature-grouping.ts): group
// caption rows and the group drop area. Reached only through the feature
// (and the public `DataGridGroupCaptionRow` / `DataGridGroupPanel` exports),
// so a grid without `grouping` never loads it. Caption aggregates come from the `aggregates` feature part.

import { memo, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { FocusTarget, GroupRowSnapshot, RowId } from '@salmonui/data-grid/engine';
import { useEngineSelector, useDataGridInstance, useDataGridRender } from './context.js';
import type { DataGridGroupRowProps } from './features/types.js';
import type { DataGridInstance } from './instance.js';
import { customIcon, useDataGridIcons } from './icons.js';
import type { DataGridGroupCaptionContext } from './types.js';

type GroupingFacade<Row> = {
  getGroup(rowId: RowId): GroupRowSnapshot | undefined;
  getGroupRows(rowId: RowId): readonly Row[];
};

function groupingOf<Row>(instance: DataGridInstance<Row>): GroupingFacade<Row> {
  return (instance.engine as unknown as { grouping: GroupingFacade<Row> }).grouping;
}

// ---------------------------------------------------------------------------
// Caption rows
// ---------------------------------------------------------------------------

function useGroupSnapshot<Row>(instance: DataGridInstance<Row>, rowId: RowId): GroupRowSnapshot | undefined {
  const engine = instance.engine;
  const read = (): GroupRowSnapshot | undefined => groupingOf(instance).getGroup(rowId);
  // Server snapshot: what the server rendered, never the live state (hydration).
  const readServer = (): GroupRowSnapshot | undefined => instance.serverRead(`g\u0000${rowId}`, read);
  return useSyncExternalStore((onChange) => engine.subscribeRow(rowId, onChange), read, readServer);
}

function DataGridGroupCaptionRowImpl({ rowId, rowIndex }: DataGridGroupRowProps) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const icons = useDataGridIcons();
  const group = useGroupSnapshot(instance, rowId);
  const columnCount = useEngineSelector(instance, (s) => s.columns.visible.length);
  const firstColumn = useEngineSelector(instance, (s) => s.columns.visible[0]?.columnId ?? '');
  // Roving focus: the caption is the tab stop when the focus target is on this row (any column).
  const interaction = instance.interaction;
  const focusColumnOf = (t: FocusTarget | null): string | null => (t !== null && t.kind === 'cell' && t.rowId === rowId ? t.columnId : null);
  const readFocus = (): string | null => focusColumnOf(interaction.focusTarget());
  const readFocusServer = (): string | null => focusColumnOf(interaction.serverFocusTarget);
  const focusColumn = useSyncExternalStore((onChange) => instance.engine.subscribeModule('focus', onChange), readFocus, readFocusServer);
  if (!group) return <div role="row" aria-rowindex={render.headerRows + rowIndex + 1} className="salmon-data-grid-row" data-row-id={rowId} data-row-index={rowIndex} />;
  // Render-time props (instance.props is synced after the render): a new renderCaption re-renders the captions.
  const caption = render.renderGroupCaption;
  const toggle = (): void => {
    instance.dispatchFrom('pointer', { type: 'grouping.toggle', group: rowId });
  };
  const ctx: DataGridGroupCaptionContext<unknown> = {
    group,
    field: group.columnId,
    header: group.headerText,
    key: group.key,
    value: group.value,
    formattedKey: group.formattedKey,
    count: group.count,
    expanded: group.expanded,
    aggregates: group.aggregates,
    rows: () => groupingOf(instance).getGroupRows(rowId),
    toggle,
  };
  const text = render.text;
  // The `aggregates` feature part (inert `null` without it).
  const CaptionAggregates = instance.features.parts.GroupCaptionAggregates;
  const content: ReactNode = caption ? (
    caption(ctx)
  ) : (
    <>
      <span className="salmon-data-grid-group-caption__label">
        {group.headerText}: {group.formattedKey === '' ? text('blankGroup') : group.formattedKey}
      </span>
      <span className="salmon-data-grid-group-caption__count">
        {' '}- {text('groupItems', { count: group.count })}
      </span>
      {CaptionAggregates ? <CaptionAggregates group={group} /> : null}
    </>
  );
  const lazyState =
    group.status === 'loading' ? (
      <span className="salmon-data-grid-group-caption__status" role="status">
        {text('groupLoading')}
      </span>
    ) : group.status === 'error' ? (
      <span className="salmon-data-grid-group-caption__status" data-error="">
        {text('groupLoadFailed')}{' '}
        <button type="button" className="salmon-data-grid-group-caption__retry" tabIndex={-1} onClick={() => instance.dispatchFrom('pointer', { type: 'grouping.retry', group: rowId })}>
          {text('retry')}
        </button>
      </span>
    ) : group.hasMore && group.expanded ? (
      <button type="button" className="salmon-data-grid-group-caption__more" tabIndex={-1} onClick={() => instance.dispatchFrom('pointer', { type: 'grouping.loadMore', group: rowId })}>
        {text('loadMore')}
      </button>
    ) : null;
  const label = `${group.headerText} ${group.formattedKey}`;
  return (
    <div
      role="row"
      aria-rowindex={render.headerRows + rowIndex + 1}
      className={`salmon-data-grid-row salmon-data-grid-group-caption${render.classNames?.groupCaption ? ` ${render.classNames.groupCaption}` : ''}`}
      style={render.styles?.groupCaption}
      data-row-id={rowId}
      data-row-index={rowIndex}
      data-depth={group.depth}
      data-expanded={group.expanded ? 'true' : 'false'}
      data-status={group.status === 'ready' ? undefined : group.status}
    >
      <div
        role="gridcell"
        aria-colindex={1}
        aria-colspan={Math.max(1, columnCount)}
        // in a role="grid" (not treegrid) a row may not carry aria-expanded, aria-level, aria-setsize or
        // aria-posinset (axe aria-conditional-attr). The focusable caption cell carries the expanded state and
        // describes the level and item count.
        aria-expanded={group.expanded}
        aria-description={text('groupLevel', { level: group.depth + 1, count: group.count })}
        className="salmon-data-grid-cell salmon-data-grid-group-caption__cell"
        data-column-id={focusColumn ?? firstColumn}
        tabIndex={focusColumn !== null ? 0 : -1}
        ref={focusColumn !== null ? interaction.targetRef : undefined}
        style={{ ['--salmon-data-grid-group-depth' as string]: group.depth }}
      >
        <button
          type="button"
          className="salmon-data-grid-group-toggle"
          aria-expanded={group.expanded}
          aria-label={text(group.expanded ? 'collapseGroup' : 'expandGroup', { group: label })}
          tabIndex={-1}
          data-expanded={group.expanded ? '' : undefined}
          data-custom-icon={customIcon(icons, group.expanded ? 'expanded' : 'collapsed')}
          onClick={(event) => {
            event.preventDefault();
            toggle();
          }}
        >
          {icons?.[group.expanded ? 'expanded' : 'collapsed']}
        </button>
        <span className="salmon-data-grid-group-caption__text">{content}</span>
        {lazyState}
      </div>
    </div>
  );
}

/** Group caption row (`role="row"` with one spanning `gridcell`). */
export const DataGridGroupCaptionRow = memo(DataGridGroupCaptionRowImpl);

// ---------------------------------------------------------------------------
// Group drop area
// ---------------------------------------------------------------------------

interface DataGridGroupPanelProps {
  /** The grid's `width` prop, so the panel (a sibling of the root) matches the grid. */
  readonly width?: string | undefined;
  /** The resolved grid direction (the panel is outside the root's `dir`). */
  readonly dir?: 'ltr' | 'rtl' | undefined;
}

function DataGridGroupPanelImpl({ width, dir }: DataGridGroupPanelProps) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const icons = useDataGridIcons();
  const grouping = useEngineSelector(instance, (s) => s.query.grouping);
  const sorting = useEngineSelector(instance, (s) => s.query.sorting);
  const columns = useEngineSelector(instance, (s) => s.columns.byId);
  // Render-time props: a changed `grouping.reorderable` / `showRemoveButton` re-renders the chips.
  const reorder = render.groupChipReorder;
  const showRemove = render.groupChipRemove;
  const directionOf = (columnId: string): 'asc' | 'desc' => sorting.find((s) => s.columnId === columnId)?.direction ?? grouping.find((g) => g.columnId === columnId)?.direction ?? 'asc';
  const flip = (columnId: string, source: 'pointer' | 'keyboard'): void => {
    const next = directionOf(columnId) === 'asc' ? 'desc' : 'asc';
    if (sorting.some((s) => s.columnId === columnId)) instance.dispatchFrom(source, { type: 'sort.column', columnId, direction: next, multi: true });
    else instance.dispatchFrom(source, { type: 'grouping.setDirection', columnId, direction: next });
  };
  const onChipPointerDown = (event: ReactPointerEvent<HTMLElement>, columnId: string, index: number): void => {
    if (!reorder || event.button !== 0 || (event.target as Element).closest('.salmon-data-grid-group-chip__remove')) return;
    const chip = event.currentTarget;
    const panel = chip.parentElement;
    if (!panel) return;
    const startX = event.clientX;
    let dragging = false;
    let to = index;
    const move = (e: PointerEvent): void => {
      if (!dragging) {
        if (Math.abs(e.clientX - startX) < 5) return;
        dragging = true;
        chip.setPointerCapture(e.pointerId);
        chip.dataset['dragging'] = '';
      }
      const chips = [...panel.querySelectorAll<HTMLElement>('.salmon-data-grid-group-chip')];
      to = chips.length - 1;
      for (let i = 0; i < chips.length; i++) {
        const rect = (chips[i] as HTMLElement).getBoundingClientRect();
        if ((e.clientX < rect.left + rect.width / 2) !== instance.rtl) {
          to = i > index ? i - 1 : i;
          break;
        }
      }
      chip.style.transform = `translateX(${e.clientX - startX}px)`;
    };
    const end = (): void => {
      chip.removeEventListener('pointermove', move);
      chip.removeEventListener('pointerup', end);
      chip.removeEventListener('pointercancel', end);
      if (!dragging) return;
      delete chip.dataset['dragging'];
      chip.style.transform = '';
      suppressChipClick = true;
      if (to !== index) instance.dispatchFrom('pointer', { type: 'grouping.move', columnId, toIndex: to });
    };
    chip.addEventListener('pointermove', move);
    chip.addEventListener('pointerup', end);
    chip.addEventListener('pointercancel', end);
  };
  let suppressChipClick = false;
  return (
    <div
      ref={instance.setGroupPanel}
      className={`salmon-data-grid-group-panel${render.classNames?.groupDropArea ? ` ${render.classNames.groupDropArea}` : ''}`}
      style={width === undefined ? render.styles?.groupDropArea : { width, ...render.styles?.groupDropArea }}
      role="region"
      aria-label={render.text('groupPanelLabel')}
      dir={dir}
      data-empty={grouping.length === 0 ? '' : undefined}
      onKeyDown={instance.interaction.onKeyDown}
    >
      {grouping.length === 0 ? (
        <span className="salmon-data-grid-group-panel__hint">{render.text('groupPanel')}</span>
      ) : (
        grouping.map((g, index) => {
          const column = columns.get(g.columnId);
          const header = column?.headerText ?? g.columnId;
          const direction = directionOf(g.columnId);
          // The chip's sort-direction toggle follows `sorting`.
          const showToggle = instance.sortable && column?.flags.allowSorting === true;
          return (
            <div key={g.columnId} className="salmon-data-grid-group-chip" data-column-id={g.columnId} onPointerDown={(e) => onChipPointerDown(e, g.columnId, index)}>
              <button
                type="button"
                className="salmon-data-grid-group-chip__label"
                aria-label={render.text(showToggle ? 'groupChipToggle' : 'groupChip', { column: header, direction: render.text(direction === 'asc' ? 'ascending' : 'descending') })}
                onClick={() => {
                  if (suppressChipClick) {
                    suppressChipClick = false;
                    return;
                  }
                  if (showToggle) flip(g.columnId, 'pointer');
                }}
              >
                {header}
                {showToggle ? (
                  <span className="salmon-data-grid-sort-indicator" data-direction={direction} aria-hidden="true" data-custom-icon={customIcon(icons, direction === 'asc' ? 'sortAscending' : 'sortDescending')}>
                    {icons?.[direction === 'asc' ? 'sortAscending' : 'sortDescending']}
                  </span>
                ) : null}
              </button>
              {showRemove ? (
                <button
                  type="button"
                  className="salmon-data-grid-group-chip__remove"
                  aria-label={render.text('ungroupColumn', { column: header })}
                  tabIndex={-1}
                  onClick={() => instance.dispatchFrom('pointer', { type: 'grouping.ungroup', columnId: g.columnId })}
                  data-custom-icon={customIcon(icons, 'ungroup')}
                >
                  {icons?.ungroup}
                </button>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

/** Group drop area and chips. */
export const DataGridGroupPanel = memo(DataGridGroupPanelImpl);
