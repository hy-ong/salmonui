'use client';

// Quick info and "+N more" popovers, and the alert dialogs. Popovers are the public
// `Popover` (`@salmonui/overlays/popover`); the editor and the alerts are the
// dialog core that the public `Dialog` / `AlertDialog` render (`DialogRoot`,
// without the drag and resize chunk loader), a `showModal()` `<dialog>` whose Select, DatePicker
// and RecurrenceEditor popups portal into it. The dialog is portaled to the Scheduler's theme scope,
// outside the Scheduler root, so the root's key handling never sees its
// keys. Nothing renders on the server.

import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DialogDescription, DialogFooter, DialogRoot, DialogTitle } from '@salmonui/core/internal/dialog-core/Dialog';
import { themeScopeOf } from '@salmonui/core/internal/overlay';
import type { Occurrence } from '../internal/scheduler/types.js';
import { Popover, PopoverContent, PopoverTitle } from '@salmonui/overlays/popover';
import { useScheduler } from './context.js';
import { Icon } from './views.js';
import type { SchedulerQuickInfo, SchedulerQuickInfoContext } from './types.js';

/** The theme scope around the Scheduler root, read after mount (the dialog mounts one render later, before paint). */
function useScope(): Element | null {
  const { root } = useScheduler();
  const [scope, setScope] = useState<Element | null>(null);
  useLayoutEffect(() => setScope(themeScopeOf(root.current) ?? null), [root]);
  return scope;
}

/** The modal `Dialog` (`kind: 'alert'` is `role="alertdialog"`), always open while mounted; Escape and the host's close requests call `onClose`. */
export function SchedulerDialog(props: { readonly label: string; readonly className?: string; readonly onClose: () => void; readonly children: ReactNode; readonly kind?: 'dialog' | 'alert' }) {
  const { props: p } = useScheduler();
  const scope = useScope();
  if (!scope) return null;
  return createPortal(
    <DialogRoot
      kind={props.kind ?? 'dialog'}
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      aria-label={props.label}
      className={props.className}
      dir={p.dir}
    >
      {props.children}
    </DialogRoot>,
    scope,
  );
}

export interface AlertButton {
  readonly label: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
  readonly value?: string;
}

/** Recurrence scope, delete, overlap and validation alerts: `role="alertdialog"` with up to four actions (more than the two of `AlertDialog`). */
export function SchedulerAlert(props: { readonly title: string; readonly message: string; readonly buttons: readonly AlertButton[]; readonly onClose: () => void; readonly kind: string }) {
  return (
    <SchedulerDialog label={props.title} kind="alert" className="salmon-scheduler__alert" onClose={props.onClose}>
      <DialogTitle>{props.title}</DialogTitle>
      <DialogDescription data-alert={props.kind}>{props.message}</DialogDescription>
      <DialogFooter>
        {props.buttons.map((b, i) => (
          <button key={b.label} type="button" className="salmon-scheduler__button" data-primary={b.primary ? '' : undefined} data-value={b.value} data-autofocus={i === 0 ? '' : undefined} onClick={b.onClick}>
            {b.label}
          </button>
        ))}
      </DialogFooter>
    </SchedulerDialog>
  );
}

/** A controlled public `Popover` anchored at a Scheduler element; the Scheduler gives focus back itself. */
function SchedulerPopover(props: { readonly anchor: Element; readonly onClose: () => void; readonly className: string; readonly kind?: string; readonly children: ReactNode }) {
  const { props: p } = useScheduler();
  const anchor = useMemo(() => ({ current: props.anchor }), [props.anchor]);
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      anchor={anchor}
      placement="bottomStart"
      offset={4}
      returnFocus={false}
    >
      <PopoverContent className={props.className} data-kind={props.kind} dir={p.dir}>
        {props.children}
      </PopoverContent>
    </Popover>
  );
}

export interface QuickInfoProps {
  readonly anchor: Element;
  readonly occurrence: Occurrence<unknown> | null;
  readonly start: number;
  readonly end: number;
  readonly allDay: boolean;
  readonly config: SchedulerQuickInfo<unknown>;
  readonly canAdd: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly onClose: () => void;
  readonly onSaveTitle: (title: string) => void;
  readonly onMoreDetails: (title: string) => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function QuickInfo(props: QuickInfoProps) {
  const { t, fmt, zone } = useScheduler();
  const [title, setTitle] = useState('');
  const o = props.occurrence;
  const ctx: SchedulerQuickInfoContext<unknown> = { kind: o ? 'event' : 'cell', row: o?.event.row ?? null, start: new Date(props.start), end: new Date(props.end), allDay: props.allDay, close: props.onClose };
  const rangeText = o ? fmt.range(o) : props.allDay ? fmt.fullDate(zone.day(props.start)) : `${fmt.fullDate(zone.day(props.start))}, ${fmt.time(zone.wall(props.start))} – ${fmt.time(zone.wall(props.end))}`;
  const c = props.config;
  return (
    <SchedulerPopover anchor={props.anchor} onClose={props.onClose} className="salmon-scheduler__quick-info" kind={o ? 'event' : 'cell'}>
      <div className="salmon-scheduler__quick-info-header">
        {c.renderHeader ? c.renderHeader(ctx) : <PopoverTitle className="salmon-scheduler__dialog-title">{o ? o.event.title || t('noTitle') : t('newEvent')}</PopoverTitle>}
        <button type="button" className="salmon-scheduler__icon-button" aria-label={t('close')} onClick={props.onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="salmon-scheduler__quick-info-content">
        {c.renderContent ? (
          c.renderContent(ctx)
        ) : o ? (
          <>
            <p className="salmon-scheduler__quick-info-time">{rangeText}</p>
            {o.event.location ? <p className="salmon-scheduler__quick-info-location">{o.event.location}</p> : null}
            {o.event.description ? <p className="salmon-scheduler__quick-info-description">{o.event.description}</p> : null}
          </>
        ) : (
          <>
            <input
              className="salmon-scheduler__input"
              aria-label={t('fieldTitle')}
              placeholder={t('addTitle')}
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  props.onSaveTitle(title);
                }
              }}
            />
            <p className="salmon-scheduler__quick-info-time">{rangeText}</p>
          </>
        )}
      </div>
      <div className="salmon-scheduler__dialog-actions">
        {c.renderFooter ? (
          c.renderFooter(ctx)
        ) : o ? (
          <>
            {props.canEdit ? (
              <button type="button" className="salmon-scheduler__button" onClick={props.onEdit}>
                {t('edit')}
              </button>
            ) : null}
            {props.canDelete ? (
              <button type="button" className="salmon-scheduler__button" data-tone="danger" onClick={props.onDelete}>
                {t('delete')}
              </button>
            ) : null}
          </>
        ) : props.canAdd ? (
          <>
            <button type="button" className="salmon-scheduler__button" onClick={() => props.onMoreDetails(title)}>
              {t('moreDetails')}
            </button>
            <button type="button" className="salmon-scheduler__button" data-primary="" onClick={() => props.onSaveTitle(title)}>
              {t('save')}
            </button>
          </>
        ) : null}
      </div>
    </SchedulerPopover>
  );
}

export function MoreEvents(props: { readonly anchor: Element; readonly day: number; readonly occurrences: readonly Occurrence<unknown>[]; readonly onClose: () => void; readonly onOpen: (o: Occurrence<unknown>, el: Element) => void }) {
  const { t, fmt, actions } = useScheduler();
  return (
    <SchedulerPopover anchor={props.anchor} onClose={props.onClose} className="salmon-scheduler__more-popup">
      <div className="salmon-scheduler__quick-info-header">
        <PopoverTitle className="salmon-scheduler__dialog-title">
          {/* The date goes to the day view (Year view). */}
          <button
            type="button"
            className="salmon-scheduler__date-link"
            onClick={(e) => {
              props.onClose();
              actions.goToDay(props.day, e.detail === 0 ? 'keyboard' : 'pointer');
            }}
          >
            {t('moreEventsTitle', { date: fmt.fullDate(props.day) })}
          </button>
        </PopoverTitle>
        <button type="button" className="salmon-scheduler__icon-button" aria-label={t('close')} onClick={props.onClose}>
          <Icon name="close" />
        </button>
      </div>
      <ul className="salmon-scheduler__more-list">
        {props.occurrences.map((o) => (
          <li key={o.key}>
            <button type="button" className="salmon-scheduler__more-item" data-key={o.key} onClick={(e) => props.onOpen(o, e.currentTarget)}>
              <span className="salmon-scheduler__event-title">{o.event.title || t('noTitle')}</span>
              <span className="salmon-scheduler__event-time">{fmt.range(o)}</span>
            </button>
          </li>
        ))}
      </ul>
    </SchedulerPopover>
  );
}

export { renderPopup } from './popup-node.js';
