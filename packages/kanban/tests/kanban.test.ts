// Kanban server rendering, markup contract and the pure board model.
// Interaction (pointer and keyboard drag, selection, editor,
// tooltip, virtual windows, remote writes) runs in tests/browser/kanban*.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { Kanban, KanbanColumn, KANBAN_DEFAULT_LOCALE_TEXT, type KanbanColumnDef, type KanbanProps } from '@salmonui/kanban';
import { buildBoard, canDropInto, limitOf, moveRows, navigate, orderColumns, withField } from '../dist/kanban/model.js';
import { createCardWindow } from '../dist/kanban/window.js';

interface Task {
  id: number;
  title: string;
  status: string;
  lane?: string | null;
  owner?: string;
  tags?: string;
  rank?: number;
  color?: string;
  body?: string;
}

const tasks: Task[] = [
  { id: 1, title: 'Write spec', status: 'todo', lane: 'web', owner: 'Web team', tags: 'docs, spec', rank: 3, color: '#c03' },
  { id: 2, title: 'Build board', status: 'doing', lane: 'api', owner: 'API team', rank: 1, body: 'Columns and lanes' },
  { id: 3, title: 'Ship', status: 'done', lane: 'web', rank: 2 },
  { id: 4, title: 'Review', status: 'review', lane: null, rank: 5 },
  { id: 5, title: 'Plan', status: 'todo', lane: 'api', rank: 1 },
];

const columns: KanbanColumnDef[] = [
  { key: 'todo', header: 'To do', max: 1, addButton: true },
  { keys: ['doing', 'review'], header: 'In progress', collapsible: true, min: 3 },
  { key: 'done', header: 'Done' },
];

const base: KanbanProps<Task> = { data: tasks, getCardId: (t) => t.id, columnField: 'status', columns, card: { headerField: 'title' }, 'aria-label': 'Tasks' };

function render(props: Partial<KanbanProps<Task>> = {}): string {
  return renderToString(createElement(Kanban as (p: KanbanProps<Task>) => ReactNode, { ...base, ...props } as KanbanProps<Task>));
}

const count = (html: string, re: RegExp): number => html.match(new RegExp(re.source, 'g'))?.length ?? 0;
const cards = (html: string): string[] => html.match(/<div[^>]*role="gridcell"[^>]*data-card="[^"]*"[^>]*>/g) ?? [];
const cardOrder = (html: string): string[] => [...html.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1] as string);
const cellOf = (html: string, column: string): string => {
  const start = html.search(new RegExp(`<div[^>]*role="row"[^>]*data-column="${column}"`));
  assert.ok(start >= 0, `cell ${column} rendered`);
  const next = html.slice(start + 10).search(/<div[^>]*role="row"[^>]*class="salmon-kanban-cell/);
  return next < 0 ? html.slice(start) : html.slice(start, start + 10 + next);
};

describe('Kanban server rendering', () => {
  it('maps cards to columns by columnField, key and keys', () => {
    const html = render();
    assert.match(html, /role="grid"[^>]*aria-label="Tasks"|aria-label="Tasks"[^>]*role="grid"/);
    assert.equal(cards(html).length, 5);
    assert.deepEqual(cardOrder(cellOf(html, 'todo')), ['n1', 'n5']);
    assert.deepEqual(cardOrder(cellOf(html, 'doing')), ['n2', 'n4'], 'keys put doing and review in one column');
    assert.match(html, /class="salmon-kanban-column-title">To do</);
    assert.match(html, /class="salmon-kanban-column-title">In progress</);
    assert.equal(count(html, /tabindex="0"/), 1, 'one tab stop on the board');
    assert.match(cards(html)[0]!, /data-card="n1"[^>]*tabindex="0"/);
  });

  it('declares columns as KanbanColumn elements', () => {
    const html = renderToString(
      createElement(
        Kanban as (p: KanbanProps<Task>) => ReactNode,
        { ...base, columns: undefined } as KanbanProps<Task>,
        createElement(KanbanColumn, { columnKey: 'todo', header: 'Backlog' }),
        createElement(KanbanColumn, { columnKey: 'done', header: 'Finished' }),
      ),
    );
    assert.match(html, />Backlog</);
    assert.match(html, />Finished</);
    assert.equal(cards(html).length, 3);
  });

  it('renders collapse toggles, counts, header templates and hides empty columns', () => {
    const html = render({ columns: [...columns.map((c) => (c.key === 'done' ? { ...c, renderHeader: (ctx: { header: string; count: number }) => `${ctx.header} (${ctx.count})` } : c)), { key: 'archived', header: 'Archived', count: false }], defaultCollapsedColumns: ['doing'] });
    assert.match(html, /aria-expanded="false"[^>]*aria-label="Expand In progress"/);
    assert.match(html, /data-collapsed=""/);
    assert.equal(cards(cellOf(html, 'doing')).length, 0, 'a collapsed column renders no cards');
    assert.match(html, /aria-label="2 cards"[^>]*>2</);
    assert.match(html, /class="salmon-kanban-column-title">Done \(1\)</);
    assert.match(html, />Archived</);
    const hidden = render({ columns: [...columns, { key: 'archived', header: 'Archived' }], showEmptyColumns: false });
    assert.doesNotMatch(hidden, />Archived</);
  });

  it('marks WIP limits per column and per swimlane', () => {
    const html = render();
    assert.match(html, /class="salmon-kanban-column-header"[^>]*data-column="todo"[^>]*data-limit="over"/);
    assert.match(html, /class="salmon-kanban-column-header"[^>]*data-column="doing"[^>]*data-limit="under"/);
    assert.match(html, /Max 1/);
    assert.match(html, /Min 3/);
    const lanes = render({ swimlanes: { field: 'lane' }, limitScope: 'swimlane' });
    assert.doesNotMatch(lanes, /class="salmon-kanban-column-header"[^>]*data-limit/, 'swimlane scope marks cells, not headers');
    assert.match(lanes, /class="salmon-kanban-cell"[^>]*data-column="doing"[^>]*data-limit="under"/);
    assert.equal(limitOf(2, { header: 'x', max: 1 }), 'over');
    assert.equal(limitOf(0, { header: 'x', min: 1 }), 'under');
    assert.equal(limitOf(1, { header: 'x', min: 1, max: 1 }), null);
  });

  it('renders an add button per cell with an accessible name', () => {
    const html = render();
    assert.match(html, /<button type="button" class="salmon-kanban-add" data-add="" aria-label="Add card to To do">/);
    assert.equal(count(html, /data-add=""/), 1);
  });

  it('renders stacked column group headers', () => {
    const html = render({ columnGroups: [{ header: 'Active', columns: ['todo', 'doing'] }] });
    assert.match(html, /class="salmon-kanban-group" style="grid-column:1 \/ span 2">Active</);
    assert.match(html, /role="rowheader" class="salmon-visually-hidden">Active: To do, 2 cards</);
  });

  it('renders card fields, a card template and a fixed card height', () => {
    const html = render({ card: { headerField: 'title', contentField: 'body', tagsField: 'tags', accentField: 'color' } });
    assert.match(html, /class="salmon-kanban-card-header">Write spec</);
    assert.match(html, /class="salmon-kanban-card-content">Columns and lanes</);
    assert.match(html, /<span class="salmon-kanban-tag">docs<\/span><span class="salmon-kanban-tag">spec<\/span>/);
    assert.match(html, /style="--salmon-kanban-accent:#c03"[^>]*data-card="n1"[^>]*data-accent=""/);
    const custom = render({ renderCard: (c) => createElement('strong', null, `#${c.id} ${c.card.title} @${c.index}`), cardHeight: 60 });
    assert.match(custom, /<strong>#1 Write spec @0<\/strong>/);
    assert.match(custom, /style="block-size:60px"/);
  });

  it('marks selection state and multi-selection', () => {
    const html = render({ selection: 'multiple', defaultSelectedCards: [2, 3] });
    assert.match(html, /aria-multiselectable="true"/);
    assert.equal(count(html, /aria-selected="true"/), 2);
    assert.equal(count(html, /aria-selected="false"/), 3);
    assert.equal(count(render({ selection: 'none' }), /aria-selected/), 0);
  });

  it('renders swimlanes with labels, counts, order, unassigned and empty lanes', () => {
    const html = render({ swimlanes: { field: 'lane', labelField: 'owner', sort: 'asc', lanes: [{ key: 'ops', label: 'Ops' }], showEmpty: true, sticky: true } });
    const lanes = [...html.matchAll(/class="salmon-kanban-lane-title">([^<]*)</g)].map((m) => m[1]);
    assert.deepEqual(lanes, ['API team', 'Ops', 'Web team', 'Unassigned']);
    assert.match(html, /role="rowgroup" class="salmon-kanban-lane" data-li="0" data-sticky=""/);
    assert.match(html, /role="rowheader" class="salmon-visually-hidden">To do, API team, 1 cards</);
    const noUnassigned = render({ swimlanes: { field: 'lane', unassigned: false } });
    assert.doesNotMatch(noUnassigned, /Unassigned/);
    assert.equal(cards(noUnassigned).length, 4);
    const custom = render({ swimlanes: { field: 'lane', renderHeader: (l) => `Lane ${l.label}: ${l.count}`, count: false } });
    assert.match(custom, />Lane web: 2</);
  });

  it('is reactive to data and columns, hides columns', () => {
    const html = render({ data: [...tasks, { id: 9, title: 'New', status: 'done' }] });
    assert.equal(cards(html).length, 6);
    const hidden = render({ columns: columns.map((c) => (c.key === 'done' ? { ...c, hidden: true } : c)) });
    assert.doesNotMatch(hidden, />Done</);
    assert.equal(cards(hidden).length, 4);
  });

  it('sorts cards by data order, field or comparator', () => {
    assert.deepEqual(cardOrder(cellOf(render({ sort: { by: 'field', field: 'rank' } }), 'todo')), ['n5', 'n1']);
    assert.deepEqual(cardOrder(cellOf(render({ sort: { by: 'field', field: 'rank', direction: 'desc' } }), 'todo')), ['n1', 'n5']);
    assert.deepEqual(cardOrder(cellOf(render({ sort: { by: 'custom', comparator: (a, b) => a.title.localeCompare(b.title) } }), 'todo')), ['n5', 'n1']);
    assert.deepEqual(cardOrder(cellOf(render({ sort: { by: 'data' } }), 'todo')), ['n1', 'n5']);
  });

  it('filters cards on the client', () => {
    assert.equal(cards(render({ filter: (t) => t.lane === 'web' })).length, 2);
  });

  it('server-renders a bounded card window with virtualization', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ id: i, title: `Card ${i}`, status: 'todo' }));
    const html = render({ data: many, virtualization: true, height: 600 });
    const n = cards(html).length;
    assert.ok(n > 4 && n < 20, `rendered ${n} cards`);
    assert.match(html, /data-virtual=""/);
    assert.match(html, /class="salmon-kanban-spacer" aria-hidden="true" style="block-size:\d+px"/);
  });

  it('renders the column picker for the narrow layout', () => {
    const html = render();
    assert.match(html, /<select class="salmon-kanban-picker" aria-label="Column"><option value="0">To do<\/option><option value="1">In progress<\/option>/);
  });

  it('renders the loading state of a source and the loading prop', () => {
    const html = render({ data: { read: () => ({ version: 1, rows: tasks }) } });
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /data-state="loading"/);
    assert.match(html, /class="salmon-kanban-status" role="status" aria-live="polite" aria-atomic="true">Loading…</);
    assert.equal(cards(html).length, 0);
    assert.match(render({ loading: true }), /aria-busy="true"/);
    assert.doesNotMatch(render(), /aria-busy/);
  });

  it('applies getCardProps', () => {
    const html = render({ getCardProps: (c) => ({ className: `prio-${c.card.rank}`, title: c.card.title, 'data-owner': c.card.owner }) });
    assert.match(html, /title="Write spec"[^>]*data-owner="Web team"[^>]*class="salmon-kanban-card prio-3"/);
  });

  it('ARIA roles, roledescriptions, live region and localeText', () => {
    const html = render({ cardsDraggable: true, localeText: { board: 'tablero', card: 'tarjeta', empty: 'Vacío', dragInstructions: 'Espacio para levantar' } });
    assert.match(html, /role="grid"[^>]*aria-roledescription="tablero"/);
    assert.match(html, /aria-roledescription="tarjeta"/);
    assert.match(html, /role="row" class="salmon-kanban-cell"/);
    assert.match(html, /role="rowheader" class="salmon-visually-hidden">To do, 2 cards</);
    assert.match(html, /aria-describedby="[^"]+-dnd"/);
    assert.match(html, /class="salmon-visually-hidden">Espacio para levantar</);
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.equal(KANBAN_DEFAULT_LOCALE_TEXT.card, 'card');
    assert.doesNotMatch(html, / dir=/, 'direction is inherited');
  });
});

describe('Kanban board model', () => {
  const getCardId = (t: Task): number => t.id;
  const model = (extra: Partial<Parameters<typeof buildBoard<Task>>[0]> = {}) => buildBoard<Task>({ rows: tasks, getCardId, columnField: 'status', columns, unassignedLabel: 'Unassigned', ...extra });

  it('orders columns by columnOrder and drops hidden ones', () => {
    assert.deepEqual(orderColumns(columns, ['done', 'todo']).map((c) => c.id), ['done', 'todo', 'doing']);
    assert.deepEqual(orderColumns([...columns, { key: 'x', header: 'X', hidden: true }], undefined).map((c) => c.id), ['todo', 'doing', 'done']);
    assert.deepEqual(model({ columnOrder: ['done'] }).columns.map((c) => c.id), ['done', 'todo', 'doing']);
  });

  it('allows drops by droppable, draggable, allowedTargets and swimlane drag', () => {
    const [todo, doing, done] = orderColumns([{ key: 'todo', header: 'a', allowedTargets: ['doing'] }, { key: 'doing', header: 'b' }, { key: 'done', header: 'c', droppable: false }], undefined);
    assert.equal(canDropInto(todo, doing!, true, false), true);
    assert.equal(canDropInto(todo, done!, true, false), false, 'not droppable');
    assert.equal(canDropInto(doing, done!, true, false), false);
    assert.equal(canDropInto(todo, todo!, true, false), true, 'reorder within the own column');
    assert.equal(canDropInto(doing, todo!, true, false), true);
    const [locked] = orderColumns([{ key: 'l', header: 'l', draggable: false }], undefined);
    assert.equal(canDropInto(locked, doing!, true, false), false, 'not draggable');
    assert.equal(canDropInto(doing, todo!, false, false), false, 'across lanes needs swimlanes.draggable');
    assert.equal(canDropInto(doing, todo!, false, true), true);
  });

  it('moves rows to an array position and rewrites them', () => {
    const next = moveRows(tasks, getCardId, [5], (t) => withField(t, 'status', 'done'), 3, null);
    assert.deepEqual(next.map((t) => t.id), [1, 2, 5, 3, 4]);
    assert.equal(next[2]!.status, 'done');
    assert.equal(tasks[4]!.status, 'todo', 'the input is not changed');
    assert.deepEqual(moveRows(tasks, getCardId, [1], (t) => t, null, 4).map((t) => t.id), [2, 3, 4, 1, 5]);
    assert.deepEqual(moveRows(tasks, getCardId, [4, 1], (t) => t, null, null).map((t) => t.id), [2, 3, 5, 4, 1]);
  });

  it('navigates the board like a layout grid', () => {
    const m = model({ swimlanes: { field: 'lane' } });
    // Lanes: web (1, 3), api (2, 5), unassigned (4); columns todo, doing, done.
    const at = m.byKey.get('n1')!;
    const none = () => false;
    assert.deepEqual(navigate(m, at, 'right', none), { lane: 0, col: 2, index: 0 }, 'skips the empty doing cell');
    assert.deepEqual(navigate(m, at, 'down', none), { lane: 1, col: 0, index: 0 }, 'down crosses into the next lane');
    assert.equal(navigate(m, at, 'up', none), null);
    assert.deepEqual(navigate(m, at, 'last', none), { lane: 2, col: 1, index: 0 });
    assert.deepEqual(navigate(m, m.byKey.get('n4')!, 'first', none), { lane: 0, col: 0, index: 0 });
    assert.equal(navigate(m, at, 'right', (c) => c === 2), null, 'collapsed columns are skipped');
  });

  it('keeps measured heights per card in the virtual window', () => {
    const w = createCardWindow(100, 50, false, 10);
    assert.deepEqual(w.initial, { start: 0, end: 10, top: 0, bottom: 4500 });
    const keys = Array.from({ length: 100 }, (_, i) => `n${i}`);
    w.sync(keys, 0, 200);
    assert.equal(w.get().start, 0);
    assert.equal(w.get().end, 9, 'viewport 200 / 50 + 1 + overscan 4');
    w.scroll(2500, 200);
    assert.equal(w.get().start, 46);
    w.measure('n0', 150);
    assert.equal(w.offsetOf(1), 150);
    w.sync([...keys].reverse(), 0, 200);
    assert.equal(w.offsetOf(100) - w.offsetOf(99), 150, 'the measured card keeps its height after a reorder');
  });
});
