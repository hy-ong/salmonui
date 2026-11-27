'use client';

// PivotToolbar: a `toolbar` of built-in items
// (field list, totals, formatting, calculated field, export, expand and
// collapse all) and custom items, bound to the shared store. Menus load on
// first open; export and print load the export chunk on first use.

import { lazy, Suspense, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import type { MenuActionEvent, MenuItemData } from '@salmonui/buttons/menu';
import type { PivotController } from './controller.js';
import type { PivotExportWriters } from './export.js';
import { createText, type PivotLocaleText, type PivotText } from './locale.js';
import { rovingKeyDown } from './PivotAxisBar.js';
import type { PivotToolbarItem, PivotToolbarItemId } from './types.js';
import { usePivotState } from './usePivot.js';

const MenuPopup = lazy(() => import('./menu-popup.js'));

export interface PivotToolbarProps<Row = unknown> {
  readonly pivot: PivotController<Row>;
  /** Built-in item ids and custom items, in order. Default `['fieldList', 'totals', 'formatting', 'export']`. */
  readonly items?: readonly (PivotToolbarItemId | PivotToolbarItem)[] | undefined;
  /** Writer loaders for the export menu (Excel and PDF items are disabled without them). */
  readonly exportWriters?: PivotExportWriters | undefined;
  /** Row layout passed to the export writers. */
  readonly layout?: 'compact' | 'tabular' | undefined;
  readonly localeText?: PivotLocaleText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly 'aria-label'?: string | undefined;
}

const DEFAULT_ITEMS: readonly PivotToolbarItemId[] = ['fieldList', 'totals', 'formatting', 'export'];

type MenuId = 'totals' | 'grandTotals' | 'formatting' | 'export';

function menuItems(id: MenuId, pivot: PivotController<unknown>, text: PivotText, writers: PivotExportWriters | undefined): MenuItemData[] {
  const model = pivot.model;
  const mark = (on: boolean, label: string): string => `${on ? '✓ ' : ''}${label}`;
  const grand = (value: string, label: string): MenuItemData => ({ id: `grand:${value}`, label: mark(model.totals.grand === value, label) });
  const grandItems = [grand('both', text('showBoth')), grand('rows', text('showRows')), grand('columns', text('showColumns')), grand('none', text('showNone'))];
  if (id === 'grandTotals') return grandItems;
  if (id === 'totals') {
    const sub = model.totals.sub !== false;
    return [{ id: 'sub', label: mark(sub, text('subtotals')) }, { type: 'group', id: 'grandGroup', label: text('grandTotals'), items: grandItems }];
  }
  if (id === 'formatting') return [{ id: 'numberFormat', label: `${text('numberFormat')}…` }, { id: 'conditionalFormat', label: `${text('conditionalFormat')}…` }, { id: 'calculatedField', label: `${text('calculatedField')}…` }];
  return [
    { id: 'export:xlsx', label: text('exportExcel'), disabled: !writers?.pivot },
    { id: 'export:csv', label: text('exportCsv') },
    { id: 'export:pdf', label: text('exportPdf'), disabled: !writers?.pivot },
    { id: 'export:print', label: text('print') },
  ];
}

const MENU_ITEMS = new Set<string>(['totals', 'grandTotals', 'formatting', 'export']);

/** The toolbar. */
export function PivotToolbar<Row = unknown>(props: PivotToolbarProps<Row>): ReactNode {
  const pivot = props.pivot as PivotController<unknown>;
  const localeText = useLocaleText('pivotTable', props.localeText);
  const text = useMemo(() => createText(localeText), [localeText]);
  // Re-render on model changes so the checked marks are current when a menu opens.
  usePivotState(pivot, (s) => s.model);
  const [open, setOpen] = useState<MenuId | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement | null>());
  const anchor = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const items = props.items ?? DEFAULT_ITEMS;

  const run = (id: string, source: 'pointer' | 'keyboard'): void => {
    if (id === 'fieldList') pivot.openDialog({ kind: 'fieldList' }, source);
    else if (id === 'numberFormat') pivot.openDialog({ kind: 'numberFormat', measure: null }, source);
    else if (id === 'conditionalFormat') pivot.openDialog({ kind: 'conditionalFormat' }, source);
    else if (id === 'calculatedField') pivot.openDialog({ kind: 'calculatedField', name: null }, source);
    else if (id === 'expandAll') pivot.expandAll(undefined, { source });
    else if (id === 'collapseAll') pivot.collapseAll(undefined, { source });
    else if (id === 'subtotals' || id === 'sub') pivot.setTotals({ sub: pivot.model.totals.sub === false }, { source });
    else if (id.startsWith('grand:')) pivot.setTotals({ grand: id.slice(6) as 'both' }, { source });
    else if (id.startsWith('export:')) {
      const format = id.slice(7) as 'xlsx' | 'csv' | 'pdf' | 'print';
      void import('./export-impl.js').then(({ exportPivotTable }) => exportPivotTable(pivot, format, { rowLayout: props.layout ?? 'compact' }, props.exportWriters, text));
    }
  };

  const onAction = (event: MenuActionEvent): void => run(event.id, event.source === 'keyboard' ? 'keyboard' : 'pointer');

  return (
    <div
      role="toolbar"
      aria-label={props['aria-label'] ?? text('toolbar')}
      className={props.className ? `salmon-pivot-table-toolbar ${props.className}` : 'salmon-pivot-table-toolbar'}
      style={props.style}
      data-pivot-fields=""
      onKeyDown={rovingKeyDown}
    >
      {items.map((item, i) => {
        if (typeof item === 'object') {
          if (item.render) return <span key={item.id}>{item.render()}</span>;
          return (
            <button key={item.id} type="button" className="salmon-pivot-table-button" data-pivot-field={item.id} tabIndex={i === 0 ? 0 : -1} disabled={item.disabled} onClick={item.onClick}>
              {item.label ?? item.id}
            </button>
          );
        }
        const isMenu = MENU_ITEMS.has(item);
        const labelKey = item === 'grandTotals' ? 'grandTotals' : item;
        return (
          <button
            key={item}
            type="button"
            id={`${baseId}-${item}`}
            className="salmon-pivot-table-button"
            data-pivot-field={item}
            data-item={item}
            tabIndex={i === 0 ? 0 : -1}
            ref={(el) => {
              triggers.current.set(item, el);
            }}
            aria-haspopup={isMenu ? 'menu' : item === 'fieldList' ? 'dialog' : undefined}
            aria-expanded={isMenu ? open === item : undefined}
            aria-pressed={item === 'subtotals' ? pivot.model.totals.sub !== false : undefined}
            onClick={(event) => {
              const source = event.detail === 0 ? 'keyboard' : 'pointer';
              if (isMenu) {
                anchor.current = triggers.current.get(item) ?? null;
                setOpen(open === item ? null : (item as MenuId));
              } else run(item, source);
            }}
            onKeyDown={(event) => {
              if (isMenu && event.key === 'ArrowDown' && !event.altKey) {
                event.preventDefault();
                anchor.current = triggers.current.get(item) ?? null;
                setOpen(item as MenuId);
              }
            }}
          >
            {text(labelKey as Parameters<PivotText>[0])}
          </button>
        );
      })}
      {open ? (
        <Suspense fallback={null}>
          <MenuPopup
            items={menuItems(open, pivot, text, props.exportWriters)}
            triggerRef={anchor}
            labelledBy={`${baseId}-${open}`}
            onAction={onAction}
            onClose={(returnFocus) => {
              const trigger = anchor.current;
              setOpen(null);
              if (returnFocus) trigger?.focus({ preventScroll: true });
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
