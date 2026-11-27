'use client';

// Pivot dialogs (lazy chunk): the popup field
// list, the member editor, the calculated field editor, number and conditional formatting, grouping and drill through with editing. Each is a modal
// `dialog` with a focus scope (Tab contained, focus returned on close) and
// Escape to close; on narrow viewports it is a full-screen sheet.

import { createContext, use, useEffect, useId, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';
import {
  compileFormula,
  measureId,
  type PivotAggregate,
  type PivotConditionalFormat,
  type PivotDatePart,
  type PivotFilter,
  type PivotGrouping,
  type PivotLabelOperator,
  type PivotMember,
  type PivotValueOperator,
  type Json,
} from '@salmonui/pivot-table/engine';
import { DataGrid } from '@salmonui/data-grid';
import type { DataGridColumn } from '@salmonui/data-grid';
import type { DataGridEditing, DataGridSaveEvent } from '@salmonui/data-grid';
import { Portal, themeScopeOf } from '@salmonui/core/internal/overlay';
import { useFocusScope } from '@salmonui/core/internal/focus-scope';
import { useDismiss } from '@salmonui/core/internal/dismiss';
import type { PivotController } from './controller.js';
import type { PivotLocaleText, PivotText } from './locale.js';
import { defined } from './grid-model.js';
import { AGGREGATE_LABELS, captionOf } from './model-ops.js';
import { PivotFieldList } from './PivotFieldList.js';
import { usePivotState } from './usePivot.js';

export interface PivotDialogsProps {
  readonly pivot: PivotController<unknown>;
  readonly text: PivotText;
  readonly localeText: PivotLocaleText | undefined;
  readonly editing: boolean | DataGridEditing<unknown> | undefined;
  readonly maxRows: number | undefined;
  readonly aggregateOptions: readonly PivotAggregate[] | undefined;
  readonly deferUpdate: boolean;
  /** The element the dialogs belong to (the table root): they portal into its theme scope. */
  readonly anchor?: (() => Element | null) | undefined;
}

/** Anchor of the open dialogs (PivotDialogs provides it). */
const DialogAnchor = createContext<(() => Element | null) | undefined>(undefined);

/** Modal dialog shell: backdrop, `role="dialog"`, title, focus scope, Escape. */
export function PivotDialog({ title, onClose, children, footer, wide, closeLabel = 'Close' }: { title: string; closeLabel?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const anchor = use(DialogAnchor);
  useFocusScope(ref, { tab: 'contain', autoFocus: 'first', restoreFocus: true });
  useDismiss(ref, { onDismiss: (reason) => reason === 'escape' && onClose(), outsidePress: false, focusOutside: false });
  // Into the table's theme scope (or open modal dialog), so the `--salmon-*` variables of a
  // ThemeProvider around the table apply; the body only without one.
  return (
    <Portal container={() => themeScopeOf(anchor?.())}>
      <div className="salmon-pivot-table-backdrop">
        <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="salmon-pivot-table-dialog" data-wide={wide ? '' : undefined}>
          <div className="salmon-pivot-table-dialog-header">
            <h2 id={titleId} className="salmon-pivot-table-dialog-title">
              {title}
            </h2>
            <button type="button" className="salmon-pivot-table-button" data-variant="icon" aria-label={closeLabel} onClick={onClose} />
          </div>
          <div className="salmon-pivot-table-dialog-body">{children}</div>
          {footer ? <div className="salmon-pivot-table-actions">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

function Footer({ text, onOk, onCancel, okDisabled }: { text: PivotText; onOk: () => void; onCancel: () => void; okDisabled?: boolean }) {
  return (
    <>
      <button type="button" className="salmon-pivot-table-button" data-variant="primary" disabled={okDisabled} onClick={onOk}>
        {text('ok')}
      </button>
      <button type="button" className="salmon-pivot-table-button" onClick={onCancel}>
        {text('cancel')}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Member editor
// ---------------------------------------------------------------------------

const MEMBER_ROW = 32;
const MEMBER_VIEWPORT = 280;

/** A fixed-height virtualized checkbox list (members, custom group members): renders only the visible rows. */
function VirtualCheckList({ items, isChecked, onToggle, label }: { items: readonly PivotMember[]; isChecked: (key: string) => boolean; onToggle: (key: string) => void; label: string }) {
  const [start, setStart] = useState(0);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const count = Math.ceil(MEMBER_VIEWPORT / MEMBER_ROW) + 4;
  const end = Math.min(items.length, start + count);
  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const next = Math.max(0, Math.floor(event.currentTarget.scrollTop / MEMBER_ROW) - 2);
    if (next !== start) setStart(next);
  };
  const focusRow = (i: number): void => {
    const j = Math.max(0, Math.min(items.length - 1, i));
    setActive(j);
    const el = listRef.current;
    if (!el) return;
    const top = j * MEMBER_ROW;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + MEMBER_ROW > el.scrollTop + MEMBER_VIEWPORT) el.scrollTop = top + MEMBER_ROW - MEMBER_VIEWPORT;
  };
  const activeItem = items[active];
  const rows: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const member = items[i] as PivotMember;
    const key = JSON.stringify(member.key);
    const checked = isChecked(key);
    rows.push(
      <div
        key={key}
        id={`m-${i}`}
        role="option"
        aria-selected={checked}
        aria-posinset={i + 1}
        aria-setsize={items.length}
        className="salmon-pivot-table-member-option"
        data-active={i === active ? '' : undefined}
        style={{ top: i * MEMBER_ROW, height: MEMBER_ROW }}
        onClick={() => {
          setActive(i);
          onToggle(key);
        }}
      >
        <span className="salmon-pivot-table-checkbox" aria-hidden="true" data-checked={checked ? '' : undefined} />
        <span className="salmon-pivot-table-member-label">{member.label}</span>
        <span className="salmon-pivot-table-member-count" aria-hidden="true">
          {member.count}
        </span>
      </div>,
    );
  }
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      aria-multiselectable="true"
      tabIndex={0}
      aria-activedescendant={activeItem && active >= start && active < end ? `m-${active}` : undefined}
      className="salmon-pivot-table-member-list"
      style={{ height: MEMBER_VIEWPORT }}
      onScroll={onScroll}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') focusRow(active + 1);
        else if (event.key === 'ArrowUp') focusRow(active - 1);
        else if (event.key === 'Home') focusRow(0);
        else if (event.key === 'End') focusRow(items.length - 1);
        else if (event.key === 'PageDown') focusRow(active + 9);
        else if (event.key === 'PageUp') focusRow(active - 9);
        else if (event.key === ' ' && activeItem) onToggle(JSON.stringify(activeItem.key));
        else return;
        event.preventDefault();
      }}
    >
      <div style={{ height: items.length * MEMBER_ROW, position: 'relative' }}>{rows}</div>
    </div>
  );
}

const LABEL_OPERATORS: readonly PivotLabelOperator[] = ['equal', 'notEqual', 'contains', 'doesNotContain', 'startsWith', 'doesNotStartWith', 'endsWith', 'doesNotEndWith', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between', 'notBetween'];
const VALUE_OPERATORS: readonly PivotValueOperator[] = ['equal', 'notEqual', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between', 'notBetween', 'top', 'bottom'];
const opLabel = (op: string): string => op.replace(/([A-Z])/g, ' $1').toLowerCase();

/** Selection of a member list: every member except `set` (`all`) or only `set`. */
interface Checks {
  readonly all: boolean;
  readonly set: ReadonlySet<string>;
}

/** Members of a field: synchronous from the local engine, loaded once from an asynchronous one. */
function useAsyncMembers(pivot: PivotController<unknown>, field: string): readonly PivotMember[] {
  const [sync] = useState(() => (pivot.windowed ? pivot.getLoadedMembers(field) : pivot.getMembers(field)));
  const [loaded, setLoaded] = useState<readonly PivotMember[] | null>(null);
  useEffect(() => {
    if (sync) return;
    let live = true;
    void pivot.getMembersAsync(field).then((m) => live && setLoaded(m));
    return () => {
      live = false;
    };
  }, [pivot, field, sync]);
  return sync ?? loaded ?? EMPTY_MEMBERS;
}

const EMPTY_MEMBERS: readonly PivotMember[] = [];

export function MemberEditor({ pivot, field, text, onClose }: { pivot: PivotController<unknown>; field: string; text: PivotText; onClose: () => void }) {
  const model = pivot.model;
  const fields = pivot.getSnapshot().fields;
  const caption = captionOf(model, field, fields);
  const members = useAsyncMembers(pivot, field);
  const current = model.filterBy[field];
  const [kind, setKind] = useState<'member' | 'label' | 'value'>(current && 'label' in current ? 'label' : current && 'value' in current ? 'value' : 'member');
  const [checks, setChecks] = useState<Checks>(() =>
    current && 'include' in current ? { all: false, set: new Set(current.include.map((k) => JSON.stringify(k))) } : current && 'exclude' in current ? { all: true, set: new Set(current.exclude.map((k) => JSON.stringify(k))) } : { all: true, set: new Set() },
  );
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const shown = useMemo(() => (query ? members.filter((m) => m.label.toLocaleLowerCase().includes(query)) : members), [members, query]);
  const isChecked = (key: string): boolean => (checks.all ? !checks.set.has(key) : checks.set.has(key));
  const toggle = (key: string): void => {
    const set = new Set(checks.set);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    setChecks({ all: checks.all, set });
  };
  const allShownChecked = shown.length > 0 && (query ? shown.every((m) => isChecked(JSON.stringify(m.key))) : checks.all ? checks.set.size === 0 : checks.set.size === members.length);
  const toggleAll = (): void => {
    if (!query) {
      setChecks(allShownChecked ? { all: false, set: new Set() } : { all: true, set: new Set() });
      return;
    }
    const set = new Set(checks.set);
    for (const m of shown) {
      const key = JSON.stringify(m.key);
      const want = !allShownChecked;
      // In `all` mode the set holds unchecked keys; otherwise checked keys.
      if (checks.all === want) set.delete(key);
      else set.add(key);
    }
    setChecks({ all: checks.all, set });
  };
  const labelFilter = current && 'label' in current ? current.label : null;
  const valueFilter = current && 'value' in current ? current.value : null;
  const [labelOp, setLabelOp] = useState<PivotLabelOperator>(labelFilter?.operator ?? 'contains');
  const [labelValue, setLabelValue] = useState(String(labelFilter?.value ?? ''));
  const [labelValue2, setLabelValue2] = useState(String(labelFilter?.value2 ?? ''));
  const measures = model.values.map((_, k) => measureId(model.values, k));
  const [valueMeasure, setValueMeasure] = useState(valueFilter?.measure ?? measures[0] ?? '');
  const [valueOp, setValueOp] = useState<PivotValueOperator>(valueFilter?.operator ?? 'greaterThan');
  const [valueA, setValueA] = useState(String(valueFilter?.value ?? ''));
  const [valueB, setValueB] = useState(String(valueFilter?.value2 ?? ''));
  const checkedCount = checks.all ? members.length - checks.set.size : checks.set.size;
  const apply = (): void => {
    let filter: PivotFilter | null = null;
    if (kind === 'member') {
      const keys = [...checks.set].map((k) => JSON.parse(k) as Json);
      filter = checks.all ? (keys.length ? { exclude: keys } : null) : { include: keys };
    } else if (kind === 'label') {
      filter = labelValue === '' ? null : { label: { operator: labelOp, value: labelValue, ...(labelOp === 'between' || labelOp === 'notBetween' ? { value2: labelValue2 } : {}) } };
    } else {
      const a = Number(valueA);
      filter = valueA === '' || Number.isNaN(a) ? null : { value: { measure: valueMeasure, operator: valueOp, value: a, ...(valueOp === 'between' || valueOp === 'notBetween' ? { value2: Number(valueB) } : {}) } };
    }
    pivot.setFilter(field, filter, { source: 'pointer' });
    onClose();
  };
  const between = (op: string): boolean => op === 'between' || op === 'notBetween';
  return (
    <PivotDialog closeLabel={text('close')} title={text('memberEditor', { field: caption })} onClose={onClose} footer={<Footer text={text} onOk={apply} onCancel={onClose} okDisabled={kind === 'member' && checkedCount === 0} />}>
      <div className="salmon-pivot-table-tabs" role="radiogroup" aria-label={text('filter')}>
        {(['member', 'label', 'value'] as const).map((k) => (
          <label key={k} className="salmon-pivot-table-radio">
            <input type="radio" name="pivot-filter-kind" checked={kind === k} onChange={() => setKind(k)} />
            {k === 'member' ? text('include') : k === 'label' ? text('labelFilter') : text('valueFilter')}
          </label>
        ))}
      </div>
      {kind === 'member' ? (
        <>
          <input type="search" className="salmon-pivot-table-input" role="searchbox" aria-label={text('searchMembers')} placeholder={text('searchMembers')} value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="salmon-pivot-table-check-all">
            <input type="checkbox" checked={allShownChecked} ref={(el) => {
              if (el) el.indeterminate = !allShownChecked && checkedCount > 0;
            }} onChange={toggleAll} />
            {text('selectAll')}
            <span className="salmon-pivot-table-member-count">{text('members', { count: shown.length })}</span>
          </label>
          {shown.length ? <VirtualCheckList items={shown} isChecked={isChecked} onToggle={toggle} label={text('memberEditor', { field: caption })} /> : <p className="salmon-pivot-table-empty">{text('noMembers')}</p>}
        </>
      ) : kind === 'label' ? (
        <div className="salmon-pivot-table-form">
          <label>
            {text('operator')}
            <select className="salmon-pivot-table-input" value={labelOp} onChange={(event) => setLabelOp(event.target.value as PivotLabelOperator)}>
              {LABEL_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {opLabel(op)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('value')}
            <input className="salmon-pivot-table-input" value={labelValue} onChange={(event) => setLabelValue(event.target.value)} />
          </label>
          {between(labelOp) ? (
            <label>
              {text('value2')}
              <input className="salmon-pivot-table-input" value={labelValue2} onChange={(event) => setLabelValue2(event.target.value)} />
            </label>
          ) : null}
        </div>
      ) : (
        <div className="salmon-pivot-table-form">
          <label>
            {text('measure')}
            <select className="salmon-pivot-table-input" value={valueMeasure} onChange={(event) => setValueMeasure(event.target.value)}>
              {measures.map((m) => (
                <option key={m} value={m}>
                  {captionOf(model, m, fields)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('operator')}
            <select className="salmon-pivot-table-input" value={valueOp} onChange={(event) => setValueOp(event.target.value as PivotValueOperator)}>
              {VALUE_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {opLabel(op)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('value')}
            <input className="salmon-pivot-table-input" inputMode="decimal" value={valueA} onChange={(event) => setValueA(event.target.value)} />
          </label>
          {between(valueOp) ? (
            <label>
              {text('value2')}
              <input className="salmon-pivot-table-input" inputMode="decimal" value={valueB} onChange={(event) => setValueB(event.target.value)} />
            </label>
          ) : null}
        </div>
      )}
    </PivotDialog>
  );
}

// ---------------------------------------------------------------------------
// Calculated field editor
// ---------------------------------------------------------------------------

export function CalculatedFieldEditor({ pivot, name, text, onClose }: { pivot: PivotController<unknown>; name: string | null; text: PivotText; onClose: () => void }) {
  const model = pivot.model;
  const fields = pivot.getSnapshot().fields;
  const existing = name ? model.calculatedFields.find((c) => c.name === name) : undefined;
  const [fieldName, setFieldName] = useState(existing?.name ?? '');
  const [caption, setCaption] = useState(existing?.caption ?? '');
  const [formula, setFormula] = useState(existing?.formula ?? '');
  const errorId = useId();
  const measures = fields.filter((f) => f.type === 'number').map((f) => f.field);
  const error = useMemo(() => {
    if (!formula.trim()) return null;
    try {
      compileFormula(formula, [...measures, ...model.calculatedFields.filter((c) => c.name !== name).map((c) => c.name)]);
      return null;
    } catch (e) {
      const err = e as { message?: string; position?: number };
      return `${err.message ?? String(e)}${typeof err.position === 'number' ? ` (${err.position + 1})` : ''}`;
    }
  }, [formula, measures.join('\u0001'), model.calculatedFields, name]);
  const nameTaken = !existing && fieldName !== '' && (fields.some((f) => f.field === fieldName) || model.calculatedFields.some((c) => c.name === fieldName));
  const insert = (token: string): void => setFormula((f) => (f ? `${f} ${token}` : token));
  const ok = (): void => {
    pivot.setCalculatedField(existing?.name ?? fieldName, { name: existing?.name ?? fieldName, formula, ...(caption ? { caption } : {}), ...(existing?.format ? { format: existing.format } : {}) }, { source: 'pointer' });
    onClose();
  };
  return (
    <PivotDialog
      title={text('calculatedField')}
      onClose={onClose}
      footer={
        <>
          {existing ? (
            <button
              type="button"
              className="salmon-pivot-table-button"
              onClick={() => {
                pivot.setCalculatedField(existing.name, null, { source: 'pointer' });
                onClose();
              }}
            >
              {text('removeCalculatedField')}
            </button>
          ) : null}
          <Footer text={text} onOk={ok} onCancel={onClose} okDisabled={!fieldName || !formula.trim() || error !== null || nameTaken} />
        </>
      }
    >
      <div className="salmon-pivot-table-form">
        <label>
          {text('calculatedFieldName')}
          <input className="salmon-pivot-table-input" value={fieldName} readOnly={existing !== undefined} aria-invalid={nameTaken || undefined} onChange={(event) => setFieldName(event.target.value)} />
        </label>
        <label>
          {text('value')}
          <input className="salmon-pivot-table-input" value={caption} onChange={(event) => setCaption(event.target.value)} />
        </label>
        <label>
          {text('formula')}
          <textarea className="salmon-pivot-table-input" rows={3} value={formula} aria-invalid={error ? true : undefined} aria-describedby={errorId} onChange={(event) => setFormula(event.target.value)} />
        </label>
        <p id={errorId} className={error ? 'salmon-pivot-table-error' : 'salmon-pivot-table-hint'} role={error ? 'alert' : undefined}>
          {error ?? text('formulaHelp')}
        </p>
        <div className="salmon-pivot-table-tokens" role="group" aria-label={text('fields')}>
          {measures.flatMap((m) =>
            (['sum', 'count', 'average', 'min', 'max'] as const).map((agg) => {
              const token = `"${AGGREGATE_LABELS[agg] === 'Average' ? 'Avg' : AGGREGATE_LABELS[agg]}(${m})"`;
              return (
                <button key={`${agg}-${m}`} type="button" className="salmon-pivot-table-chip" onClick={() => insert(token)}>
                  {token}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </PivotDialog>
  );
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

export function NumberFormatEditor({ pivot, measure, text, onClose }: { pivot: PivotController<unknown>; measure: string | null; text: PivotText; onClose: () => void }) {
  const model = pivot.model;
  const fields = pivot.getSnapshot().fields;
  const measures = model.values.map((_, k) => measureId(model.values, k));
  const [target, setTarget] = useState(measure ?? measures[0] ?? '');
  const existing = model.formats[target]?.number;
  const [style, setStyle] = useState<'decimal' | 'currency' | 'percent'>((existing?.style as 'decimal') ?? 'decimal');
  const [decimals, setDecimals] = useState(String(existing?.maximumFractionDigits ?? 2));
  const [grouping, setGrouping] = useState(existing?.useGrouping !== false);
  const [currency, setCurrency] = useState(existing?.currency ?? 'USD');
  const ok = (): void => {
    const d = Math.max(0, Math.min(20, Number(decimals) || 0));
    pivot.setFormat(target, { number: { style, minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: grouping, ...(style === 'currency' ? { currency } : {}) } }, { source: 'pointer' });
    onClose();
  };
  return (
    <PivotDialog closeLabel={text('close')} title={text('numberFormat')} onClose={onClose} footer={<Footer text={text} onOk={ok} onCancel={onClose} okDisabled={!target} />}>
      <div className="salmon-pivot-table-form">
        <label>
          {text('measure')}
          <select className="salmon-pivot-table-input" value={target} onChange={(event) => setTarget(event.target.value)}>
            {measures.map((m) => (
              <option key={m} value={m}>
                {captionOf(model, m, fields)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text('formatStyle')}
          <select className="salmon-pivot-table-input" value={style} onChange={(event) => setStyle(event.target.value as 'decimal')}>
            <option value="decimal">Number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
          </select>
        </label>
        <label>
          {text('decimals')}
          <input className="salmon-pivot-table-input" type="number" min={0} max={20} value={decimals} onChange={(event) => setDecimals(event.target.value)} />
        </label>
        <label className="salmon-pivot-table-check">
          <input type="checkbox" checked={grouping} onChange={(event) => setGrouping(event.target.checked)} />
          {text('useGrouping')}
        </label>
        {style === 'currency' ? (
          <label>
            {text('currency')}
            <input className="salmon-pivot-table-input" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} />
          </label>
        ) : null}
      </div>
    </PivotDialog>
  );
}

// ---------------------------------------------------------------------------
// Conditional formatting
// ---------------------------------------------------------------------------

const TONES = ['accent', 'success', 'warning', 'danger', 'neutral'] as const;

export function ConditionalFormatEditor({ pivot, text, onClose }: { pivot: PivotController<unknown>; text: PivotText; onClose: () => void }) {
  const model = pivot.model;
  const fields = pivot.getSnapshot().fields;
  const [rules, setRules] = useState<PivotConditionalFormat[]>(() => [...model.conditionalFormats]);
  const update = (i: number, patch: Partial<PivotConditionalFormat>): void => setRules((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const ok = (): void => {
    pivot.setConditionalFormats(rules, { source: 'pointer' });
    onClose();
  };
  return (
    <PivotDialog closeLabel={text('close')} title={text('conditionalFormat')} onClose={onClose} wide footer={<Footer text={text} onOk={ok} onCancel={onClose} />}>
      <ol className="salmon-pivot-table-rules">
        {rules.map((rule, i) => (
          <li key={i} className="salmon-pivot-table-rule">
            <label>
              {text('measure')}
              <select className="salmon-pivot-table-input" value={rule.measure ?? ''} onChange={(event) => setRules((list) => list.map((r, j) => {
                if (j !== i) return r;
                const { measure: _m, ...rest } = r;
                return event.target.value ? { ...rest, measure: event.target.value } : rest;
              }))}>
                <option value="">{text('allMeasures')}</option>
                {model.values.map((v) => (
                  <option key={v.field} value={v.field}>
                    {captionOf(model, v.field, fields)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text('operator')}
              <select className="salmon-pivot-table-input" value={rule.operator} onChange={(event) => update(i, { operator: event.target.value as PivotValueOperator })}>
                {VALUE_OPERATORS.filter((op) => op !== 'top' && op !== 'bottom').map((op) => (
                  <option key={op} value={op}>
                    {opLabel(op)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {text('value')}
              <input className="salmon-pivot-table-input" inputMode="decimal" value={String(rule.value)} onChange={(event) => update(i, { value: Number(event.target.value) || 0 })} />
            </label>
            {rule.operator === 'between' || rule.operator === 'notBetween' ? (
              <label>
                {text('value2')}
                <input className="salmon-pivot-table-input" inputMode="decimal" value={String(rule.value2 ?? '')} onChange={(event) => update(i, { value2: Number(event.target.value) || 0 })} />
              </label>
            ) : null}
            <label>
              {text('tone')}
              <select className="salmon-pivot-table-input" value={rule.tone ?? 'accent'} onChange={(event) => update(i, { tone: event.target.value as (typeof TONES)[number] })}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="salmon-pivot-table-button" onClick={() => setRules((list) => list.filter((_, j) => j !== i))}>
              {text('removeRule')}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="salmon-pivot-table-button" onClick={() => setRules((list) => [...list, { operator: 'greaterThan', value: 0, tone: 'accent' }])}>
        {text('addRule')}
      </button>
    </PivotDialog>
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

const DATE_PARTS: readonly PivotDatePart[] = ['years', 'quarters', 'quarterYear', 'months', 'days', 'hours', 'minutes', 'seconds'];

export function GroupingEditor({ pivot, field, text, onClose }: { pivot: PivotController<unknown>; field: string; text: PivotText; onClose: () => void }) {
  const model = pivot.model;
  const fields = pivot.getSnapshot().fields;
  const info = fields.find((f) => f.field === field);
  const existing = model.groups[field];
  const [start, setStart] = useState(existing?.kind === 'number' ? String(existing.start ?? '') : existing?.kind === 'date' ? (existing.start ?? '') : '');
  const [end, setEnd] = useState(existing?.kind === 'number' ? String(existing.end ?? '') : existing?.kind === 'date' ? (existing.end ?? '') : '');
  const [interval, setInterval] = useState(existing?.kind === 'number' ? String(existing.interval) : '10');
  const [parts, setParts] = useState<readonly PivotDatePart[]>(existing?.kind === 'date' ? existing.parts : ['years', 'months']);
  const kind = info?.type === 'date' ? 'date' : info?.type === 'number' ? 'number' : 'custom';
  const allMembers = useAsyncMembers(pivot, field);
  const members = kind === 'custom' ? allMembers : [];
  const [groupCaption, setGroupCaption] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const ok = (): void => {
    let grouping: PivotGrouping | null = null;
    if (kind === 'number') {
      const n = Number(interval);
      if (n > 0) grouping = { kind: 'number', interval: n, ...(start !== '' ? { start: Number(start) } : {}), ...(end !== '' ? { end: Number(end) } : {}) };
    } else if (kind === 'date') {
      if (parts.length) grouping = { kind: 'date', parts, ...(start ? { start } : {}), ...(end ? { end } : {}) };
    } else if (groupCaption && picked.size) {
      const previous = existing?.kind === 'custom' ? existing.groups : [];
      grouping = { kind: 'custom', groups: [...previous, { caption: groupCaption, members: [...picked].map((k) => JSON.parse(k) as Json) }] };
    }
    if (grouping) pivot.setGrouping(field, grouping, { source: 'pointer' });
    onClose();
  };
  return (
    <PivotDialog closeLabel={text('close')} title={`${text('grouping')}: ${captionOf(model, field, fields)}`} onClose={onClose} footer={<Footer text={text} onOk={ok} onCancel={onClose} />}>
      <div className="salmon-pivot-table-form">
        {kind === 'custom' ? (
          <>
            <label>
              {text('group')}
              <input className="salmon-pivot-table-input" value={groupCaption} onChange={(event) => setGroupCaption(event.target.value)} />
            </label>
            <VirtualCheckList
              items={members}
              label={text('members', { count: members.length })}
              isChecked={(k) => picked.has(k)}
              onToggle={(k) => {
                const next = new Set(picked);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                setPicked(next);
              }}
            />
          </>
        ) : (
          <>
            <label>
              {text('groupStart')}
              <input className="salmon-pivot-table-input" type={kind === 'date' ? 'date' : 'number'} value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label>
              {text('groupEnd')}
              <input className="salmon-pivot-table-input" type={kind === 'date' ? 'date' : 'number'} value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
            {kind === 'number' ? (
              <label>
                {text('groupInterval')}
                <input className="salmon-pivot-table-input" type="number" min={0} value={interval} onChange={(event) => setInterval(event.target.value)} />
              </label>
            ) : (
              <fieldset className="salmon-pivot-table-fieldset">
                <legend>{text('groupDateParts')}</legend>
                {DATE_PARTS.map((part) => (
                  <label key={part} className="salmon-pivot-table-check">
                    <input type="checkbox" checked={parts.includes(part)} onChange={(event) => setParts(event.target.checked ? DATE_PARTS.filter((p) => p === part || parts.includes(p)) : parts.filter((p) => p !== part))} />
                    {opLabel(part)}
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
      </div>
    </PivotDialog>
  );
}

// ---------------------------------------------------------------------------
// Drill through
// ---------------------------------------------------------------------------

const ROW_INDEX = '__pivotRowIndex';
type DrillRow = Record<string, unknown> & { readonly [ROW_INDEX]: number };

export function DrillThroughDialog({ pivot, rowIndex, columnIndex, text, editing, maxRows, onClose }: { pivot: PivotController<unknown>; rowIndex: number; columnIndex: number; text: PivotText; editing: boolean | DataGridEditing<unknown> | undefined; maxRows: number | undefined; onClose: () => void }) {
  const result = pivot.result;
  const fields = usePivotState(pivot, (s) => s.fields);
  // The rows at open time (by data index): edits re-aggregate the pivot but keep this list.
  const [rows] = useState<DrillRow[]>(() => {
    const data = pivot.getData() as readonly Record<string, unknown>[];
    const indexes = pivot.getCellRowIndexes(rowIndex, columnIndex);
    const limit = maxRows ?? indexes.length;
    const out: DrillRow[] = [];
    for (let k = 0; k < indexes.length && k < limit; k++) {
      const i = indexes[k] as number;
      out.push({ ...(data[i] as Record<string, unknown>), [ROW_INDEX]: i });
    }
    return out;
  });
  // An asynchronous engine keeps raw rows in the Worker: they load once, read-only (no data indexes to write to).
  const [remote, setRemote] = useState<DrillRow[] | null>(null);
  useEffect(() => {
    if (!pivot.windowed) return;
    let live = true;
    void pivot.getCellRowsAsync(rowIndex, columnIndex).then((list) => {
      if (live) setRemote((list as Record<string, unknown>[]).slice(0, maxRows ?? list.length).map((r, i) => ({ ...r, [ROW_INDEX]: i })));
    });
    return () => {
      live = false;
    };
  }, [pivot, rowIndex, columnIndex, maxRows]);
  const shown = remote ?? rows;
  const total = useMemo(() => (pivot.windowed ? (remote?.length ?? 0) : pivot.getCellRowIndexes(rowIndex, columnIndex).length), [pivot, rowIndex, columnIndex, remote]);
  const columns = useMemo<DataGridColumn<DrillRow>[]>(() => fields.filter((f) => !f.hidden).map((f) => ({ field: f.field, header: f.caption, type: f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string', ...(f.type === 'number' ? { align: 'end' as const } : {}) })), [fields]);
  const row = result && rowIndex < result.rowCount ? result.memberAt('rows', rowIndex).label : '';
  const column = result && columnIndex < result.columnCount ? result.memberAt('columns', columnIndex).label : '';
  const onSave = (event: DataGridSaveEvent<DrillRow>): void => {
    if (event.status !== 'applied' && event.status !== 'partial') return;
    const changes = event.rows();
    const strip = (r: DrillRow): Record<string, unknown> => {
      const { [ROW_INDEX]: _i, ...rest } = r;
      return rest;
    };
    const list: { index: number; row: unknown }[] = [];
    for (const r of changes.changedRecords) list.push({ index: r[ROW_INDEX], row: strip(r) });
    for (const r of changes.addedRecords) list.push({ index: -1, row: strip(r) });
    for (const r of changes.deletedRecords) list.push({ index: r[ROW_INDEX], row: null });
    pivot.updateRows(list, changes.deletedRecords.length ? 'delete' : changes.addedRecords.length ? 'add' : 'update');
  };
  return (
    <PivotDialog closeLabel={text('close')} title={text('drillThrough', { row, column })} onClose={onClose} wide>
      <p className="salmon-pivot-table-hint" aria-live="polite">
        {shown.length < total ? text('drillTruncated', { count: shown.length }) : text('drillRows', { count: total })}
      </p>
      <DataGrid<DrillRow>
        data={shown}
        columns={columns}
        getRowId={(r) => r[ROW_INDEX] ?? -1}
        height={360}
        resizable
        columnChooser
        toolbar={editing ? ['add', 'edit', 'delete', 'save', 'cancel', 'columnChooser'] : ['columnChooser']}
        {...(editing && !pivot.windowed ? { editing: editing as boolean | DataGridEditing<DrillRow>, onSave } : {})}
        aria-label={text('drillThrough', { row, column })}
      />
    </PivotDialog>
  );
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

/** Renders the dialog named by the store (`state.dialog`). */
export default function PivotDialogs(props: PivotDialogsProps) {
  return (
    <DialogAnchor value={props.anchor}>
      <OpenDialog {...props} />
    </DialogAnchor>
  );
}

function OpenDialog(props: PivotDialogsProps) {
  const { pivot, text } = props;
  const dialog = usePivotState(pivot, (s) => s.dialog);
  const close = (): void => pivot.closeDialog();
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'fieldList':
      return (
        <PivotDialog closeLabel={text('close')} title={text('fieldList')} onClose={close} wide>
          <PivotFieldList pivot={pivot} deferUpdate={props.deferUpdate} {...defined({ aggregateOptions: props.aggregateOptions, localeText: props.localeText })} onDone={close} />
        </PivotDialog>
      );
    case 'memberEditor':
      return <MemberEditor key={dialog.field} pivot={pivot} field={dialog.field} text={text} onClose={close} />;
    case 'calculatedField':
      return <CalculatedFieldEditor pivot={pivot} name={dialog.name} text={text} onClose={close} />;
    case 'numberFormat':
      return <NumberFormatEditor pivot={pivot} measure={dialog.measure} text={text} onClose={close} />;
    case 'conditionalFormat':
      return <ConditionalFormatEditor pivot={pivot} text={text} onClose={close} />;
    case 'grouping':
      return <GroupingEditor pivot={pivot} field={dialog.field} text={text} onClose={close} />;
    case 'drillThrough':
      return <DrillThroughDialog key={`${dialog.rowKey}|${dialog.columnKey}`} pivot={pivot} rowIndex={dialog.rowIndex} columnIndex={dialog.columnIndex} text={text} editing={props.editing} maxRows={props.maxRows} onClose={close} />;
    default:
      return null;
  }
}
