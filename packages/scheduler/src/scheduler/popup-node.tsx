'use client';

// The open popup of a Scheduler (quick info, "+N more", the alerts and the
// editor dialog), rendered from the popups chunk so the handlers stay out of
// the initial JS. `PopupHost` is the Scheduler's state and actions at render.

import type { ReactNode } from 'react';
import type { EditScope } from '../internal/scheduler/crud.js';
import type { EventChanges } from '../internal/scheduler/fields.js';
import type { Occurrence } from '../internal/scheduler/types.js';
import type { EditorValues } from './editor.js';
import type { SchedulerLocaleText } from './locale.js';
import { MoreEvents, QuickInfo, SchedulerAlert } from './popups.js';
import type { SchedulerQuickInfo } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Host = Record<'popup' | 'hydrated' | 'zone' | 'rctx' | 'findOccurrence' | 'popups' | 'quickInfo' | 'can' | 'closePopup' | 'doAdd' | 'newRowFor' | 'store' | 'openEditorFor' | 'requestEdit' | 'requestDelete' | 'occurrences' | 'openPopup' | 'latest' | 't' | 'doDelete' | 'editorModule' | 'resDefs' | 'editorError' | 'setEditorError' | 'isRecurring' | 'putRes' | 'editing' | 'resInfo' | 'doSave' | 'validateSeries', any>;

type Row = unknown;

/** `host`: the Scheduler's state and actions at render (see `Host`). */
export function renderPopup(host: object): ReactNode {
  const h = host as Host;
  const { popup, hydrated, zone, rctx, findOccurrence, popups, quickInfo, can, closePopup, doAdd, newRowFor, store, openEditorFor, requestEdit, requestDelete, occurrences, openPopup, latest, t, doDelete, editorModule, resDefs, editorError, setEditorError, isRecurring, putRes, editing, resInfo, doSave, validateSeries } = h;
  if (!popup || !hydrated || !zone || !rctx) return null;
  const occ = popup.key ? findOccurrence(popup.key) : null;
  switch (popup.kind) {
    case 'quickInfo': {
      if (!popup.anchor || !quickInfo) return null;
      const start = occ?.start ?? popup.cells?.start ?? 0;
      const end = occ?.end ?? popup.cells?.end ?? 0;
      const editableEvent = occ && !occ.event.readOnly && !occ.event.block;
      return (
        <QuickInfo
          anchor={popup.anchor}
          occurrence={occ as Occurrence<unknown> | null}
          start={start}
          end={end}
          allDay={occ?.allDay ?? popup.cells?.allDay ?? false}
          config={quickInfo as SchedulerQuickInfo<unknown>}
          canAdd={can.add}
          canEdit={!!(can.edit && editableEvent)}
          canDelete={!!(can.delete && occ && !occ.event.readOnly)}
          onClose={() => closePopup('pointer')}
          onSaveTitle={(title) => {
            const cells = popup.cells;
            closePopup('pointer');
            if (cells) doAdd([newRowFor(cells, title)], 'pointer');
          }}
          onMoreDetails={(title) => {
            const cells = popup.cells;
            store.set({ popup: null });
            if (cells) openEditorFor(null, cells, 'add', 'pointer', 'series', title);
          }}
          onEdit={() => {
            store.set({ popup: null });
            // The event gets focus first, so the next popup gives it back there.
            (popup.returnFocus as HTMLElement | null | undefined)?.focus?.({ preventScroll: true });
            if (occ) requestEdit(occ, 'pointer');
          }}
          onDelete={() => {
            store.set({ popup: null });
            (popup.returnFocus as HTMLElement | null | undefined)?.focus?.({ preventScroll: true });
            if (occ) requestDelete(occ, 'pointer');
          }}
        />
      );
    }
    case 'moreEvents': {
      if (!popup.anchor || popup.day === undefined) return null;
      const day = popup.day;
      const list = (occurrences as Occurrence<Row>[]).filter((o) => zone.day(o.start) <= day && zone.day(Math.max(o.start, o.end - 1)) >= day);
      return (
        <MoreEvents
          anchor={popup.anchor}
          day={day}
          occurrences={list as Occurrence<unknown>[]}
          onClose={() => closePopup('pointer')}
          onOpen={(o, el) => {
            store.set({ popup: null, selectedEventKeys: [o.key] });
            if (quickInfo) openPopup({ kind: 'quickInfo', key: o.key, anchor: popup.anchor ?? el, returnFocus: popup.returnFocus ?? null }, o.event.row as Row, o.start, o.end, 'pointer');
          }}
        />
      );
    }
    case 'recurrenceAlert': {
      if (!occ) return null;
      const ed = typeof latest.current.editing === 'object' ? latest.current.editing : {};
      const del = popup.action === 'delete';
      const scopes: EditScope[] = ed.following ? ['occurrence', 'following', 'series'] : ['occurrence', 'series'];
      const label = { occurrence: t('scopeOccurrence'), following: t('scopeFollowing'), series: t('scopeSeries') };
      return (
        <SchedulerAlert
          kind="recurrence"
          title={t(del ? 'recurrenceDeleteTitle' : 'recurrenceEditTitle')}
          message={t(del ? 'recurrenceDeleteMessage' : 'recurrenceEditMessage')}
          onClose={() => closePopup('keyboard')}
          buttons={[
            ...scopes.map((s) => ({
              label: label[s],
              value: s,
              primary: s === 'occurrence',
              onClick: () => {
                store.set({ popup: null });
                if (del) doDelete(occ, s, 'pointer');
                else if (popup.action === 'save') (popup.payload as (s: EditScope) => void)(s);
                else openEditorFor(occ, null, s === 'occurrence' ? 'editOccurrence' : 'editSeries', 'pointer', s);
              },
            })),
            { label: t('cancel'), onClick: () => closePopup('pointer') },
          ]}
        />
      );
    }
    case 'deleteAlert': {
      if (!occ) return null;
      return (
        <SchedulerAlert
          kind="delete"
          title={t('deleteTitle')}
          message={t('deleteMessage')}
          onClose={() => closePopup('keyboard')}
          buttons={[
            {
              label: t('delete'),
              primary: true,
              onClick: () => {
                closePopup('pointer');
                doDelete(occ, 'series', 'pointer');
              },
            },
            { label: t('cancel'), onClick: () => closePopup('pointer') },
          ]}
        />
      );
    }
    case 'overlapAlert':
    case 'validationAlert':
      return <SchedulerAlert kind={popup.kind} title={t(popup.kind === 'overlapAlert' ? 'overlapTitle' : 'validationTitle')} message={popup.message ?? ''} onClose={() => closePopup('keyboard')} buttons={[{ label: t('ok'), primary: true, onClick: () => closePopup('pointer') }]} />;
    case 'editor': {
      if (!editorModule) return null;
      const Editor = editorModule.EventEditor;
      const isNew = !occ;
      const rec = occ?.event;
      const payload = (popup.payload ?? {}) as { scope?: EditScope; title?: string; rule?: string };
      const scope: EditScope = payload.scope ?? (popup.mode === 'editOccurrence' ? 'occurrence' : 'series');
      const startBase = occ ? (scope === 'series' && rec && occ.generated ? rec.start : occ.start) : (popup.cells?.start ?? 0);
      const endBase = occ ? (scope === 'series' && rec && occ.generated ? rec.end : occ.end) : (popup.cells?.end ?? 0);
      // The lazy editor chunk builds its values, labels, rules, defaults and zone list.
      return (
        <Editor
          key={popup.key ?? 'new'}
          isNew={isNew}
          rec={rec}
          cells={popup.cells}
          start={startBase}
          end={endBase}
          payload={payload}
          showRepeat={scope !== 'occurrence' && !(rec && rec.recurrenceId !== undefined)}
          canDelete={!isNew && can.delete && !rec?.readOnly}
          resources={resDefs}
          error={editorError}
          onCancel={() => {
            setEditorError(null);
            closePopup('pointer');
          }}
          onDelete={() => {
            setEditorError(null);
            store.set({ popup: null });
            if (occ) {
              if (scope === 'occurrence' || !isRecurring(occ)) doDelete(occ, isRecurring(occ) ? scope : 'series', 'pointer');
              else requestDelete(occ, 'pointer');
            }
          }}
          onSave={(v: EditorValues) => {
            setEditorError(null);
            if (isNew) {
              const row = newRowFor({ start: v.start, end: v.end, allDay: v.allDay }, v.title);
              const f = rctx.fields;
              const r = row as unknown as Record<string, unknown>;
              if (v.location) r[f.location] = v.location;
              if (v.description) r[f.description] = v.description;
              if (v.recurrenceRule) r[f.recurrenceRule] = v.recurrenceRule;
              if (v.startTimeZone) r[f.startTimeZone] = v.startTimeZone;
              if (v.endTimeZone) r[f.endTimeZone] = v.endTimeZone;
              putRes(r, v);
              Object.assign(r, v.extra);
              if (v.recurrenceRule && editing.validateRecurrence !== false) {
                const problem = validateSeries(v.recurrenceRule, v.start, v.end);
                if (problem) {
                  setEditorError(t(problem));
                  return;
                }
              }
              const res = doAdd([row], 'pointer');
              if (res.status !== 'rejected' && res.status !== 'cancelled') closePopup('pointer');
              return;
            }
            if (!occ || !rec) return;
            const changes: EventChanges = {
              title: v.title,
              location: v.location,
              description: v.description,
              allDay: v.allDay,
              start: v.start,
              end: v.end,
              startTimeZone: v.startTimeZone || null,
              endTimeZone: v.endTimeZone || null,
              resources: Object.fromEntries(resInfo.map((x: { field: string }) => [x.field, (v[x.field] as unknown[] | undefined) ?? []])),
              ...(scope === 'occurrence' ? {} : { recurrenceRule: v.recurrenceRule }),
              extra: v.extra,
            };
            // A series edit reports times relative to the series start; saveSeries shifts by the occurrence delta.
            const target: Occurrence<Row> = scope === 'series' && occ.generated ? { ...occ, start: rec.start, end: rec.end, generated: false } : occ;
            const res = doSave(scope === 'series' && occ.generated ? { ...target, generated: false } : target, changes, rec.recurrenceRule || rec.recurrenceId !== undefined ? scope : 'series', 'pointer');
            if (res.status === 'rejected' && res.reason && res.reason !== 'overlap') setEditorError(t(res.reason as keyof SchedulerLocaleText));
            else if (res.status !== 'rejected' && res.status !== 'cancelled') closePopup('pointer');
          }}
        />
      );
    }
  }
}
