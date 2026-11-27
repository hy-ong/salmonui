'use client';

// Lazy Gantt popups: the add / edit dialog
// with its tabs, the dependency conflict dialog and the chart pane's context menu. Built on the public `Dialog`, `DatePicker` and `ContextMenu`.

import { useMemo, useState, type ReactNode } from 'react';
import { Dialog } from '@salmonui/overlays/dialog';
import { DialogBody, DialogFooter } from '@salmonui/core/internal/dialog-core/Dialog';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { ContextMenu } from '@salmonui/buttons/menu';
import type { DataGridMenuItem } from '@salmonui/data-grid';
import { gridEvent } from '@salmonui/core/internal/events';
import type { Dependency, DependencyType } from '../internal/timeline/project/types.js';
import { dateOf, wallOf } from './fields.js';
import type { Formatters } from './chart.js';
import type { GanttInstance } from './instance.js';
import type { GanttLocaleKey } from './locale.js';
import { runContextItem } from './menu-run.js';

export { runContextItem };
import type { GanttApi, GanttContextMenuItemClickEvent, GanttDialogTab } from './types.js';

type Values = Record<string, unknown>;

const TYPES: readonly DependencyType[] = ['fs', 'ss', 'ff', 'sf'];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="salmon-gantt-dialog__field">
      <span className="salmon-gantt-dialog__label">{label}</span>
      {children}
    </label>
  );
}

function TaskDialog<Row>({ g, api }: { g: GanttInstance<Row>; api: GanttApi<Row> }) {
  const d = g.dialog;
  const f = g.fields;
  const t = (k: GanttLocaleKey): string => g.text(k);
  const task = d?.id ? g.getRow(d.id) : undefined;
  const input = d?.id ? g.engine.getTask(d.id) : undefined;
  const [values, setValues] = useState<Values>(() => ({ ...(task as Values | undefined) }));
  const [deps, setDeps] = useState<Dependency[]>(() => [...(input?.predecessors ?? [])]);
  const [res, setRes] = useState<{ id: string; unit: number }[]>(() => [...(input?.resources ?? [])]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const set = (field: string, value: unknown): void => setValues((v) => ({ ...v, [field]: value }));
  const tabsProp = typeof g.props.editing === 'object' ? g.props.editing.dialogTabs : undefined;
  const tabs: readonly GanttDialogTab<Row>[] = useMemo(() => {
    if (tabsProp?.length) return tabsProp;
    const out: GanttDialogTab<Row>[] = [{ type: 'general' }, { type: 'dependency' }];
    if (g.props.resources?.length) out.push({ type: 'resources' });
    out.push({ type: 'notes' });
    if (input?.segments?.length) out.push({ type: 'segments' });
    return out;
  }, [tabsProp, g.props.resources, input]);
  if (!d) return null;
  const tz = g.props.timeZone;
  const fine = g.level.bottom.unit === 'hour' || g.level.bottom.unit === 'minute';
  const close = (): void => {
    g.dialog = null;
    g.emit();
  };
  const save = (): void => {
    const s = wallOf(values[f.start], tz);
    const e = wallOf(values[f.end], tz);
    if (!String(values[f.title] ?? '').trim()) {
      setError(t('required'));
      setTab(0);
      return;
    }
    if (s !== null && e !== null && e < s) {
      setError(t('endBeforeStart'));
      setTab(0);
      return;
    }
    const changes: Values = {};
    for (const k of Object.keys(values)) if (k !== '__salmonParentId' && values[k] !== (task as Values | undefined)?.[k]) changes[k] = values[k];
    const prevDeps = input?.predecessors ?? [];
    const depsChanged = JSON.stringify(prevDeps) !== JSON.stringify(deps);
    const prevRes = input?.resources ?? [];
    if (JSON.stringify(prevRes) !== JSON.stringify(res)) changes[f.resources] = res.map((r) => ({ [g.props.resourceFields?.id ?? 'id']: r.id, [g.props.resourceFields?.unit ?? 'unit']: r.unit }));
    if (d.mode === 'add') {
      const r = api.addTask({ ...changes, [f.predecessors]: deps } as never, g.selectedId() ? { position: 'below', targetId: g.selectedId() as string } : undefined);
      if (r.status === 'applied') close();
      return;
    }
    const id = d.id as string;
    if (Object.keys(changes).length) {
      const r = g.updateFields(id, changes as never, 'pointer', 'edit');
      if (r.status === 'rejected') return;
    }
    if (depsChanged) g.dependencies(id, deps, 'update', 'pointer');
    close();
  };
  const dateValue = (field: string): Date | null => {
    const v = values[field];
    const w = wallOf(v, tz);
    return w === null ? null : dateOf(w, tz);
  };
  const tasks = g.engine.getTasks().filter((x) => x.id !== d.id);
  const titleOf = (id: string): string => String((g.getRow(id) as Values | undefined)?.[f.title] ?? id);

  const panel = (tabDef: GanttDialogTab<Row>): ReactNode => {
    switch (tabDef.type) {
      case 'general':
        return (
          <div className="salmon-gantt-dialog__grid">
            <Field label={g.text('columnTitle')}>
              <input className="salmon-gantt-dialog__input" value={String(values[f.title] ?? '')} onChange={(e) => set(f.title, e.target.value)} aria-invalid={error === t('required') || undefined} data-autofocus="" />
            </Field>
            <Field label={g.text('columnStart')}>
              <DatePicker aria-label={g.text('columnStart')} granularity={fine ? 'minute' : 'day'} value={dateValue(f.start)} {...(tz ? { timeZone: tz } : {})} {...(g.props.locale ? { locale: g.props.locale } : {})} onValueChange={(v) => set(f.start, v ? dateOf(wallOf(v, undefined) as number, tz) : null)} />
            </Field>
            <Field label={g.text('columnEnd')}>
              <DatePicker aria-label={g.text('columnEnd')} granularity={fine ? 'minute' : 'day'} value={dateValue(f.end)} {...(tz ? { timeZone: tz } : {})} {...(g.props.locale ? { locale: g.props.locale } : {})} onValueChange={(v) => setValues((x) => ({ ...x, [f.end]: v ? dateOf(wallOf(v, undefined) as number, tz) : null, [f.duration]: undefined }))} />
            </Field>
            <Field label={g.text('columnDuration')}>
              <input
                className="salmon-gantt-dialog__input"
                defaultValue={d.id ? g.formatDuration(d.id) : ''}
                onBlur={(e) => {
                  const p = g.parseDuration(e.target.value);
                  if (p) setValues((x) => ({ ...x, [f.duration]: p.value, [f.durationUnit]: p.unit, [f.end]: undefined }));
                }}
              />
            </Field>
            <Field label={g.text('columnProgress')}>
              <input className="salmon-gantt-dialog__input" type="number" min={0} max={100} value={Number(values[f.progress] ?? 0)} onChange={(e) => set(f.progress, Number(e.target.value))} />
            </Field>
            <Field label={g.text('milestone')}>
              <input type="checkbox" checked={values[f.milestone] === true} onChange={(e) => set(f.milestone, e.target.checked)} />
            </Field>
            {g.props.taskMode === 'custom' ? (
              <Field label={g.text('manual')}>
                <input type="checkbox" checked={values[f.manual] === true} onChange={(e) => set(f.manual, e.target.checked)} />
              </Field>
            ) : null}
            {error ? (
              <p className="salmon-gantt-dialog__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        );
      case 'dependency':
        return (
          <div className="salmon-gantt-dialog__list">
            <table className="salmon-gantt-dialog__table">
              <thead>
                <tr>
                  <th>{t('predecessor')}</th>
                  <th>{t('dependencyType')}</th>
                  <th>{t('lag')}</th>
                  <th>
                    <span className="salmon-visually-hidden">{t('removeDependency')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {deps.map((dep, i) => (
                  <tr key={`${dep.id}-${i}`}>
                    <td>
                      <select aria-label={t('predecessor')} value={dep.id} onChange={(e) => setDeps((l) => l.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}>
                        {tasks.map((x) => (
                          <option key={x.id} value={x.id}>
                            {titleOf(x.id)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select aria-label={t('dependencyType')} value={dep.type} onChange={(e) => setDeps((l) => l.map((x, j) => (j === i ? { ...x, type: e.target.value as DependencyType } : x)))}>
                        {TYPES.filter((ty) => !g.props.dependencyTypes || g.props.dependencyTypes.includes(ty)).map((ty) => (
                          <option key={ty} value={ty}>
                            {t(ty)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input aria-label={t('lag')} className="salmon-gantt-dialog__input" type="number" value={dep.lag} onChange={(e) => setDeps((l) => l.map((x, j) => (j === i ? { ...x, lag: Number(e.target.value) } : x)))} />
                    </td>
                    <td>
                      <button type="button" className="salmon-gantt-dialog__button" onClick={() => setDeps((l) => l.filter((_, j) => j !== i))}>
                        {t('removeDependency')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="salmon-gantt-dialog__button" disabled={!tasks.length} onClick={() => setDeps((l) => [...l, { id: (tasks[0] as { id: string }).id, type: 'fs', lag: 0, lagUnit: 'day' }])}>
              {t('addDependency')}
            </button>
          </div>
        );
      case 'resources': {
        const idField = g.props.resourceFields?.id ?? 'id';
        const nameField = g.props.resourceFields?.name ?? 'name';
        return (
          <div className="salmon-gantt-dialog__list" role="group" aria-label={t('resources')}>
            {(g.props.resources ?? []).map((r) => {
              const rid = String(r[idField]);
              const assigned = res.find((x) => x.id === rid);
              return (
                <div key={rid} className="salmon-gantt-dialog__resource">
                  <label>
                    <input type="checkbox" checked={!!assigned} onChange={(e) => setRes((l) => (e.target.checked ? [...l, { id: rid, unit: 100 }] : l.filter((x) => x.id !== rid)))} />
                    {String(r[nameField] ?? rid)}
                  </label>
                  {assigned ? <input aria-label={`${String(r[nameField] ?? rid)} ${t('unit')}`} className="salmon-gantt-dialog__input" type="number" min={0} value={assigned.unit} onChange={(e) => setRes((l) => l.map((x) => (x.id === rid ? { ...x, unit: Number(e.target.value) } : x)))} /> : null}
                </div>
              );
            })}
          </div>
        );
      }
      case 'notes':
        return (
          <Field label={t('notes')}>
            <textarea className="salmon-gantt-dialog__textarea" rows={6} value={String(values[f.notes] ?? '')} onChange={(e) => set(f.notes, e.target.value)} />
          </Field>
        );
      case 'segments': {
        const segs = d.id ? (g.engine.getSchedule(d.id)?.segments ?? []) : [];
        return (
          <table className="salmon-gantt-dialog__table">
            <thead>
              <tr>
                <th>{t('segmentStart')}</th>
                <th>{t('segmentEnd')}</th>
              </tr>
            </thead>
            <tbody>
              {segs.map((s) => (
                <tr key={s.start}>
                  <td>{g.formatters?.date(s.start)}</td>
                  <td>{g.formatters?.date(s.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      case 'custom':
        return tabDef.render({ task: task ?? null, values, setValue: set });
    }
  };

  const labelOf = (x: GanttDialogTab<Row>): string => x.label ?? (x.type === 'custom' ? '' : t(x.type));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      className="salmon-gantt-dialog"
      title={d.mode === 'add' ? t('addTaskTitle') : t('editTaskTitle')}
      width={560}
      fullScreen={g.props.adaptive === true || g.narrow || undefined}
    >
      <DialogBody>
        <div role="tablist" className="salmon-gantt-dialog__tabs" aria-label={d.mode === 'add' ? t('addTaskTitle') : t('editTaskTitle')}>
          {tabs.map((x, i) => (
            <button key={labelOf(x) || i} type="button" role="tab" id={`gantt-tab-${i}`} aria-selected={i === tab} aria-controls={`gantt-panel-${i}`} tabIndex={i === tab ? 0 : -1} className="salmon-gantt-dialog__tab" onClick={() => setTab(i)} onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                setTab(n);
                (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
              }
            }}>
              {labelOf(x)}
            </button>
          ))}
        </div>
        {tabs.map((x, i) => (
          <div key={labelOf(x) || i} role="tabpanel" id={`gantt-panel-${i}`} aria-labelledby={`gantt-tab-${i}`} hidden={i !== tab} className="salmon-gantt-dialog__panel">
            {i === tab ? panel(x) : null}
          </div>
        ))}
      </DialogBody>
      <DialogFooter>
        <button type="button" className="salmon-gantt-dialog__button" data-variant="primary" onClick={save}>
          {t('save')}
        </button>
        <button type="button" className="salmon-gantt-dialog__button" onClick={close}>
          {t('cancel')}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

function ConflictDialog<Row>({ g }: { g: GanttInstance<Row> }) {
  const c = g.conflict;
  if (!c) return null;
  const first = c.conflicts[0];
  const title = (id: string | null): string => (id ? String((g.getRow(id) as Values | undefined)?.[g.fields.title] ?? id) : '');
  return (
    <Dialog open onOpenChange={(open) => !open && c.apply('cancel')} title={g.text('conflictTitle')} className="salmon-gantt-dialog" width={460}>
      <DialogBody>
        <p>{g.text('conflictMessage', { count: c.conflicts.length, task: title(first?.taskId ?? null), predecessor: title(first?.predecessorId ?? null) })}</p>
        <div className="salmon-gantt-dialog__choices" role="group">
          <button type="button" className="salmon-gantt-dialog__button" data-variant="primary" data-autofocus="" onClick={() => c.apply('move')}>
            {g.text('conflictMove')}
          </button>
          <button type="button" className="salmon-gantt-dialog__button" onClick={() => c.apply('removeLink')}>
            {g.text('conflictRemoveLink')}
          </button>
          <button type="button" className="salmon-gantt-dialog__button" onClick={() => c.apply('cancel')}>
            {g.text('conflictCancel')}
          </button>
        </div>
      </DialogBody>
    </Dialog>
  );
}

export interface MenuState {
  readonly kind: 'menu';
  readonly x: number;
  readonly y: number;
  readonly taskId: string | null;
  readonly items: readonly DataGridMenuItem[];
}

export function GanttPopups<Row>({ g, api, menu, onCloseMenu, formatters }: { g: GanttInstance<Row>; api: GanttApi<Row>; version: number; menu: MenuState | null; onCloseMenu: () => void; formatters: Formatters }): ReactNode {
  void formatters;
  return (
    <>
      {g.dialog ? <TaskDialog key={`${g.dialog.mode}:${g.dialog.id}`} g={g} api={api} /> : null}
      <ConflictDialog g={g} />
      {menu ? (
        <ContextMenu
          open
          anchorPoint={{ x: menu.x, y: menu.y }}
          items={menu.items.map((i) => ({ id: i.id, label: i.label ?? i.id, ...(i.disabled ? { disabled: true } : {}) }))}
          onOpenChange={(open) => {
            if (!open) onCloseMenu();
          }}
          onAction={(e) => {
            onCloseMenu();
            const ev = gridEvent<GanttContextMenuItemClickEvent<Row>>('contextMenuItemClick', 'pointer', { item: e.id, taskId: menu.taskId, task: menu.taskId ? (g.getRow(menu.taskId) ?? null) : null });
            g.props.onContextMenuItemClick?.(ev);
            if (!ev.defaultPrevented) runContextItem(g, e.id, menu.taskId, 'pointer');
          }}
          aria-label={g.text('label')}
        />
      ) : null}
    </>
  );
}
