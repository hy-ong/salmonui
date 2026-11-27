import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Gantt } from '@salmonui/gantt';

// Server render of the resource view: the server markup groups the rows by resource, marks
// over-allocated ranges and draws multi-taskbars; interaction is in
// tests/browser/gantt-resources.spec.ts.

type Task = { id: number; title: string; start?: string; duration?: number; parentId?: number | null; resources?: { id: string; unit: number }[] };

const tasks: Task[] = [
  { id: 1, title: 'Project', parentId: null },
  { id: 2, title: 'Design', start: '2026-03-02', duration: 3, parentId: 1, resources: [{ id: 'r1', unit: 100 }] },
  { id: 3, title: 'Research', start: '2026-03-03', duration: 3, parentId: 1, resources: [{ id: 'r1', unit: 100 }] },
  { id: 4, title: 'Build', start: '2026-03-09', duration: 4, parentId: 1, resources: [{ id: 'r2', unit: 100 }, { id: 'r1', unit: 50 }] },
  { id: 5, title: 'Review', start: '2026-03-16', duration: 2, parentId: 1 },
];
const resources = [
  { id: 'r1', name: 'Ana' },
  { id: 'r2', name: 'Ben' },
];

const render = (props: Record<string, unknown> = {}) =>
  renderToString(h(Gantt as never, { data: tasks, taskFields: { parentId: 'parentId' }, resources, resourceView: true, timeZone: 'UTC', locale: 'en-US', id: 'g', ...props }));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('Gantt resource view server render', () => {
  it('groups the rows by resource with an Unassigned row; a task with two resources is listed twice', () => {
    const html = render();
    assert.equal(count(html, /class="salmon-gantt__row salmon-gantt__row--resource"/g), 3);
    assert.equal(count(html, /class="salmon-gantt__row[ "]/g), 8);
    assert.match(html, /aria-label="Ana, 3 tasks"/);
    assert.match(html, /aria-label="Unassigned, 1 task"/);
    assert.match(html, /data-row-key="4@r2"/);
    // Every grid row points at its own bar.
    assert.match(html, /id="g-bar-4@r2"/);
  });

  it('marks over-allocated ranges only with overAllocation', () => {
    assert.equal(count(render(), /data-part="overAllocation"/g), 0);
    const html = render({ overAllocation: true });
    assert.equal(count(html, /data-part="overAllocation"/g), 1);
    assert.equal(count(html, /data-over-allocated="true"/g), 2);
  });

  it('multiTaskbar draws the tasks in the resource rows, in lanes with taskbarOverlap false', () => {
    const html = render({ multiTaskbar: true, taskbarOverlap: false });
    assert.equal(count(html, /data-part="multiTaskbar"/g), 5);
    assert.match(html, /data-task-id="3" data-lane="1"/);
  });

  it('is deterministic', () => {
    assert.equal(render({ overAllocation: true, multiTaskbar: true }), render({ overAllocation: true, multiTaskbar: true }));
  });
});
