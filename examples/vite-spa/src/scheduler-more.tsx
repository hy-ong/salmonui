// More Scheduler scenarios (scheduler.html?set=more; tests/browser/scheduler-more.spec.ts):
// cell selection, the all-day row, cell templates, click and hover events,
// calendars and formats, editor and quick info templates, inline editing.
import { useState } from 'react';
import { Scheduler, type EventId, type SchedulerApi } from '@salmonui/scheduler';
import { WEEK_DATA } from './scheduler-scenarios.tsx';
import '@salmonui/scheduler/styles.css';

type Row = Record<string, unknown>;
type Log = (id: string, type: string) => (value: unknown, details?: unknown) => void;

const ALL_DAY: Row[] = [
  { id: 1, title: 'Trip A', start: '2026-11-24', end: '2026-11-25', allDay: true },
  { id: 2, title: 'Trip B', start: '2026-11-24', end: '2026-11-26', allDay: true },
  { id: 3, title: 'Trip C', start: '2026-11-24', end: '2026-11-25', allDay: true },
  { id: 4, title: 'Meeting', start: '2026-11-24T10:00', end: '2026-11-24T11:00' },
];

function ControlledSelection({ log }: { log: Log }) {
  const [ids, setIds] = useState<readonly EventId[]>([2]);
  return (
    <>
      <Scheduler
        data={WEEK_DATA}
        view="week"
        date="2026-11-23"
        timeZone="UTC"
        height={520}
        quickInfo={false}
        selectedEventIds={ids}
        onEventSelectionChange={(next, e) => {
          log('sched-selection', 'selection')(next, { keys: e.keys, source: e.source });
          setIds(next);
        }}
      />
      <button type="button" data-testid="select-standup" onClick={() => setIds([1])}>
        Select standup
      </button>
    </>
  );
}

export function SchedulerMoreScenarios({ log, Block }: { log: Log; Block: (p: { id: string; children: React.ReactNode }) => React.ReactElement }) {
  const api = (id: string) => (a: SchedulerApi<Row> | null) => {
    if (a) window.__schedApi[id] = a;
  };
  const sel = (id: string) => (e: { start: Date; end: Date; allDay: boolean }) => log(id, 'selection')({ start: e.start.toISOString(), end: e.end.toISOString(), allDay: e.allDay });
  const common = { view: 'week', date: '2026-11-23', timeZone: 'UTC', height: 520 } as const;
  return (
    <>
      <Block id="sched-select">
        <Scheduler ref={api('sched-select')} data={WEEK_DATA} {...common} draggable={false} cellSelection="multiple" quickInfo={{ onSelectionEnd: true }} onCellSelectionChange={sel('sched-select')} />
      </Block>
      <Block id="sched-select-col">
        <Scheduler ref={api('sched-select-col')} data={WEEK_DATA} {...common} draggable={false} cellSelection="multiple" cellSelectionRows={false} quickInfo={false} onCellSelectionChange={sel('sched-select-col')} />
      </Block>
      <Block id="sched-allday">
        <Scheduler ref={api('sched-allday')} data={ALL_DAY} {...common} eventLayout={{ maxHeight: 1 }} allDayRowScroll onAllDayRowExpandedChange={log('sched-allday', 'expanded')} />
      </Block>
      <Block id="sched-tpl-week">
        <Scheduler
          ref={api('sched-tpl-week')}
          data={ALL_DAY}
          {...common}
          renderDateHeader={(c) => <span data-testid="date-header">{`D:${String(c.date)}`}</span>}
          renderHeaderIndent={() => <span data-testid="indent">TZ</span>}
          renderCell={(c) => (c.part === 'workCell' && c.start.getUTCHours() === 12 && c.start.getUTCMinutes() === 0 ? <span data-testid="noon" className="noon-mark" /> : null)}
          onHover={(e) => log('sched-tpl-week', 'hover')(e.part, { id: e.row ? e.row['id'] : null })}
          onCellDoubleClick={(e) => {
            log('sched-tpl-week', 'cellDoubleClick')(e.start.toISOString());
            e.preventDefault();
          }}
          onEventDoubleClick={(e) => {
            log('sched-tpl-week', 'eventDoubleClick')(e.row['id']);
            e.preventDefault();
          }}
          onEventClick={(e) => log('sched-tpl-week', 'eventClick')(e.row['id'])}
        />
      </Block>
      <Block id="sched-tpl-month">
        <Scheduler ref={api('sched-tpl-month')} data={ALL_DAY} view="month" views={['month']} date="2026-11-23" timeZone="UTC" height={520} renderCellHeader={(c) => <span data-testid="cell-header">{`#${c.date.day}`}</span>} renderCell={(c) => (c.date.day === 1 ? <span data-testid="first-of-month">1st</span> : null)} />
      </Block>
      <Block id="sched-islamic">
        <Scheduler data={ALL_DAY} view="month" views={['month', 'week']} date="2026-11-23" timeZone="UTC" height={420} calendar="islamic-umalqura" />
      </Block>
      <Block id="sched-formats">
        <Scheduler data={ALL_DAY} {...common} locale="en-GB" hourCycle="h23" dateFormat={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
      </Block>
      <Block id="sched-dialog-tpl">
        <Scheduler
          ref={api('sched-dialog-tpl')}
          data={ALL_DAY}
          {...common}
          onSave={(e) => log('sched-dialog-tpl', 'save')(e.changed)}
          onAdd={(e) => log('sched-dialog-tpl', 'add')(e.rows)}
          editing={{
            renderDialogHeader: (c) => <h2 data-testid="dlg-header">{c.isNew ? 'Create' : `Edit ${String(c.values['title'])}`}</h2>,
            renderDialog: (c) => (
              <label>
                Name
                <input data-testid="dlg-title" value={String(c.values['title'] ?? '')} onChange={(e) => c.setValue('title', e.currentTarget.value)} />
              </label>
            ),
            renderDialogFooter: (c) => (
              <div>
                <button type="button" data-testid="dlg-save" onClick={c.save}>
                  Keep
                </button>
                <button type="button" data-testid="dlg-cancel" onClick={c.cancel}>
                  Drop
                </button>
              </div>
            ),
          }}
        />
      </Block>
      <Block id="sched-qi-tpl">
        <Scheduler
          data={ALL_DAY}
          {...common}
          quickInfo={{
            renderHeader: (c) => <strong data-testid="qi-header">{c.kind === 'event' ? `Event ${String((c.row as Row)['title'])}` : 'Cell'}</strong>,
            renderContent: (c) => <p data-testid="qi-content">{`${c.kind}:${c.start.toISOString()}`}</p>,
            renderFooter: (c) => (
              <button type="button" data-testid="qi-close" onClick={c.close}>
                Done
              </button>
            ),
          }}
        />
      </Block>
      <Block id="sched-selection">
        <ControlledSelection log={log} />
      </Block>
      <Block id="sched-export">
        <Scheduler
          ref={api('sched-export')}
          data={WEEK_DATA}
          {...common}
          timeZone="America/New_York"
          exportWriters={{ excel: () => import('@salmonui/export/xlsx'), ics: () => import('@salmonui/export/ics') }}
          onBeforeExport={(e) => {
            log('sched-export', 'beforeExport')(e.format);
            if ((e.options as { fileName?: string }).fileName === 'blocked') e.preventDefault();
          }}
          onExport={(e) => log('sched-export', 'export')({ format: e.format, fileName: e.file.fileName, mimeType: e.file.mimeType })}
          onAdd={(e) => log('sched-export', 'add')(e.rows)}
        />
      </Block>
      <Block id="sched-inline">
        <Scheduler ref={api('sched-inline')} data={ALL_DAY} {...common} editing={{ inline: true }} onAdd={(e) => log('sched-inline', 'add')(e.rows)} onSave={(e) => log('sched-inline', 'save')(e.changed)} />
      </Block>
    </>
  );
}
