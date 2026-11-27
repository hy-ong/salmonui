'use client';

// Context menu chunk: the public `ContextMenu`
// (`@salmonui/buttons/menu`) bound to the Scheduler root. Right-click, touch
// long-press, Shift+F10 and the ContextMenu key on a cell or an event open
// it; `contextMenu` gives the items (the defaults below, an array, or a
// function of the target), `onContextMenuItemClick` reports the choice and
// the default items run their action unless prevented. Lazy: loaded when the
// browser is idle after mount, at once on the first request before that
// (Scheduler.tsx keeps the request and this chunk opens it on mount). The
// menu's rules are `menu/styles.css`.

import { useLayoutEffect, useState, type RefObject } from 'react';
import { ContextMenu } from '@salmonui/buttons/menu';
import { themeScopeOf } from '@salmonui/core/internal/overlay';
import type { CellSelection } from '../internal/scheduler/store.js';
import type { Occurrence } from '../internal/scheduler/types.js';
import type { SchedulerContextValue } from './context.js';
import type { SchedulerContextMenuContext, SchedulerContextMenuItemClickEvent, SchedulerEventInfo, SchedulerEventSource, SchedulerMenuItem } from './types.js';

/** A menu request made before this chunk loaded (Scheduler.tsx). */
export interface MenuRequest {
  readonly x: number;
  readonly y: number;
  readonly target: Element;
}

/** What the chunk needs from the Scheduler render (read at call time). */
export interface MenuHost {
  find(key: string): Occurrence<unknown> | null;
  info(o: Occurrence<unknown>): SchedulerEventInfo<unknown>;
  readonly can: { readonly add: boolean; readonly edit: boolean; readonly delete: boolean };
  openEditor(o: null, cells: CellSelection, mode: 'add', source: SchedulerEventSource, scope: 'series', title: string, rule?: string): void;
  edit(o: Occurrence<unknown>, source: SchedulerEventSource): void;
  remove(o: Occurrence<unknown>, source: SchedulerEventSource): void;
  today(source: SchedulerEventSource): void;
}

interface Open {
  readonly ctx: SchedulerContextMenuContext<unknown>;
  readonly occ: Occurrence<unknown> | null;
  readonly items: readonly SchedulerMenuItem[];
  readonly point: { readonly x: number; readonly y: number };
  /** Portal target: the Scheduler's theme scope (or modal dialog), read at open time. */
  readonly scope: Element | undefined;
}

const EMPTY: readonly SchedulerMenuItem[] = [];

/** `ctx` is the Scheduler context value (a prop, so this chunk shares no module with the view chunks). */
export function SchedulerContextMenu(props: { readonly ctx: SchedulerContextValue; readonly host: MenuHost; readonly pending: MenuRequest | null }) {
  const { root, props: p, t, store } = props.ctx;
  const [open, setOpen] = useState<Open | null>(null);
  const { host } = props;

  /** The target's context and items, or null (no cell or event, or no items: the browser menu shows). */
  const resolve = (target: Element, point: { readonly x: number; readonly y: number }): Open | null => {
    const cfg = p.contextMenu;
    if (!cfg || target.closest('input, textarea, [contenteditable="true"]')) return null;
    const evEl = target.closest('.salmon-scheduler__event[data-key]');
    const cellEl = evEl ? null : target.closest<HTMLElement>('[data-cell-start]');
    let ctx: SchedulerContextMenuContext<unknown>;
    let occ: Occurrence<unknown> | null = null;
    let defaults: SchedulerMenuItem[];
    if (evEl) {
      occ = host.find(evEl.getAttribute('data-key') as string);
      if (!occ) return null;
      ctx = { kind: 'event', occurrence: host.info(occ), row: occ.event.row, element: evEl };
      defaults = [
        { id: 'edit', label: t('edit'), disabled: !host.can.edit || occ.event.readOnly || occ.event.block },
        { id: 'delete', label: t('delete'), disabled: !host.can.delete || occ.event.readOnly },
      ];
    } else if (cellEl) {
      // A right-click inside the selected cell range acts on the whole range.
      const start = Number(cellEl.dataset['cellStart']);
      const allDay = cellEl.hasAttribute('data-all-day-cell');
      const key = cellEl.closest('[data-resource]')?.getAttribute('data-resource') ?? null;
      const sel = store.getSnapshot().selectedCells;
      const inSel = sel && sel.allDay === allDay && (sel.group ?? null) === key && start >= sel.start && start < sel.end;
      ctx = {
        kind: 'cell',
        start: new Date(inSel ? sel.start : start),
        end: new Date(inSel ? sel.end : Number(cellEl.dataset['cellEnd'])),
        allDay,
        resources: key === null ? null : resourcesOf(key, p.grouping?.resources ?? [], p.resources ?? []),
        element: cellEl,
      };
      defaults = [
        { id: 'newEvent', label: t('newEvent'), disabled: !host.can.add },
        { id: 'newRecurringEvent', label: t('newRecurringEvent'), disabled: !host.can.add },
        { id: 'today', label: t('today') },
      ];
    } else return null;
    const items = cfg === true ? defaults : typeof cfg === 'function' ? (cfg(ctx) ?? EMPTY) : cfg;
    return items.length ? { ctx, occ, items, point, scope: themeScopeOf(target) } : null;
  };

  // A request from before this chunk loaded opens on mount.
  useLayoutEffect(() => {
    const r = props.pending;
    if (r && r.target.isConnected) setOpen(resolve(r.target, r));
    // Mount only: later requests come through ContextMenu's own listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (id: string, o: Open, source: SchedulerEventSource): void => {
    const c = o.ctx;
    if (c.kind === 'cell') {
      const cells: CellSelection = { start: c.start.getTime(), end: c.end.getTime(), allDay: c.allDay, ...(c.resources ? { resources: c.resources } : {}) };
      if (id === 'newEvent') host.openEditor(null, cells, 'add', source, 'series', '');
      else if (id === 'newRecurringEvent') host.openEditor(null, cells, 'add', source, 'series', '', 'FREQ=DAILY');
      else if (id === 'today') host.today(source);
    } else if (o.occ) {
      if (id === 'edit') host.edit(o.occ, source);
      else if (id === 'delete') host.remove(o.occ, source);
    }
  };

  return (
    <ContextMenu
      targetRef={root as RefObject<HTMLElement | null>}
      open={open !== null}
      anchorPoint={open?.point}
      container={open?.scope ?? null}
      items={open?.items ?? EMPTY}
      localeText={{ label: t('label') }}
      onBeforeOpen={(e) => {
        const next = resolve(e.target, e.point);
        if (next) setOpen(next);
        else e.preventDefault();
      }}
      onOpenChange={(next) => {
        if (!next) setOpen(null);
      }}
      onAction={(e) => {
        if (!open) return;
        let prevented = false;
        const source: SchedulerEventSource = e.source;
        const ev: SchedulerContextMenuItemClickEvent<unknown> = {
          type: 'contextMenuItemClick',
          source,
          id: e.id,
          item: e.item,
          context: open.ctx,
          get defaultPrevented() {
            return prevented;
          },
          preventDefault() {
            prevented = true;
          },
        };
        p.onContextMenuItemClick?.(ev);
        if (!prevented) run(e.id, open, source);
      }}
    />
  );
}

/** Resource ids per event field of a group key (`id/id/...` along `grouping.resources`). */
function resourcesOf(key: string, levels: readonly string[], defs: readonly { readonly name: string; readonly field: string; readonly idField?: string | undefined; readonly data: readonly object[] }[]): Readonly<Record<string, readonly unknown[]>> | null {
  const out: Record<string, readonly unknown[]> = {};
  const segs = key.split('/');
  segs.forEach((seg, i) => {
    const def = defs.find((d) => d.name === levels[i]) ?? (levels.length ? undefined : defs[0]);
    const item = def?.data.find((it) => String((it as Record<string, unknown>)[def.idField ?? 'id']) === seg) as Record<string, unknown> | undefined;
    if (def && item) out[def.field] = [item[def.idField ?? 'id']];
  });
  return Object.keys(out).length ? out : null;
}
