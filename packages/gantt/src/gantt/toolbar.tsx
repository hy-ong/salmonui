'use client';

// Gantt toolbar: the built-in items run the matching
// `GanttApi` method, custom items fire `onToolbarItemClick` only. APG
// toolbar: one tab stop, arrow keys move between items (internal roving).

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { gridEvent } from '@salmonui/core/internal/events';
import type { GanttInstance } from './instance.js';
import type { GanttLocaleKey } from './locale.js';
import type { GanttApi, GanttToolbarItem, GanttToolbarItemClickEvent, GanttToolbarItemId } from './types.js';

const BUILT_IN = new Set<string>(['add', 'edit', 'update', 'delete', 'cancel', 'expandAll', 'collapseAll', 'search', 'previousTimeSpan', 'nextTimeSpan', 'zoomIn', 'zoomOut', 'zoomToFit', 'indent', 'outdent', 'criticalPath', 'excelExport', 'csvExport', 'pdfExport', 'undo', 'redo']);

/** Runs a built-in toolbar item. */
export function runToolbarItem<Row>(g: GanttInstance<Row>, api: GanttApi<Row>, id: GanttToolbarItemId): void {
  const sel = g.selectedId();
  switch (id) {
    case 'add':
      if (typeof g.props.editing === 'object' && g.props.editing.mode === 'dialog') api.openAddDialog();
      else api.addTask(undefined, sel ? { position: 'below', targetId: sel } : { position: 'top' });
      break;
    case 'edit':
      if (sel) api.openEditDialog(sel);
      break;
    case 'update':
      void g.gridApi?.save?.();
      break;
    case 'cancel':
      api.cancelEdit();
      break;
    case 'delete':
      if (sel) api.deleteTasks((g.gridApi?.getSelectedRowIds() ?? [sel]).map(String));
      break;
    case 'expandAll':
      api.expandAll();
      break;
    case 'collapseAll':
      api.collapseAll();
      break;
    case 'previousTimeSpan':
    case 'nextTimeSpan': {
      const el = g.chartScroll;
      if (!el) break;
      const left = Math.abs(el.scrollLeft);
      const step = el.clientWidth;
      if (id === 'previousTimeSpan' && left <= 0) api.extendTimeline('start');
      else if (id === 'nextTimeSpan' && left + step >= el.scrollWidth - 1) api.extendTimeline('end');
      queueMicrotask(() => g.setScrollLeft(Math.max(0, Math.abs(el.scrollLeft) + (id === 'nextTimeSpan' ? step : -step))));
      break;
    }
    case 'zoomIn':
      api.zoomIn();
      break;
    case 'zoomOut':
      api.zoomOut();
      break;
    case 'zoomToFit':
      api.zoomToFit();
      break;
    case 'indent':
      if (sel) api.indent([sel]);
      break;
    case 'outdent':
      if (sel) api.outdent([sel]);
      break;
    case 'criticalPath':
      g.toggleCriticalPath();
      break;
    case 'excelExport':
      void api.exportToExcel().then((f) => f && g.download(f));
      break;
    case 'csvExport':
      void api.exportToCsv().then((f) => f && g.download(f));
      break;
    case 'pdfExport':
      void api.exportToPdf().then((f) => f && g.download(f));
      break;
    case 'undo':
      api.undo();
      break;
    case 'redo':
      api.redo();
      break;
    case 'search':
      break;
  }
}

function disabledOf<Row>(g: GanttInstance<Row>, id: string): boolean {
  const editable = g.editable();
  const sel = g.selectedId() !== null;
  switch (id) {
    case 'add':
      return !editable;
    case 'edit':
    case 'delete':
    case 'indent':
    case 'outdent':
      return !editable || !sel;
    case 'undo':
      return !g.history || g.history.getUndoActions().length === 0;
    case 'redo':
      return !g.history || g.history.getRedoActions().length === 0;
    case 'excelExport':
      return !g.props.exportWriters?.excel;
    case 'pdfExport':
      return !g.props.exportWriters?.pdf;
    default:
      return false;
  }
}

export function GanttToolbar<Row>({ g, api, items }: { g: GanttInstance<Row>; api: GanttApi<Row>; items: readonly GanttToolbarItem[] }): ReactNode {
  useSyncExternalStore(g.subscribe, g.getVersion, g.getVersion);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const click = (id: string): void => {
    const e = gridEvent<GanttToolbarItemClickEvent>('toolbarItemClick', 'pointer', { item: id });
    g.props.onToolbarItemClick?.(e);
    if (e.defaultPrevented || !BUILT_IN.has(id)) return;
    runToolbarItem(g, api, id as GanttToolbarItemId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).tagName === 'INPUT' && e.key !== 'Tab') return;
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>('[data-toolbar-item]') ?? [])];
    const at = buttons.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const rtl = g.isRtl();
    let next = at;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (at + 1) % buttons.length;
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (at - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    buttons[next]?.focus();
  };
  return (
    <div ref={ref} className="salmon-gantt__toolbar" role="toolbar" aria-label={g.text('toolbar')} onKeyDown={onKeyDown}>
      {items.map((item, i) => {
        const id = typeof item === 'string' ? item : item.id;
        const custom = typeof item === 'object' ? item : null;
        if (custom?.render) return <span key={id} className="salmon-gantt__toolbar-custom" data-align={custom.align}>{custom.render()}</span>;
        if (id === 'search') {
          return (
            <input
              key={id}
              type="search"
              data-toolbar-item=""
              tabIndex={i === active ? 0 : -1}
              className="salmon-gantt__toolbar-search"
              aria-label={g.text('search')}
              placeholder={g.text('search')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                g.gridApi?.search(e.target.value);
              }}
            />
          );
        }
        const label = custom?.text ?? (BUILT_IN.has(id) ? g.text(id as GanttLocaleKey) : id);
        const pressed = id === 'criticalPath' ? g.critical !== null && (g.props.criticalPath ?? g.criticalToggled) : undefined;
        return (
          <button
            key={id}
            type="button"
            data-toolbar-item={id}
            className="salmon-gantt__toolbar-item"
            tabIndex={i === active ? 0 : -1}
            disabled={custom?.disabled ?? disabledOf(g, id)}
            aria-pressed={pressed}
            data-align={custom?.align}
            onClick={() => click(id)}
          >
            {custom?.icon ?? null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
