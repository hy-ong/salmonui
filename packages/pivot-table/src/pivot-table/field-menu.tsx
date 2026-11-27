'use client';

// Field menu of the axis bar and the field list (lazy chunk, loaded on the
// first open): sort, filter, group, aggregation, number format, "Move to"
// (the keyboard and touch alternative to drag and drop), move up / down and
// remove. Built on the Menu family popup.

import type { RefObject } from 'react';
import type { PivotAggregate } from '@salmonui/pivot-table/engine';
import { useMenuPopup } from '@salmonui/buttons/internal/menu-popup';
import type { MenuActionEvent, MenuItemData } from '@salmonui/buttons/menu';
import type { PivotController } from './controller.js';
import type { PivotText } from './locale.js';
import { AGGREGATE_LABELS, axisItems, VALUES_FIELD } from './model-ops.js';
import type { PivotAxis } from './types.js';

export interface FieldMenuProps {
  readonly pivot: PivotController<unknown>;
  readonly field: string;
  /** Axis the field is on, or null (fields panel / field list "not on the report"). */
  readonly axis: PivotAxis | null;
  readonly text: PivotText;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly labelledBy: string;
  readonly draft: boolean;
  /** Aggregates offered (after `onBeforeAggregateMenuOpen`, fired by the trigger on open); null hides the submenu. */
  readonly aggregates: readonly PivotAggregate[] | null;
  readonly show: { readonly sort?: boolean | undefined; readonly filter?: boolean | undefined; readonly remove?: boolean | undefined; readonly aggregate?: boolean | undefined };
  readonly onClose: (returnFocus: boolean) => void;
}

const AXES: readonly PivotAxis[] = ['rows', 'columns', 'values', 'filters'];

export default function FieldMenu(props: FieldMenuProps) {
  const { pivot, field, axis, text, draft, show } = props;
  const state = pivot.getSnapshot();
  const model = draft ? (state.draft ?? state.model) : state.model;
  const info = state.fields.find((f) => f.field === field);
  const items: MenuItemData[] = [];
  const isValues = field === VALUES_FIELD;
  const valueIndex = axis === 'values' ? model.values.findIndex((v) => v.field === field) : -1;
  if (axis === 'values' && valueIndex >= 0) {
    const offered = show.aggregate !== false ? props.aggregates : null;
    if (offered?.length) {
      const current = model.values[valueIndex]?.aggregate;
      items.push({
        id: 'aggregate',
        label: text('aggregate'),
        items: offered.map((a) => ({ id: `aggregate:${a}`, label: `${a === current ? '✓ ' : ''}${AGGREGATE_LABELS[a]}` })),
      });
    }
    items.push({ id: 'numberFormat', label: `${text('numberFormat')}…` });
    if (model.calculatedFields.some((c) => c.name === field)) items.push({ id: 'calculatedField', label: `${text('calculatedField')}…` });
  }
  if ((axis === 'rows' || axis === 'columns') && !isValues && show.sort !== false && info?.sortable !== false) {
    items.push({ id: 'sort:asc', label: text('sortAsc') }, { id: 'sort:desc', label: text('sortDesc') }, { id: 'sort:none', label: text('sortNone') });
  }
  if (axis && axis !== 'values' && !isValues && show.filter !== false && info?.filterable !== false) {
    items.push({ id: 'filter', label: `${text('filter')}…` });
    if (model.filterBy[field]) items.push({ id: 'clearFilter', label: text('clearFilter') });
  }
  // Number and date fields group into ranges or date parts; any other field into custom member groups.
  if ((axis === 'rows' || axis === 'columns') && !isValues) {
    items.push({ id: 'group', label: `${text('group')}…` });
    if (model.groups[field]) items.push({ id: 'ungroup', label: text('ungroup') });
  }
  if (items.length) items.push({ type: 'separator', id: 'sep1' });
  const targets = isValues ? (['rows', 'columns'] as const) : AXES;
  for (const to of targets) if (to !== axis) items.push({ id: `move:${to}`, label: text('moveTo', { axis: text(to) }), disabled: info?.draggable === false });
  if (axis) {
    const list = axisItems(model, axis);
    const i = list.indexOf(field);
    items.push({ id: 'up', label: text('moveUp'), disabled: i <= 0 }, { id: 'down', label: text('moveDown'), disabled: i < 0 || i >= list.length - 1 });
    if (!isValues && show.remove !== false && info?.removable !== false) items.push({ id: 'remove', label: text('removeField') });
  }

  const onAction = (event: MenuActionEvent): void => {
    const id = event.id;
    const opts = { source: event.source === 'pointer' ? ('pointer' as const) : event.source === 'touch' ? ('touch' as const) : ('keyboard' as const), draft };
    if (id.startsWith('aggregate:')) pivot.setAggregate(valueIndex, id.slice(10) as PivotAggregate, opts);
    else if (id.startsWith('sort:')) pivot.setSort(field, id.slice(5) as 'asc' | 'desc' | 'none', opts);
    else if (id.startsWith('move:')) pivot.moveField(field, id.slice(5) as PivotAxis, -1, opts);
    else if (id === 'up' || id === 'down') pivot.stepField(field, axis as PivotAxis, id === 'up' ? -1 : 1, opts);
    else if (id === 'remove') pivot.moveField(field, null, -1, opts);
    else if (id === 'filter') pivot.openDialog({ kind: 'memberEditor', field }, opts.source);
    else if (id === 'clearFilter') pivot.setFilter(field, null, opts);
    else if (id === 'group') pivot.openDialog({ kind: 'grouping', field }, opts.source);
    else if (id === 'ungroup') pivot.setGrouping(field, null, opts);
    else if (id === 'numberFormat') pivot.openDialog({ kind: 'numberFormat', measure: field }, opts.source);
    else if (id === 'calculatedField') pivot.openDialog({ kind: 'calculatedField', name: field }, opts.source);
  };

  const popup = useMenuPopup(
    {
      open: true,
      onOpenChange: (open, event) => {
        if (!open) props.onClose(event.reason !== 'outside' && event.reason !== 'tab');
      },
      items,
      onAction,
      placement: 'bottom-start',
    },
    props.triggerRef as RefObject<HTMLButtonElement | null>,
    'PivotFieldMenu',
  );
  return <>{popup.renderPopup(props.labelledBy, 'salmon-menu salmon-pivot-table-menu', undefined)}</>;
}
