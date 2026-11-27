// Paging wiring of the `paging` render feature (feature-paging.tsx): module
// registration, engine options, reactive `paging` options, the pager keys
// and the `paging.syncUrl` binding. Reached only through the feature, so a
// grid without `paging` never loads it or core `paging.ts`.

import { createPagingModule, type DataGridModule } from '@salmonui/data-grid/engine';
import type { DataGridFeatureUi, NormalizedProps } from './features/types.js';
import type { DataGridInstance } from './instance.js';
import { pagingOf } from './query-config.js';
import { mountUrlPaging } from './url-paging.js';

function defined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** The core `paging` module when the prop is set and the app passes none. */
export function pagingModules(props: NormalizedProps, modules: readonly DataGridModule<unknown>[]): readonly DataGridModule<unknown>[] {
  if (!props.paging || modules.some((m) => m.name === 'paging')) return [];
  return [createPagingModule<unknown>() as unknown as DataGridModule<unknown>];
}

/** Engine options of the paging module (`paging: false` keeps its static `{ enabled: false }` in query-config.ts). */
export function pagingEngineOptions(props: NormalizedProps): Record<string, unknown> {
  const p = pagingOf(props);
  return p ? { paging: defined({ enabled: true, pageSize: p.pageSize, page: p.page, totalRowCount: p.totalRowCount }) } : {};
}

/** Reactive `paging` options, compared with the previous prop value (never with engine state). */
function syncPaging(instance: DataGridInstance<unknown>, props: NormalizedProps, prev: NormalizedProps): void {
  const query = instance.query;
  const paging = query.pagingState();
  if (!paging) return;
  const p = pagingOf(props);
  const pp = pagingOf(prev);
  if ((p !== undefined) !== (pp !== undefined) && (p !== undefined) !== paging.enabled) instance.syncDispatch({ type: 'paging.setEnabled', enabled: p !== undefined });
  const total = p?.totalRowCount ?? null;
  if (total !== (pp?.totalRowCount ?? null) && total !== (query.pagingState()?.totalRowCount ?? null)) instance.syncDispatch({ type: 'paging.setTotalRowCount', totalRowCount: total });
  if (p?.pageSize !== undefined && p.pageSize !== pp?.pageSize && p.pageSize !== query.pagingState()?.pageSize) instance.syncDispatch({ type: 'paging.setPageSize', pageSize: p.pageSize });
  if (p?.page !== undefined && p.page !== pp?.page && p.page !== query.pageInfo()?.page) instance.syncDispatch({ type: 'paging.goToPage', page: p.page });
}

type PageCommand = 'paging.previous' | 'paging.next' | 'paging.first' | 'paging.last';
const MIRRORED = { 'paging.previous': 'paging.next', 'paging.next': 'paging.previous' } as const;

/** Pager keys, registered once at creation. */
function registerPagerKeys(instance: DataGridInstance<unknown>): void {
  const page = (type: PageCommand) => (ctx: { readonly nativeEvent: KeyboardEvent }): boolean => {
    const query = instance.query;
    if (!query.pagingState()?.enabled) return false;
    query.pagerFocusPending = true;
    // Right-to-left: ArrowLeft moves forward and ArrowRight back; PageUp/PageDown keep their meaning.
    const key = ctx.nativeEvent.key;
    const mirrored = instance.rtl && (key === 'ArrowLeft' || key === 'ArrowRight') && (type === 'paging.previous' || type === 'paging.next');
    const result = instance.dispatchFrom('keyboard', { type: mirrored ? MIRRORED[type as keyof typeof MIRRORED] : type });
    if (result.status !== 'applied') query.pagerFocusPending = false;
    return true;
  };
  const interaction = instance.interaction;
  interaction.registerKeyHandler('pager.previous', page('paging.previous'));
  interaction.registerKeyHandler('pager.next', page('paging.next'));
  interaction.registerKeyHandler('pager.first', page('paging.first'));
  interaction.registerKeyHandler('pager.last', page('paging.last'));
}

/** The paging controller: pager keys now, prop sync on change, the URL binding after mount. */
export function createPagingUi(instance: DataGridInstance<unknown>): DataGridFeatureUi {
  registerPagerKeys(instance);
  return {
    mount: () => mountUrlPaging(instance),
    sync: (props, prev) => syncPaging(instance, props, prev),
  };
}
