'use client';

// The built-in editor dialog: a lazy chunk, loaded when the browser is idle after
// mount and at once on first open. Fields are the public `DatePicker`
// (date-time or date granularity), `Select` (searchable time zones) and the
// embedded `RecurrenceEditor`; the dialog is the public `Dialog` (a modal
// `<dialog>`; the field popups portal into it).

import { useId, useState } from 'react';
import { DatePicker } from '@salmonui/calendars/date-picker';
// The bare control: the editor renders its own labels (no field parts in the bundle).
import { Select } from '@salmonui/dropdowns/internal/select';
import { RecurrenceEditor } from '../recurrence-editor/RecurrenceEditor.js';
import { validateFields, type FieldValidation } from '../internal/scheduler/field-rules.js';
import { createZoneConverter, DAY_MS, type ZoneConverter } from '../internal/scheduler/time.js';
import { useScheduler } from './context.js';
import { DialogBody, DialogFooter, DialogTitle } from '@salmonui/core/internal/dialog-core/Dialog';
import { SchedulerDialog } from './popups.js';
import type { SchedulerDialogContext, SchedulerResource } from './types.js';
import type { EventRecord } from '../internal/scheduler/types.js';

export interface EditorValues {
  title: string;
  location: string;
  description: string;
  start: number;
  end: number;
  allDay: boolean;
  startTimeZone: string;
  endTimeZone: string;
  recurrenceRule: string | null;
  /** Row properties outside the roles that a custom dialog changed. */
  extra?: Record<string, unknown> | undefined;
  [role: string]: unknown;
}

export interface EditorProps {
  readonly isNew: boolean;
  /** The edited event (null for a new one) and the cells a new one starts from. */
  readonly rec: EventRecord | undefined;
  readonly cells: { readonly allDay: boolean; readonly resources?: Readonly<Record<string, readonly unknown[]>> | undefined } | undefined;
  readonly start: number;
  readonly end: number;
  readonly payload: { readonly title?: string; readonly rule?: string };
  /** Show the repeat part (not when editing one occurrence). */
  readonly showRepeat: boolean;
  readonly canDelete: boolean;
  /** Resource fields: one Select per resource, multiple for `multiple` resources. */
  readonly resources: readonly SchedulerResource<object>[];
  readonly error: string | null;
  readonly onSave: (values: EditorValues) => void;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}

const pad = (n: number): string => String(n).padStart(2, '0');
function wallIso(epoch: number, z: ZoneConverter, dateOnly: boolean): string {
  const d = new Date(z.wall(epoch));
  const date = `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return dateOnly ? date : `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function EventEditor(props: EditorProps) {
  const { t, zone, props: p, text, locale } = useScheduler();
  const cfg = (p.eventFields ?? {}) as Readonly<Record<string, string | { readonly field?: string; readonly label?: string; readonly defaultValue?: unknown; readonly validation?: FieldValidation } | undefined>>;
  const of = (role: string) => {
    const c = cfg[role];
    return typeof c === 'object' ? c : undefined;
  };
  const { rec, payload } = props;
  const row = (rec?.row ?? {}) as Readonly<Record<string, unknown>>;
  const initial: EditorValues = {
    title: rec?.title ?? payload.title ?? '',
    location: rec?.location ?? '',
    description: rec?.description ?? '',
    start: props.start,
    end: props.end,
    allDay: rec?.allDay ?? props.cells?.allDay ?? false,
    startTimeZone: rec?.startTimeZone ?? '',
    endTimeZone: rec?.endTimeZone ?? '',
    recurrenceRule: rec?.recurrenceRule ?? payload.rule ?? null,
  };
  for (const r of props.resources) initial[r.field] = [...(rec?.resources[r.field] ?? props.cells?.resources?.[r.field] ?? [])];
  // Roles, resource fields and mapped properties; any other row property reaches a custom dialog by its own name.
  const known = new Set<string>([...Object.keys(initial), 'id', 'block', 'readOnly', 'recurrenceId', 'recurrenceExceptions', 'followingId']);
  for (const c of Object.values(cfg)) known.add((typeof c === 'object' ? c.field : c) ?? '');
  const [values, setValues] = useState<EditorValues>(() => {
    const v: EditorValues = { ...initial };
    // A new event starts from the `defaultValue` of its text roles.
    if (props.isNew) for (const role of ['title', 'location', 'description'] as const) v[role] ||= String(of(role)?.defaultValue ?? '');
    else for (const [k, x] of Object.entries(row)) if (!known.has(k)) v[k] = x;
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const id = useId();
  // Event zones picked in the editor get their own converter (cheap; caches fill on use).
  const zoneOf = (name: string): ZoneConverter => (name && name !== zone.zone ? createZoneConverter(name) : zone);
  const set = (role: string, value: unknown): void => setValues((v) => ({ ...v, [role]: value }));
  const label = (role: string, key: keyof typeof text): string => of(role)?.label ?? t(key);
  const save = (): void => {
    const errs = validateFields(values, Object.fromEntries(Object.keys(cfg).map((role) => [role, of(role)?.validation])), { required: t('required'), minLength: t('minLength'), maxLength: t('maxLength'), pattern: t('pattern') });
    if (values.end < values.start || (values.allDay && values.end <= values.start)) errs['end'] = t('endBeforeStart');
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      (document.getElementById(`${id}${first}`) as HTMLElement | null)?.focus?.();
      return;
    }
    let extra: Record<string, unknown> | undefined;
    for (const [k, x] of Object.entries(values)) if (!known.has(k) && x !== row[k]) (extra ??= {})[k] = x;
    props.onSave({ ...values, extra });
  };
  const dialogCtx: SchedulerDialogContext<unknown> = { isNew: props.isNew, values, setValue: set, errors, row: rec?.row ?? null, save, cancel: props.onCancel, delete: props.onDelete };
  const editing = typeof p.editing === 'object' ? p.editing : undefined;
  const sz = zoneOf(values.startTimeZone);
  const ez = zoneOf(values.endTimeZone || values.startTimeZone);
  let zones: readonly string[] = p.timeZones ?? [];
  if (!p.timeZones) {
    try {
      zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      zones = [];
    }
  }
  const zoneData = zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
  const fieldError = (role: string) =>
    errors[role] ? (
      <span id={`${id}${role}-error`} className="salmon-scheduler__field-error" role="alert">
        {errors[role]}
      </span>
    ) : null;
  return (
    <SchedulerDialog label={props.isNew ? t('newEventTitle') : t('editEventTitle')} className="salmon-scheduler__editor" onClose={props.onCancel}>
      <form
        className="salmon-scheduler__editor-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {/* Custom header and footer content sits in the dialog's padded title and footer slots. */}
        {editing?.renderDialogHeader ? <div className="salmon-dialog-title">{editing.renderDialogHeader(dialogCtx)}</div> : <DialogTitle>{props.isNew ? t('newEventTitle') : t('editEventTitle')}</DialogTitle>}
        <DialogBody>
        {props.error ? (
          <p className="salmon-scheduler__field-error" role="alert">
            {props.error}
          </p>
        ) : null}
        {editing?.renderDialog ? (
          editing.renderDialog(dialogCtx)
        ) : (
          <div className="salmon-scheduler__editor-fields">
            <label className="salmon-scheduler__field">
              <span>{label('title', 'fieldTitle')}</span>
              <input id={`${id}title`} className="salmon-scheduler__input" value={values.title} data-autofocus="" aria-invalid={errors['title'] ? true : undefined} aria-describedby={errors['title'] ? `${id}title-error` : undefined} onChange={(e) => set('title', e.currentTarget.value)} />
              {fieldError('title')}
            </label>
            <label className="salmon-scheduler__field">
              <span>{label('location', 'fieldLocation')}</span>
              <input id={`${id}location`} className="salmon-scheduler__input" value={values.location} aria-invalid={errors['location'] ? true : undefined} onChange={(e) => set('location', e.currentTarget.value)} />
              {fieldError('location')}
            </label>
            {props.resources.map((r) => {
              const items = (r.data as Record<string, unknown>[]).map((it) => ({ value: it[r.idField ?? 'id'] as string | number, label: String(it[r.textField ?? 'text'] ?? '') }));
              const v = (values[r.field] as (string | number)[] | undefined) ?? [];
              const lid = `${id}res-${r.field}`;
              return (
                <div className="salmon-scheduler__field" key={r.field} data-resource-field={r.field}>
                  <span id={lid}>{of(r.field)?.label ?? r.label ?? r.name}</span>
                  {r.multiple ? (
                    <Select aria-labelledby={lid} multiple data={items} value={v} onValueChange={(x) => set(r.field, [...x])} />
                  ) : (
                    <Select aria-labelledby={lid} data={items} value={v[0] ?? null} clearable onValueChange={(x) => set(r.field, x === null ? [] : [x])} />
                  )}
                </div>
              );
            })}
            <div className="salmon-scheduler__field-row">
              <DatePicker
                label={label('start', 'fieldStart')}
                className="salmon-scheduler__editor-start"
                granularity={values.allDay ? 'day' : 'minute'}
                locale={locale}
                hourCycle={p.hourCycle}
                value={wallIso(values.start, sz, values.allDay)}
                onValueChange={(v) => {
                  if (!v) return;
                  const w = Date.UTC(v.year, v.month - 1, v.day, 'hour' in v ? v.hour : 0, 'minute' in v ? v.minute : 0);
                  const start = sz.instant(w);
                  setValues((s) => ({ ...s, start, end: Math.max(start + (s.allDay ? DAY_MS : 0), s.end + (start - s.start)) }));
                }}
              />
              <DatePicker
                label={label('end', 'fieldEnd')}
                className="salmon-scheduler__editor-end"
                granularity={values.allDay ? 'day' : 'minute'}
                locale={locale}
                hourCycle={p.hourCycle}
                invalid={!!errors['end']}
                errorMessage={errors['end']}
                value={wallIso(values.allDay ? values.end - 1 : values.end, ez, values.allDay)}
                onValueChange={(v) => {
                  if (!v) return;
                  const w = Date.UTC(v.year, v.month - 1, v.day, 'hour' in v ? v.hour : 0, 'minute' in v ? v.minute : 0);
                  set('end', values.allDay ? ez.instant(w + DAY_MS) : ez.instant(w));
                }}
              />
            </div>
            <label className="salmon-scheduler__check">
              <input
                type="checkbox"
                checked={values.allDay}
                onChange={(e) => {
                  const allDay = e.currentTarget.checked;
                  setValues((s) => {
                    if (!allDay) return { ...s, allDay, end: s.start + 3_600_000 };
                    const d0 = zone.day(s.start);
                    const d1 = Math.max(d0 + 1, zone.day(s.end - 1) + 1);
                    return { ...s, allDay, start: zone.dayStart(d0), end: zone.dayStart(d1) };
                  });
                }}
              />
              <span>{label('allDay', 'fieldAllDay')}</span>
            </label>
            {!values.allDay && zones.length ? (
              <div className="salmon-scheduler__field-row">
                <div className="salmon-scheduler__field">
                  <span id={`${id}sz`}>{label('startTimeZone', 'fieldStartTimeZone')}</span>
                  <Select aria-labelledby={`${id}sz`} searchable data={zoneData} value={values.startTimeZone || null} clearable placeholder={zone.zone} onValueChange={(v) => set('startTimeZone', v ? String(v) : '')} />
                </div>
                <div className="salmon-scheduler__field">
                  <span id={`${id}ez`}>{label('endTimeZone', 'fieldEndTimeZone')}</span>
                  <Select aria-labelledby={`${id}ez`} searchable data={zoneData} value={values.endTimeZone || null} clearable placeholder={zone.zone} onValueChange={(v) => set('endTimeZone', v ? String(v) : '')} />
                </div>
              </div>
            ) : null}
            {props.showRepeat ? (
              <div className="salmon-scheduler__field">
                <RecurrenceEditor aria-label={label('recurrenceRule', 'fieldRepeat')} value={values.recurrenceRule} start={wallIso(values.start, sz, false)} locale={locale} firstDayOfWeek={p.firstDayOfWeek} onValueChange={(r) => set('recurrenceRule', r)} />
              </div>
            ) : null}
            <label className="salmon-scheduler__field">
              <span>{label('description', 'fieldDescription')}</span>
              <textarea id={`${id}description`} className="salmon-scheduler__input" rows={3} value={values.description} onChange={(e) => set('description', e.currentTarget.value)} />
              {fieldError('description')}
            </label>
          </div>
        )}
        </DialogBody>
        {editing?.renderDialogFooter ? (
          <DialogFooter>{editing.renderDialogFooter(dialogCtx)}</DialogFooter>
        ) : (
          <DialogFooter>
            {props.canDelete ? (
              <button type="button" className="salmon-scheduler__button" data-tone="danger" onClick={props.onDelete}>
                {t('delete')}
              </button>
            ) : null}
            <button type="button" className="salmon-scheduler__button" onClick={props.onCancel}>
              {t('cancel')}
            </button>
            <button type="submit" className="salmon-scheduler__button" data-primary="">
              {t('save')}
            </button>
          </DialogFooter>
        )}
      </form>
    </SchedulerDialog>
  );
}
