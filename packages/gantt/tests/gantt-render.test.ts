import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { GANTT_DEFAULT_LOCALE_TEXT, Gantt } from '@salmonui/gantt';

// Server-rendered options of the Gantt: column presets, timeline tiers, view modes,
// templates, weekends, indicators, notes, date formats, localization and the
// grid-pane render hooks, rendered from props only with an explicit zone.

type Task = Record<string, unknown>;

const tasks: Task[] = [
  { id: 1, title: 'Project', parentId: null },
  {
    id: 2,
    title: 'Design',
    start: '2026-03-02',
    duration: 3,
    progress: 50,
    parentId: 1,
    baselineStart: '2026-03-02',
    baselineEnd: '2026-03-04',
    notes: 'Agree on the scope',
    indicators: [{ date: '2026-03-03', label: 'Review', tooltip: 'Design review', className: 'my-indicator' }],
  },
  { id: 3, title: 'Build', duration: 4, predecessors: '2FS+1d', parentId: 1, resources: [{ id: 'r1', unit: 50 }] },
  { id: 4, title: 'Release', duration: 0, predecessors: '3', parentId: 1 },
];

const render = (props: Record<string, unknown> = {}) =>
  renderToString(h(Gantt as never, { data: tasks, taskFields: { parentId: 'parentId' }, timeZone: 'UTC', locale: 'en-US', id: 'g', ...props }));

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
/** Text of the grid cell of a row and column. */
const cell = (html: string, row: number, column: string): string => {
  const at = html.indexOf(`data-row-id="${row}"`);
  assert.notEqual(at, -1, `row ${row}`);
  const m = new RegExp(`data-column-id="${column}"[^>]*>(.*?)</div>`).exec(html.slice(at));
  return (m?.[1] ?? '').replace(/<[^>]+>/g, '');
};
/** Tier cells of one tier: `{ unit, width, title, text }`. */
const tier = (html: string, which: 'top' | 'bottom') => {
  const at = html.indexOf(`data-tier="${which}"`);
  const end = html.indexOf('</div></div>', at);
  const part = html.slice(at, end + 6);
  return [...part.matchAll(/<div class="salmon-gantt__tier-cell" data-unit="(\w+)"(?: title="([^"]*)")? style="inset-inline-start:[\d.]+(?:px)?;width:([\d.]+)px">(.*?)<\/div>/g)].map((m) => ({ unit: m[1], title: m[2] ?? null, width: Number(m[3]), text: (m[4] ?? '').replace(/<[^>]+>/g, '') }));
};

describe('Gantt grid pane columns', () => {
  it('task column presets render localized headers and role values', () => {
    const html = render({
      resources: [{ id: 'r1', name: 'Ana' }],
      columns: ['id', 'title', 'start', 'end', 'duration', 'progress', 'predecessors', 'resources', 'work', 'taskType', 'notes', 'baselineStart', 'baselineEnd'],
    });
    for (const header of ['ID', 'Task name', 'Start', 'Finish', 'Duration', 'Progress', 'Predecessors', 'Resources', 'Work', 'Task type', 'Notes', 'Baseline start', 'Baseline finish']) {
      assert.match(html, new RegExp(`salmon-data-grid-header-cell__text">${header}<`), header);
    }
    assert.equal(cell(html, 2, 'start'), '3/2/26');
    assert.equal(cell(html, 2, 'end'), '3/4/26');
    assert.equal(cell(html, 2, 'duration'), '3 days');
    assert.equal(cell(html, 2, 'progress'), '50%');
    assert.equal(cell(html, 3, 'predecessors'), '2FS+1d');
    assert.equal(cell(html, 3, 'resources'), 'Ana[50%]');
    assert.equal(cell(html, 3, 'work'), '18 hours');
    assert.equal(cell(html, 3, 'taskType'), 'Fixed units');
    assert.equal(cell(html, 2, 'notes'), 'Agree on the scope');
    assert.equal(cell(html, 2, 'baselineStart'), '3/2/26');
    assert.equal(cell(html, 2, 'baselineEnd'), '3/4/26');
    // Parent roll-up values in the grid (the computed roles are written to the rows).
    assert.equal(cell(html, 1, 'duration'), '8 days');
    // Data Grid columns mix with presets.
    const mixed = render({ columns: ['title', { field: 'owner', header: 'Owner', valueGetter: () => 'Kim' }] });
    assert.match(mixed, /header-cell__text">Owner</);
    assert.equal(cell(mixed, 2, 'owner'), 'Kim');
  });
});

describe('Gantt timeline', () => {
  it('timeline tiers: units, counts, Intl formats and render functions', () => {
    const html = render({
      timeline: {
        topTier: { unit: 'month', format: { month: 'long', year: 'numeric' } },
        bottomTier: { unit: 'day', count: 2, format: { day: '2-digit' } },
      },
    });
    const top = tier(html, 'top');
    const bottom = tier(html, 'bottom');
    assert.ok(top.length > 0 && top.every((c) => c.unit === 'month'));
    assert.ok(top.some((c) => c.text === 'March 2026'), JSON.stringify(top));
    assert.ok(bottom.every((c) => c.unit === 'day'));
    // `count: 2`: one cell of `unitWidth` px per two days, labelled with its first day.
    assert.ok(bottom.length > 2 && bottom.slice(0, -1).every((c) => c.width === 33), JSON.stringify(bottom.slice(0, 4)));
    const days = bottom.slice(0, 4).map((c) => Number(c.text));
    assert.deepEqual(days.slice(1).map((d, i) => d - (days[i] as number)), [2, 2, 2]);
    // A tier `render` replaces the cell text.
    const rendered = render({ timeline: { topTier: { unit: 'week', render: (ctx: { text: string; unit: string }) => h('b', { className: 'my-tier' }, `W:${ctx.text}`) } } });
    assert.match(rendered, /<b class="my-tier">W:Mar 1, 2026<\/b>/);
    // `topTier: null` leaves one tier.
    assert.equal(count(render({ timeline: { topTier: null } }), /class="salmon-gantt__tier"/g), 1);
  });

  it('timeline view modes set the tier presets', () => {
    const units = (mode: string) => {
      const html = render({ timeline: { mode } });
      return [tier(html, 'top')[0]?.unit, tier(html, 'bottom')[0]?.unit];
    };
    assert.deepEqual(units('hour'), ['hour', 'minute']);
    assert.deepEqual(units('day'), ['day', 'hour']);
    assert.deepEqual(units('week'), ['week', 'day']);
    assert.deepEqual(units('month'), ['month', 'week']);
    assert.deepEqual(units('year'), ['year', 'month']);
  });

  it('unit width, week start from the locale or the prop, and tier tooltips', () => {
    const wide = tier(render({ timeline: { unitWidth: 50 } }), 'bottom');
    assert.ok(wide.every((c) => c.width === 50), JSON.stringify(wide.slice(0, 3)));
    // en-US weeks start on Sunday; `weekStart: 1` and a Monday locale start them on Monday.
    assert.match(tier(render(), 'top')[0]!.title ?? '', /^Sunday/);
    assert.match(tier(render({ timeline: { weekStart: 1 } }), 'top')[0]!.title ?? '', /^Monday/);
    assert.match(tier(render({ locale: 'en-GB' }), 'top')[0]!.title ?? '', /^Monday/);
    // Tier tooltips show the full date; `tooltips: false` turns them off.
    assert.ok(tier(render(), 'bottom').every((c) => c.title !== null));
    assert.ok(tier(render({ timeline: { tooltips: false } }), 'bottom').every((c) => c.title === null));
  });

  it('timeline cell template receives tier, date, unit and width', () => {
    const seen: { tier: string; unit: string; width: number; date: string }[] = [];
    const html = render({
      timeline: {
        renderCell: (ctx: { tier: string; unit: string; width: number; date: Date; text: string }) => {
          seen.push({ tier: ctx.tier, unit: ctx.unit, width: ctx.width, date: ctx.date.toISOString().slice(0, 10) });
          return h('i', { 'data-cell': ctx.tier }, ctx.text);
        },
      },
    });
    assert.ok(count(html, /<i data-cell="top">/g) > 0);
    assert.ok(count(html, /<i data-cell="bottom">/g) > 0);
    assert.ok(seen.some((s) => s.tier === 'top' && s.unit === 'week' && s.width === 231 && s.date === '2026-03-01'), JSON.stringify(seen.slice(0, 4)));
    assert.ok(seen.some((s) => s.tier === 'bottom' && s.unit === 'day' && s.width === 33 && s.date === '2026-03-02'));
  });
});

describe('Gantt chart pane options', () => {
  it('weekend highlighting', () => {
    assert.equal(count(render(), /salmon-gantt__weekend/g), 0);
    const html = render({ highlightWeekends: true });
    // Feb 22 .. Mar 14: the weekend days of the rendered window.
    assert.ok(count(html, /class="salmon-gantt__weekend"/g) >= 6);
    // Weekends shade days only: month tiers draw none.
    assert.equal(count(render({ highlightWeekends: true, timeline: { mode: 'year' } }), /class="salmon-gantt__weekend"/g), 0);
  });

  it('baseline template and color through getTaskbarProps', () => {
    const html = render({
      baselines: true,
      renderBaseline: (ctx: { task: Task }) => h('span', { className: 'my-baseline' }, String(ctx.task['title'])),
      getTaskbarProps: (ctx: { task: Task }) => (ctx.task['id'] === 2 ? { style: { '--salmon-gantt-baseline': 'rebeccapurple' } as never } : undefined),
    });
    assert.match(html, /class="salmon-gantt__baseline" data-part="baseline"[^>]*><span class="my-baseline">Design<\/span>/);
    assert.match(html, /--salmon-gantt-baseline:rebeccapurple/);
  });

  it('indicators are drawn on the row', () => {
    const html = render();
    assert.match(html, /<span class="salmon-gantt__indicator my-indicator" title="Design review" style="inset-inline-start:[\d.]+px;top:\d+px">/);
    assert.match(html, /salmon-gantt__indicator-label">Review</);
  });

  it('notes column: tooltip text, or inline notes', () => {
    assert.match(render({ columns: ['title', 'notes'] }), /<span class="salmon-gantt__notes" title="Agree on the scope">Agree on the scope<\/span>/);
    assert.match(render({ columns: ['title', 'notes'], inlineNotes: true }), /<span class="salmon-gantt__notes" data-inline="">Agree on the scope<\/span>/);
  });
});

describe('Gantt formats and text', () => {
  it('dateFormat formats the date columns and the taskbar labels', () => {
    const html = render({ columns: ['title', 'start', 'end'], dateFormat: { year: 'numeric', month: '2-digit', day: '2-digit' } });
    assert.equal(cell(html, 2, 'start'), '03/02/2026');
    assert.equal(cell(html, 2, 'end'), '03/04/2026');
    assert.match(html, /aria-label="Design, 03\/02\/2026 to 03\/04\/2026, 50% complete"/);
    // A skeleton string formats both panes; a pattern formats the grid columns.
    const skeleton = render({ columns: ['title', 'start'], dateFormat: 'yMMMMd' });
    assert.equal(cell(skeleton, 2, 'start'), 'March 2, 2026');
    assert.match(skeleton, /aria-label="Design, March 2, 2026 to March 4, 2026, 50% complete"/);
    assert.equal(cell(render({ columns: ['title', 'start'], dateFormat: 'dd.MM.yyyy' }), 2, 'start'), '02.03.2026');
  });

  it('locale and localeText: Gantt strings, grid strings and Intl tiers', () => {
    assert.equal(GANTT_DEFAULT_LOCALE_TEXT.columnTitle, 'Task name');
    const html = render({
      locale: 'de-DE',
      localeText: { columnTitle: 'Vorgang', day: { one: '{count} Tag', other: '{count} Tage' }, taskbarLabel: '{title}: {start} bis {end}', grid: { treeCollapse: '{row} zuklappen' } },
      columns: ['title', 'duration'],
    });
    assert.match(html, /header-cell__text">Vorgang</);
    assert.equal(cell(html, 2, 'duration'), '3 Tage');
    assert.match(html, /aria-label="Design: 2\. März 2026 bis 4\. März 2026"/);
    assert.match(html, /aria-label="Project zuklappen"/);
    // Intl tier text in the locale (German weekday initials, Monday week start).
    assert.ok(tier(html, 'bottom').some((c) => c.text === 'D'));
    assert.match(tier(html, 'top')[0]!.title ?? '', /^Montag/);
  });
});

describe('Gantt grid pane render hooks', () => {
  it('renderCell, renderHeader, headerProps, getCellProps and getRowProps reach the grid pane', () => {
    const html = render({
      columns: [
        'title',
        { field: 'owner', header: 'Owner', renderHeader: () => h('em', null, 'Who'), headerProps: { className: 'my-header' }, renderCell: (ctx: { row: Task }) => h('strong', { className: 'my-cell' }, `#${ctx.row['id']}`) },
      ],
      getCellProps: (ctx: { column: { id: string }; row: Task }) => (ctx.column.id === 'owner' && ctx.row['id'] === 3 ? { className: 'hot-cell', 'data-hot': 'yes' } : undefined),
      getRowProps: (row: Task) => (row['id'] === 2 ? { className: 'hot-row', 'data-kind': 'design' } : undefined),
    });
    assert.match(html, /<em>Who<\/em>/);
    assert.match(html, /class="salmon-data-grid-header-cell my-header"/);
    assert.match(html, /<strong class="my-cell">#2<\/strong>/);
    assert.match(html, /data-hot="yes"[^>]*class="salmon-data-grid-cell hot-cell"/);
    // The Gantt's own row description (taskbar id) is kept next to the user's row props.
    assert.match(html, /<div data-kind="design" aria-describedby="g-bar-2" role="row"[^>]*class="salmon-data-grid-row hot-row"/);
  });

  it('gridLines and highlightOnHover pass to the grid pane', () => {
    const html = render({ gridLines: 'both', highlightOnHover: false });
    assert.match(html, /class="salmon-data-grid"[^>]*data-grid-lines="both"/);
    assert.doesNotMatch(html, /class="salmon-data-grid"[^>]*data-hover=""/);
    assert.match(render(), /class="salmon-data-grid"[^>]*data-hover=""/);
  });

  it('treeColumn puts the expander in the named column', () => {
    const html = render({ columns: ['id', 'title'], treeColumn: 'id' });
    const at = html.indexOf('data-row-id="1"');
    const row = html.slice(at, html.indexOf('</div></div></div>', at));
    assert.match(row, /data-column-id="id"><span class="salmon-data-grid-tree-cell"/);
    assert.doesNotMatch(row, /data-column-id="title"><span class="salmon-data-grid-tree-cell"/);
    // Default: the title column.
    const plain = render({ columns: ['id', 'title'] });
    assert.match(plain, /data-column-id="title"><span class="salmon-data-grid-tree-cell"/);
  });
});
