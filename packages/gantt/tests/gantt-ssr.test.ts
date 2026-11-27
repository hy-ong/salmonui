import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Gantt } from '@salmonui/gantt';

// Server rendering of the Gantt: both panes
// render the initial rows and the initial timeline window from props only,
// with an explicit time zone; interaction is in tests/browser/gantt*.spec.ts.

type Task = { id: number; title: string; start?: string; end?: string; duration?: number; progress?: number; parentId?: number | null; predecessors?: string; milestone?: boolean; baselineStart?: string; baselineEnd?: string };

const tasks: Task[] = [
  { id: 1, title: 'Project', parentId: null },
  { id: 2, title: 'Design', start: '2026-03-02', duration: 3, progress: 50, parentId: 1, baselineStart: '2026-03-02', baselineEnd: '2026-03-04' },
  { id: 3, title: 'Build', duration: 4, predecessors: '2FS', parentId: 1 },
  { id: 4, title: 'Release', duration: 0, predecessors: '3', parentId: 1 },
];

const render = (props: Record<string, unknown> = {}) =>
  renderToString(h(Gantt as never, { data: tasks, taskFields: { parentId: 'parentId' }, timeZone: 'UTC', locale: 'en-US', id: 'g', ...props }));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('Gantt server render', () => {
  it('renders the treegrid rows and one chart row per task with taskbars, a summary and a milestone', () => {
    const html = render();
    assert.match(html, /class="salmon-gantt"/);
    assert.match(html, /role="treegrid"/);
    assert.equal(count(html, /class="salmon-gantt__row[ "]/g), 4);
    assert.equal(count(html, /salmon-gantt__summary/g), 1);
    assert.equal(count(html, /class="salmon-gantt__milestone/g), 1);
    assert.match(html, /aria-label="Design, Mar 2, 2026 to Mar 4, 2026, 50% complete"/);
    // Dependencies drawn as connectors.
    assert.equal(count(html, /class="salmon-gantt__connector"/g), 2);
    // No today marker in server HTML.
    assert.doesNotMatch(html, /salmon-gantt__today/);
  });

  it('is deterministic', () => {
    assert.equal(render(), render());
  });

  it('templates and the taskbar render hook', () => {
    const html = render({
      renderMilestone: () => h('span', { className: 'my-milestone' }),
      getTaskbarProps: (ctx: { task: Task }) => (ctx.task.id === 2 ? { className: 'hot', 'data-kind': 'design' } : undefined),
    });
    assert.match(html, /my-milestone/);
    assert.match(html, /class="salmon-gantt__taskbar hot"[^>]*data-kind="design"/);
    // A template replaces the default bar chrome (gantt.css `[data-template]`); default bars keep it.
    assert.match(html, /class="salmon-gantt__milestone"[^>]*data-template=""/);
    assert.doesNotMatch(html, /class="salmon-gantt__taskbar[^"]*"[^>]*data-template/);
    const bars = render({ renderTaskbar: () => h('span', { className: 'my-bar' }), renderParentTaskbar: () => h('span', { className: 'my-parent' }) });
    assert.match(bars, /class="salmon-gantt__taskbar"[^>]*data-template=""[^>]*><span class="my-bar">/);
    assert.match(bars, /class="salmon-gantt__taskbar salmon-gantt__summary"[^>]*data-template=""[^>]*><span class="my-parent">/);
  });

  it('baselines, labels and markers', () => {
    const html = render({ baselines: true, labels: { end: 'title' }, markers: [{ date: '2026-03-05', label: 'Review' }] });
    assert.equal(count(html, /salmon-gantt__baseline"/g), 1);
    assert.match(html, /data-side="end"[^>]*>Design</);
    assert.match(html, /salmon-gantt__marker-label">Review</);
  });

  it('size and class passthrough', () => {
    const html = render({ height: 300, width: '80%', className: 'mine', style: { color: 'red' } });
    assert.match(html, /class="salmon-gantt mine"/);
    assert.match(html, /style="color:red;height:300px;width:80%"/);
  });

  it('adaptive: true renders one pane with the pane switch on the server; { breakpoint } renders both panes', () => {
    const html = render({ adaptive: true });
    assert.match(html, /data-adaptive="true"/);
    assert.match(html, /role="group" aria-label="View"/);
    assert.match(html, /data-pane="grid" aria-pressed="true"/);
    assert.match(html, /data-panes="grid"/);
    assert.doesNotMatch(html, /salmon-gantt__splitter/);
    assert.doesNotMatch(html, /salmon-gantt__chart-pane/);
    const wide = render({ adaptive: { breakpoint: 640 } });
    assert.doesNotMatch(wide, /data-adaptive/);
    assert.match(wide, /salmon-gantt__splitter/);
  });

  it("loadingIndicator 'skeleton' renders no chart skeleton on the server", () => {
    const html = render({ loadingIndicator: 'skeleton' });
    assert.doesNotMatch(html, /salmon-gantt__loading/);
    assert.equal(count(html, /class="salmon-gantt__row[ "]/g), 4);
  });

  it('empty view', () => {
    const html = renderToString(h(Gantt as never, { data: [], timeZone: 'UTC', renderEmpty: () => h('span', { className: 'nothing' }, 'No tasks') }));
    assert.match(html, /No tasks/);
  });
});
