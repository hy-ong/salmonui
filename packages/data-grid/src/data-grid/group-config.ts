// Grouping wiring of the `grouping` render feature (feature-grouping.ts):
// module registration, engine options, initial grouping, reactive prop sync
// (compared with the previous prop value), the group events
// (`onBeforeGroupChange` / `onGroupChange`, `onBeforeGroupToggle` /
// `onGroupToggle`) and the grouping keys. Reached only through the feature,
// so a grid without `grouping` never loads it or core `grouping.ts`.
// The aggregates half lives in
// aggregate-config.ts. No rendering here.

import {
  createGroupingModule,
  GROUP_ID_PREFIX,
  groupTargetKey,
  type CommandEvent,
  type DataGridCommand,
  type DataGridModule,
  type DataGridQueryInit,
  type GroupDescriptor,
  type GroupRowSnapshot,
  type GroupTarget,
  type GroupingState,
} from '@salmonui/data-grid/engine';
import { gridEvent } from '@salmonui/core/internal/events';
import type { DataGridFeatureUi, NormalizedProps } from './features/types.js';
import { groupingOf, toggleColumnGrouping } from './group-static.js';
import type { DataGridInstance } from './instance.js';
import type { DataGridColumn, DataGridGroupChangeEvent, DataGridGroupToggleEvent, DataGridProps } from './types.js';

/** The core `grouping` module when the trigger holds (`grouping` is set); the instance skips it when the app passes one. */
export function groupingModules(props: NormalizedProps): readonly DataGridModule<unknown>[] {
  return props.grouping ? [createGroupingModule<unknown>() as unknown as DataGridModule<unknown>] : [];
}

/** Engine options of the grouping module (`options.grouping`). */
export function groupingEngineOptions(props: NormalizedProps): Record<string, unknown> {
  const g = groupingOf(props);
  return {
    grouping: g
      ? {
          showGroupedColumns: g.showGroupedColumns ?? false,
          ...(g.defaultExpanded !== undefined ? { defaultExpanded: g.defaultExpanded } : {}),
          ...(g.lazy !== undefined ? { lazy: g.lazy } : {}),
          ...(g.lazyChunkSize !== undefined ? { lazyChunk: g.lazyChunkSize } : {}),
        }
      : {},
  };
}

function leaves<Row>(columns: readonly DataGridColumn<Row>[]): DataGridColumn<Row>[] {
  return columns.flatMap((c) => (c.columns?.length ? leaves(c.columns) : [c]));
}

/** Column id of a grouped `field` (a column `id` or `field`). */
function columnIdOf<Row>(props: DataGridProps<Row>, field: string): string {
  const leaf = leaves(props.columns ?? []).find((c) => c.id === field) ?? leaves(props.columns ?? []).find((c) => c.field === field);
  return leaf ? (leaf.id ?? leaf.field ?? field) : field;
}

/** `grouping.groupBy` as engine descriptors; the direction comes from `sorting.sortBy` for the field. */
function groupDescriptors<Row>(props: DataGridProps<Row>, groupBy: readonly string[]): GroupDescriptor[] {
  const sorting = typeof props.sorting === 'object' ? (props.sorting.sortBy ?? []) : [];
  return groupBy.map((field) => {
    const columnId = columnIdOf(props, field);
    const sort = sorting.find((s) => s.field === field || columnIdOf(props, s.field) === columnId);
    return sort ? { columnId, direction: sort.direction } : { columnId };
  });
}

/** Initial grouping, so the server snapshot already has it. */
export function groupingDefaultQuery(props: NormalizedProps): DataGridQueryInit | undefined {
  const groupBy = groupingOf(props)?.groupBy;
  return groupBy?.length ? { grouping: groupDescriptors(props, groupBy) } : undefined;
}

function sameList(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function groupingState<Row>(instance: DataGridInstance<Row>): GroupingState | undefined {
  return instance.engine.getModuleState<GroupingState>('grouping');
}

/** Syncs the grouping props after a render (layout effect); compared with the previous prop value. */
function syncGrouping(instance: DataGridInstance<unknown>, props: NormalizedProps, prev: NormalizedProps): void {
  const state = groupingState(instance);
  if (!state) return;
  const g = groupingOf(props);
  const p = groupingOf(prev);
  if ((g !== null) !== (p !== null) && (g !== null) !== state.enabled) instance.syncDispatch({ type: 'grouping.setEnabled', enabled: g !== null });
  if (g?.groupBy && !sameList(g.groupBy, p?.groupBy)) {
    const next = groupDescriptors(props, g.groupBy);
    if (JSON.stringify(next.map((d) => d.columnId)) !== JSON.stringify(state.grouping.map((d) => d.columnId))) {
      instance.syncDispatch({ type: 'grouping.set', grouping: next.map((d) => ({ ...d })) });
    }
  }
  if (g && (g.showGroupedColumns ?? false) !== (p?.showGroupedColumns ?? false)) {
    instance.syncDispatch({ type: 'grouping.setOptions', showGroupedColumns: g.showGroupedColumns ?? false });
  }
}

function actionOf(type: string): DataGridGroupChangeEvent['action'] {
  switch (type) {
    case 'grouping.ungroup':
      return 'ungroup';
    case 'grouping.move':
      return 'move';
    case 'grouping.clear':
      return 'clear';
    default:
      return 'group';
  }
}

/** Grouped columns a grouping command proposes (before it commits). */
function proposedGroupBy(current: readonly string[], command: DataGridCommand): readonly string[] {
  const columnId = typeof command['columnId'] === 'string' ? (command['columnId'] as string) : null;
  switch (command.type) {
    case 'grouping.set':
      return ((command['grouping'] as { columnId: string }[] | undefined) ?? []).map((g) => g.columnId);
    case 'grouping.clear':
      return [];
    case 'grouping.ungroup':
      return current.filter((id) => id !== columnId);
    case 'grouping.groupBy': {
      if (columnId === null || current.includes(columnId)) return current;
      const index = typeof command['index'] === 'number' ? (command['index'] as number) : current.length;
      const next = [...current];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, columnId);
      return next;
    }
    case 'grouping.move': {
      const from = columnId === null ? -1 : current.indexOf(columnId);
      if (from < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(Math.max(0, Math.min(Number(command['toIndex']), next.length)), 0, columnId as string);
      return next;
    }
    default:
      return current;
  }
}

/** Commands that change the grouped columns (direction changes are sort changes). */
const GROUPING_CHANGES = new Set(['grouping.set', 'grouping.groupBy', 'grouping.ungroup', 'grouping.clear', 'grouping.move']);
const EXPANSION_CHANGES = new Set(['grouping.toggle', 'grouping.expandAll', 'grouping.collapseAll', 'grouping.setExpanded']);

type GroupingFacade<Row> = { grouping: { getGroup(id: string): GroupRowSnapshot | undefined; getGroupRows(id: string): readonly Row[]; getLazyStatus(): unknown } };

/** Caption row id of a `grouping.toggle` target: a row id, a path key, or a path (`api.toggleGroup([...])`). */
function groupIdOf(target: unknown): string {
  if (typeof target === 'string' && target.startsWith(GROUP_ID_PREFIX)) return target;
  const key = groupTargetKey((target ?? '') as GroupTarget);
  return key === null ? String(target ?? '') : GROUP_ID_PREFIX + key;
}

/** Before/after command hooks of the group events. Event objects are created only for bound handlers. */
function attachGroupEvents<Row>(instance: DataGridInstance<Row>): () => void {
  const engine = instance.engine;
  if (engine.getModuleState('grouping') === undefined) return () => {};
  const facade = (engine as unknown as GroupingFacade<Row>).grouping;
  let before: { state: GroupingState; visible: Map<string, boolean> | null; event: DataGridGroupChangeEvent | null } | null = null;
  const ids = (state: GroupingState): readonly string[] => state.grouping.map((g) => g.columnId);
  const offBefore = engine.onBeforeCommand((event) => {
    const type = event.command.type;
    if (!GROUPING_CHANGES.has(type) && !EXPANSION_CHANGES.has(type)) return;
    const p = instance.props;
    const state = groupingState(instance) as GroupingState;
    const wantsToggle = p.onGroupToggle !== undefined || p.onBeforeGroupToggle !== undefined;
    before = { state, visible: wantsToggle && EXPANSION_CHANGES.has(type) ? visibleCaptions(instance) : null, event: null };
    if (instance.isSyncing()) return;
    const source = instance.currentSource();
    if (GROUPING_CHANGES.has(type) && (p.onBeforeGroupChange || p.onGroupChange)) {
      const field = typeof event.command['columnId'] === 'string' ? (event.command['columnId'] as string) : null;
      const e = gridEvent<DataGridGroupChangeEvent>('beforeGroupChange', source, {
        groupBy: proposedGroupBy(ids(state), event.command),
        previousGroupBy: ids(state),
        action: actionOf(type),
        field,
      });
      p.onBeforeGroupChange?.(e);
      if (e.defaultPrevented) {
        before = null;
        return false;
      }
      before.event = e;
    }
    if (type === 'grouping.toggle' && p.onBeforeGroupToggle) {
      const id = groupIdOf(event.command['group']);
      const group = facade.getGroup(id);
      if (group) {
        const expanded = typeof event.command['expanded'] === 'boolean' ? (event.command['expanded'] as boolean) : !group.expanded;
        const e = toggleEvent(instance, 'beforeGroupToggle', group, expanded);
        p.onBeforeGroupToggle(e);
        if (e.defaultPrevented) {
          before = null;
          return false;
        }
      }
    }
    return undefined;
  });
  const offAfter = engine.onCommand((event: CommandEvent) => {
    const type = event.command.type;
    // Only the grouping command itself consumes `before`: a nested command it
    // dispatches (a selection update for a selected cell range) reports first.
    if (!GROUPING_CHANGES.has(type) && !EXPANSION_CHANGES.has(type)) return;
    if (event.result.status !== 'applied' || !before) return;
    const prev = before;
    before = null;
    if (instance.isSyncing()) return;
    const next = groupingState(instance) as GroupingState;
    const p = instance.props;
    if (GROUPING_CHANGES.has(type)) {
      if (next.grouping !== prev.state.grouping && prev.event && p.onGroupChange) {
        p.onGroupChange(gridEvent<DataGridGroupChangeEvent>('groupChange', prev.event.source, { groupBy: ids(next), previousGroupBy: ids(prev.state), action: prev.event.action, field: prev.event.field }));
      }
      return;
    }
    if (!p.onGroupToggle || !prev.visible) return;
    if (next.expanded === prev.state.expanded && next.defaultExpanded === prev.state.defaultExpanded) return;
    const after = visibleCaptions(instance);
    const changed = type === 'grouping.toggle' ? [groupIdOf(event.command['group'])] : [...new Set([...prev.visible.keys(), ...after.keys()])];
    for (const id of changed) {
      const now = facade.getGroup(id);
      if (!now || prev.visible.get(id) === now.expanded) continue;
      p.onGroupToggle(toggleEvent(instance, 'groupToggle', now, now.expanded));
    }
  });
  return () => {
    offBefore();
    offAfter();
  };
}

function toggleEvent<Row>(instance: DataGridInstance<Row>, type: string, group: GroupRowSnapshot, expanded: boolean): DataGridGroupToggleEvent<Row> {
  const facade = (instance.engine as unknown as GroupingFacade<Row>).grouping;
  const id = group.id;
  return gridEvent<DataGridGroupToggleEvent<Row>>(type, instance.currentSource(), {
    groupId: id,
    path: group.path,
    key: group.key,
    expanded,
    lazy: facade.getLazyStatus() !== null,
    rows: () => facade.getGroupRows(id),
  });
}

/** Expanded flag of the rendered caption rows (event diffs for expand/collapse all). */
function visibleCaptions<Row>(instance: DataGridInstance<Row>): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const { start, end } = instance.layout.getRowWindow();
  const engine = instance.engine as unknown as { grouping?: { getGroup(id: string): GroupRowSnapshot | undefined }; getRowIdAt(i: number): string | undefined };
  for (let i = start; i < end; i++) {
    const id = engine.getRowIdAt(i);
    if (id === undefined || !id.startsWith('__g:')) continue;
    const g = engine.grouping?.getGroup(id);
    if (g) out.set(id, g.expanded);
  }
  return out;
}

const KEY_PRIORITY = 10;

/**
 * Grouping keys through the keymap registry: Ctrl/Cmd+ArrowUp / ArrowDown collapse / expand all, Enter and
 * ArrowLeft / ArrowRight on a caption, Ctrl+Space on a header, Alt+Arrow and
 * Delete on a group chip. Handlers return false when they do not apply so
 * lower-priority handlers (focus moves) run.
 */
function registerGroupKeys<Row>(instance: DataGridInstance<Row>): void {
  if (!instance.groupable) return;
  const interaction = instance.interaction;
  const engine = instance.engine;
  const grouped = (): boolean => engine.getSnapshot().query.grouping.length > 0;
  const caption = (): string | null => {
    const t = interaction.focusTarget();
    const id = t?.kind === 'cell' ? t.rowId : null;
    return id !== null && id.startsWith('__g:') ? id : null;
  };
  const expanded = (id: string): boolean | undefined => (engine as unknown as { grouping: { getGroup(id: string): GroupRowSnapshot | undefined } }).grouping.getGroup(id)?.expanded;
  const register = (command: string, run: (event: KeyboardEvent) => boolean): void => {
    interaction.registerKeyHandler(command, ({ nativeEvent }) => run(nativeEvent), KEY_PRIORITY);
  };
  register('group.collapseAll', () => {
    if (!grouped()) return false;
    instance.dispatchFrom('keyboard', { type: 'grouping.collapseAll' });
    return true;
  });
  register('group.expandAll', () => {
    if (!grouped()) return false;
    instance.dispatchFrom('keyboard', { type: 'grouping.expandAll' });
    return true;
  });
  register('group.toggle', () => {
    const id = caption();
    if (id === null) return false;
    instance.dispatchFrom('keyboard', { type: 'grouping.toggle', group: id });
    return true;
  });
  const setExpanded = (want: boolean): boolean => {
    const id = caption();
    if (id === null || expanded(id) === want) return false;
    instance.dispatchFrom('keyboard', { type: 'grouping.toggle', group: id, expanded: want });
    return true;
  };
  // Tree-view convention, mirrored in RTL: the start-side arrow collapses.
  register('group.collapse', () => setExpanded(instance.rtl));
  register('group.expand', () => setExpanded(!instance.rtl));
  register('header.group', () => {
    const t = interaction.focusTarget();
    if (t?.kind !== 'header') return false;
    const column = engine.getSnapshot().columns.byId.get(t.columnId);
    return column !== undefined && toggleColumnGrouping(instance, column, 'keyboard');
  });
  const chipOf = (event: KeyboardEvent): { columnId: string; index: number } | null => {
    const chip = (event.target as Element | null)?.closest?.<HTMLElement>('.salmon-data-grid-group-chip');
    const columnId = chip?.dataset['columnId'];
    if (columnId === undefined) return null;
    const index = engine.getSnapshot().query.grouping.findIndex((g) => g.columnId === columnId);
    return index < 0 ? null : { columnId, index };
  };
  const moveChip = (event: KeyboardEvent, visualStep: 1 | -1): boolean => {
    const chip = chipOf(event);
    if (!chip || groupingOf(instance.props)?.reorderable !== true) return false;
    const to = chip.index + (instance.rtl ? -visualStep : visualStep);
    if (to < 0 || to >= engine.getSnapshot().query.grouping.length) return true;
    instance.dispatchFrom('keyboard', { type: 'grouping.move', columnId: chip.columnId, toIndex: to });
    const panel = instance.groupPanel;
    requestAnimationFrame(() => panel?.querySelector<HTMLElement>(`.salmon-data-grid-group-chip[data-column-id="${CSS.escape(chip.columnId)}"] .salmon-data-grid-group-chip__label`)?.focus());
    return true;
  };
  register('groupChip.moveLeft', (event) => moveChip(event, -1));
  register('groupChip.moveRight', (event) => moveChip(event, 1));
  register('groupChip.remove', (event) => {
    const chip = chipOf(event);
    if (!chip || groupingOf(instance.props)?.showRemoveButton === false) return false;
    instance.dispatchFrom('keyboard', { type: 'grouping.ungroup', columnId: chip.columnId });
    return true;
  });
}

/** The grouping controller: grouping keys now, prop sync on change, the group events after mount. */
export function createGroupingUi(instance: DataGridInstance<unknown>): DataGridFeatureUi {
  registerGroupKeys(instance);
  return {
    mount: () => attachGroupEvents(instance),
    sync: (props, prev) => syncGrouping(instance, props, prev),
  };
}
