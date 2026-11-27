// `paging.syncUrl`.
// SSR-safe by construction: nothing runs during render or on the server.
// After mount the page parameter of `location.search` is applied as prop
// state (no page events, like `paging.page`); a source that pages remotely
// has no page count before its first result, so a rejected page is retried
// once when the data becomes ready. Page changes are written with
// `history.replaceState`, keeping `history.state` (Next.js App Router keeps
// its router state there), so no history entries are added.

import type { DataGridInstance } from './instance.js';
import { pagingOf } from './query-config.js';

const DEFAULT_PARAM = 'page';

function paramOf(syncUrl: boolean | { readonly param?: string } | undefined): string | null {
  if (!syncUrl) return null;
  return syncUrl === true ? DEFAULT_PARAM : syncUrl.param || DEFAULT_PARAM;
}

/** Parses a page parameter: a positive integer, else null. */
export function parsePageParam(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const page = Number(value);
  return page >= 1 && Number.isSafeInteger(page) ? page : null;
}

/** Wires `paging.syncUrl` after mount; returns the teardown (a no-op when off). */
export function mountUrlPaging<Row>(instance: DataGridInstance<Row>): () => void {
  const param = paramOf(pagingOf(instance.props)?.syncUrl);
  const win = (globalThis as { window?: Window }).window;
  if (param === null || !win || !instance.query.pagingState()) return () => {};
  const engine = instance.engine;
  const offs: (() => void)[] = [];

  const wanted = parsePageParam(new URLSearchParams(win.location.search).get(param));
  if (wanted !== null && wanted !== instance.query.pageInfo()?.page) {
    const result = instance.syncDispatch({ type: 'paging.goToPage', page: wanted });
    if (result.status !== 'applied' && engine.getSnapshot().data.status !== 'ready') {
      let off: (() => void) | null = null;
      off = engine.subscribeSelector(
        (s) => s.data.status,
        (status) => {
          if (status !== 'ready') return;
          off?.();
          off = null;
          if (instance.query.pageInfo()?.page !== wanted) instance.syncDispatch({ type: 'paging.goToPage', page: wanted });
        },
      );
      offs.push(() => off?.());
    }
  }

  offs.push(
    engine.subscribeSelector(
      () => instance.query.pageInfo()?.page ?? 1,
      (page) => {
        // The latest props decide: turning `syncUrl` off stops the writes.
        const current = paramOf(pagingOf(instance.props)?.syncUrl);
        if (current === null) return;
        const url = new URL(win.location.href);
        const text = page > 1 ? String(page) : null;
        if (url.searchParams.get(current) === text) return;
        if (text === null) url.searchParams.delete(current);
        else url.searchParams.set(current, text);
        win.history.replaceState(win.history.state, '', url);
      },
    ),
  );
  return () => {
    for (const off of offs) off();
  };
}
