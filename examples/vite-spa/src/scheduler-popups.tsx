// Scheduler popup scenarios (scheduler.html?set=popups; tests/browser/scheduler-popups.spec.ts):
// the editor and alerts on the public Dialog with their field popups inside
// the modal dialog, the quick info on the public Popover, the context menu,
// tooltips and print.
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import '@salmonui/scheduler/styles.css';
import { Scheduler, type SchedulerApi } from '@salmonui/scheduler';
import { WEEK_DATA } from './scheduler-scenarios.tsx';

type Row = Record<string, unknown>;
type Log = (id: string, type: string) => (value: unknown, details?: unknown) => void;

const ROOMS = { name: 'rooms', field: 'roomId', label: 'Room', data: [{ id: 1, text: 'Room A' }, { id: 2, text: 'Room B' }] };
const ZONES = ['UTC', 'Europe/Berlin', 'Asia/Tokyo'];
const DATA: Row[] = [...WEEK_DATA.slice(0, 3).map((r) => ({ ...r, roomId: 1 }))];

export function SchedulerPopupScenarios({ log, Block }: { log: Log; Block: (p: { id: string; children: React.ReactNode }) => React.ReactElement }) {
  const api = (id: string) => (a: SchedulerApi<Row> | null) => {
    if (a) window.__schedApi[id] = a;
  };
  const common = { view: 'week', date: '2026-11-23', timeZone: 'UTC', height: 520 } as const;
  return (
    <>
      <Block id="pop-editor">
        <Scheduler
          ref={api('pop-editor')}
          data={DATA}
          {...common}
          resources={[ROOMS]}
          timeZones={ZONES}
          onSave={(e) => log('pop-editor', 'save')(e.changed)}
          onAdd={(e) => log('pop-editor', 'add')(e.rows)}
          onPopupClose={(e) => log('pop-editor', 'popupClose')(e.popup)}
        />
      </Block>
      <Block id="pop-menu">
        <Scheduler
          ref={api('pop-menu')}
          data={DATA}
          {...common}
          contextMenu
          cellSelection="multiple"
          onContextMenuItemClick={(e) => log('pop-menu', 'menu')({ id: e.id, kind: e.context.kind, source: e.source, ...(e.context.kind === 'cell' ? { start: e.context.start.toISOString(), end: e.context.end.toISOString(), allDay: e.context.allDay } : { eventId: e.context.occurrence.id, title: (e.context.row as Row)['title'] }) })}
          onDelete={(e) => log('pop-menu', 'delete')(e.deleted.map((r) => (r as Row)['id']))}
        />
      </Block>
      <Block id="pop-menu-fn">
        <Scheduler
          ref={api('pop-menu-fn')}
          data={DATA}
          {...common}
          view="day"
          date="2026-11-24"
          resources={[ROOMS]}
          grouping={{ resources: ['rooms'] }}
          contextMenu={(ctx) =>
            ctx.kind === 'event'
              ? [{ id: 'copy', label: `Copy ${String((ctx.row as Row)['title'])}` }, { type: 'separator' }, { id: 'delete', label: 'Remove' }]
              : ctx.resources?.['roomId']?.[0] === 2
                ? []
                : [{ id: 'book', label: 'Book room' }]
          }
          onContextMenuItemClick={(e) => {
            log('pop-menu-fn', 'menu')({ id: e.id, kind: e.context.kind, resources: e.context.kind === 'cell' ? e.context.resources : null });
            if (e.id === 'delete') e.preventDefault();
          }}
          onDelete={(e) => log('pop-menu-fn', 'delete')(e.deleted)}
        />
      </Block>
      <Block id="pop-tip">
        <Scheduler
          ref={api('pop-tip')}
          data={DATA}
          {...common}
          tooltip
          onBeforeTooltipOpen={(e) => {
            log('pop-tip', 'beforeTooltipOpen')({ id: e.occurrence.id, source: e.source });
            if (e.occurrence.id === 3) e.preventDefault();
          }}
        />
      </Block>
      <Block id="pop-print">
        <Scheduler
          ref={api('pop-print')}
          data={DATA}
          {...common}
          onBeforePrint={(e) => {
            log('pop-print', 'beforePrint')(e.options);
            if ((window as { __cancelPrint?: boolean }).__cancelPrint) e.preventDefault();
          }}
          onAfterPrint={(e) => log('pop-print', 'afterPrint')(e.options)}
        />
      </Block>
      <Block id="pop-tip-render">
        <Scheduler data={DATA} {...common} tooltip={{ render: (ctx) => <b data-testid="tip-custom">Custom {String((ctx.row as Row)['title'])}</b> }} />
      </Block>
    </>
  );
}
