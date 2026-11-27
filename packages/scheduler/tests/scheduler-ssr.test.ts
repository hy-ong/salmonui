import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { RecurrenceEditor, Scheduler } from '@salmonui/scheduler';

describe('Scheduler server render', () => {
  const data = [
    { id: 1, title: 'Standup', start: '2026-11-23T09:00', end: '2026-11-23T09:30', recurrenceRule: 'FREQ=DAILY;COUNT=3' },
    { id: 2, title: 'Offsite', start: '2026-11-24', end: '2026-11-26', allDay: true },
  ];
  it('with date, view and timeZone the server renders the view and its events, never today', () => {
    const html = renderToString(h(Scheduler, { data, view: 'week', date: '2026-11-23', timeZone: 'America/New_York' }));
    assert.equal((html.match(/data-event-id="1"/g) ?? []).length, 3);
    assert.match(html, /data-event-id="2"[^>]*data-all-day=""/);
    assert.equal((html.match(/class="salmon-scheduler__date-header"/g) ?? []).length, 7);
    assert.doesNotMatch(html, /data-today|salmon-scheduler__now/);
    assert.match(html, /Nov 22 – 28, 2026/);
  });

  it('month view renders week rows; without timeZone the server renders a deferred frame', () => {
    const month = renderToString(h(Scheduler, { data, view: 'month', views: ['month'], date: '2026-11-23', timeZone: 'UTC' }));
    assert.equal((month.match(/class="salmon-scheduler__week-row"/g) ?? []).length, 5);
    const deferred = renderToString(h(Scheduler, { data, view: 'week', date: '2026-11-23' }));
    assert.match(deferred, /data-salmon-deferred=""/);
    assert.doesNotMatch(deferred, /data-event-id/);
  });
});

describe('Scheduler server render of every view', () => {
  const rooms = { field: 'roomId', name: 'rooms', data: [{ id: 1, text: 'Room A', color: '#cc3300' }, { id: 2, text: 'Room B' }] };
  const rows = [
    { id: 1, title: 'Planning', start: '2026-11-24T09:00', end: '2026-11-24T10:30', roomId: 1 },
    { id: 2, title: 'Workshop', start: '2026-11-25', end: '2026-11-27', allDay: true, roomId: 2 },
  ];
  const render = (props: Record<string, unknown>) => renderToString(h(Scheduler, { data: rows, date: '2026-11-24', timeZone: 'UTC', ...props } as never));
  const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

  it('the static view registry renders every view family on the server, never a placeholder or today', () => {
    const views = ['day', 'week', 'workWeek', 'month', 'year', 'agenda', 'monthAgenda', 'timelineDay', 'timelineWeek', 'timelineWorkWeek', 'timelineMonth', 'timelineYear'];
    for (const view of views) {
      const html = render({ view, views: [view] });
      assert.doesNotMatch(html, /data-salmon-pending|data-salmon-deferred|data-today/, view);
      assert.match(html, new RegExp(`data-view="${view}"`), view);
    }
    assert.equal(count(render({ view: 'timelineWeek', views: ['timelineWeek'] }), /data-event-id="/g), 2);
    assert.equal(count(render({ view: 'agenda', views: ['agenda'] }), /class="salmon-scheduler__agenda-day"/g), 3);
    assert.match(render({ view: 'year', views: ['year'] }), /data-day="2026-11-24" data-has-events=""/);
    assert.match(render({ view: 'monthAgenda', views: ['monthAgenda'] }), /data-day="2026-11-24"[^>]*data-has-events=""[^>]*data-selected=""/);
  });

  it('resources group the views and color events; byDate puts dates first', () => {
    const tl = render({ view: 'timelineMonth', views: ['timelineMonth'], resources: [rooms], grouping: { resources: ['rooms'] } });
    assert.equal(count(tl, /role="row" class="salmon-scheduler__tl-row" aria-rowindex/g), 2);
    assert.match(tl, /data-event-id="1"[^>]*data-color=""[^>]*data-resource="1"/);
    assert.match(tl, /--salmon-scheduler-event-color:#cc3300/);
    const week = render({ view: 'week', views: ['week'], resources: [rooms], grouping: { resources: ['rooms'], byDate: true } });
    assert.equal(count(week, /class="salmon-scheduler__all-day-cell"/g), 14);
    assert.ok(week.indexOf('salmon-scheduler__date-header"') < week.indexOf('salmon-scheduler__resource-header'));
  });

  it('a virtualized timeline renders its initialRange of rows; dir="rtl" passes through', () => {
    const people = { field: 'p', name: 'people', data: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, text: `P${i + 1}` })) };
    const html = render({ view: 'timelineMonth', views: [{ type: 'timelineMonth', virtualScroll: { initialRange: { start: 10, end: 25 } } }], resources: [people], grouping: { resources: ['people'] }, dir: 'rtl' });
    assert.equal(count(html, /aria-rowindex=/g), 15);
    assert.match(html, /aria-rowindex="12"[^>]*data-resource="11"/);
    assert.match(html, /aria-rowcount="1001"/);
    assert.match(html, /class="salmon-scheduler"[^>]*dir="rtl"/);
  });
});

// Server rendering of the Scheduler subpath: deterministic markup from props only. Interaction
// is covered by tests/browser/recurrence-editor.spec.ts and
// tests/browser/scheduler*.spec.ts.

describe('RecurrenceEditor server render', () => {
  it('renders the labelled group, the controls of the rule and its summary', () => {
    const html = renderToString(h(RecurrenceEditor, { defaultValue: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4', start: '2026-11-23T09:00' }));
    assert.match(html, /<div role="group" class="salmon-recurrence-editor" aria-label="Recurrence" data-frequency="weekly"/);
    assert.match(html, /<output class="salmon-recurrence-editor__summary" aria-live="polite" aria-label="Summary">Every 2 weeks on Monday and Wednesday, 4 times<\/output>/);
    assert.match(html, /type="number"[^>]*value="2"/);
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2);
    assert.match(html, /salmon-recurrence-editor__sr">Monday</);
  });

  it('a null rule renders only the repeat select and "Never"', () => {
    const html = renderToString(h(RecurrenceEditor, { defaultValue: null }));
    assert.match(html, /data-frequency="never"/);
    assert.doesNotMatch(html, /type="number"/);
    assert.match(html, />Never<\/output>/);
  });

  it('dir, className, style and aria-label pass through', () => {
    const html = renderToString(h(RecurrenceEditor, { defaultValue: 'FREQ=DAILY', dir: 'rtl', className: 'mine', style: { maxInlineSize: 300 }, 'aria-label': 'Repeat rule' }));
    assert.match(html, /class="salmon-recurrence-editor mine" style="max-inline-size:300px" dir="rtl" aria-label="Repeat rule"/);
  });

  it('never reads today or the host zone: no start renders the same markup on every run', () => {
    const a = renderToString(h(RecurrenceEditor, { defaultFrequency: 'monthly' }));
    const b = renderToString(h(RecurrenceEditor, { defaultFrequency: 'monthly' }));
    assert.equal(a, b);
    assert.match(a, /Every month on day 1/);
  });
});

describe('Scheduler adaptive server render', () => {
  const rooms = { field: 'roomId', name: 'rooms', data: [{ id: 1, text: 'Room A' }, { id: 2, text: 'Room B' }] };
  const rows = [
    { id: 1, title: 'Planning', start: '2026-11-24T09:00', end: '2026-11-24T10:30', roomId: 1 },
    { id: 2, title: 'Retro', start: '2026-11-24T11:00', end: '2026-11-24T12:00', roomId: 2 },
  ];
  const base = { data: rows, view: 'day', date: '2026-11-24', timeZone: 'UTC', resources: [rooms], grouping: { resources: ['rooms'] } };
  it('adaptive renders the view menu and one resource on the server; selectedResourceId picks it', () => {
    const html = renderToString(h(Scheduler, { ...base, adaptive: true } as never));
    assert.match(html, /data-adaptive=""/);
    assert.match(html, /<select class="salmon-scheduler__select" aria-label="Views"/);
    assert.match(html, /aria-label="Resource"/);
    assert.match(html, /data-event-id="1"/);
    assert.doesNotMatch(html, /data-event-id="2"/);
    const b = renderToString(h(Scheduler, { ...base, adaptive: true, selectedResourceId: 2 } as never));
    assert.match(b, /data-event-id="2"/);
    assert.doesNotMatch(b, /data-event-id="1"/);
  });
  it('a breakpoint renders the full layout on the server (the width is measured after hydration)', () => {
    const html = renderToString(h(Scheduler, { ...base, adaptive: { breakpoint: 10_000 } } as never));
    assert.doesNotMatch(html, /data-adaptive/);
    assert.match(html, /data-event-id="1"/);
    assert.match(html, /data-event-id="2"/);
  });
});

describe('Scheduler short events (demo review)', () => {
  it('a timed event shorter than one slot is marked compact (one line); a slot-long one is not', () => {
    const rows = [
      { id: 1, title: 'Standup', start: '2026-11-23T09:00', end: '2026-11-23T09:15' },
      { id: 2, title: 'Review', start: '2026-11-23T10:00', end: '2026-11-23T10:30' },
    ];
    const html = renderToString(h(Scheduler, { data: rows, view: 'day', views: ['day'], date: '2026-11-23', timeZone: 'UTC' }));
    assert.match(html, /data-event-id="1"[^>]*data-compact=""/);
    assert.doesNotMatch(html, /data-event-id="2"[^>]*data-compact=""/);
  });
});
