import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, trackModules, waitForModule } from './helpers.ts';

// Kanban behaviour: columns, WIP limits, add button, drop rules, column reorder,
// selection, swimlanes, pointer and keyboard drag, drag groups and external
// drop targets, keyboard navigation, the editor, source writes, runtime
// columns, tooltip, virtualization, the narrow layout, loading, card events
// and hydration. Page: examples/vite-spa/kanban.html.

const URL = `${DEV_URL}kanban.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events.map((e) => JSON.parse(JSON.stringify(e)) as unknown[]));
const ofKind = async (page: Page, kind: string) => (await events(page)).filter((e) => e[0] === kind);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const setFlag = (page: Page, name: string, value: unknown) => page.evaluate(([n, v]) => void ((window as unknown as Record<string, unknown>)[n as string] = v), [name, value] as const);
const card = (page: Page, id: string, board = '#main') => page.locator(`${board} [data-card="s${id}"]`);
const cell = (page: Page, column: string, board = '#main', lane = 0) => page.locator(`${board} .salmon-kanban-cell[data-li="${lane}"][data-column="${column}"]`);
const header = (page: Page, column: string, board = '#main') => page.locator(`${board} .salmon-kanban-column-header[data-column="${column}"]`);
const live = (page: Page, board = '#main') => page.locator(`${board} > .salmon-visually-hidden[role="status"]`);
/** Card titles of a cell, top to bottom. */
const titles = (page: Page, column: string, board = '#main', lane = 0) =>
  page.evaluate(
    ([b, c, l]) => [...document.querySelectorAll(`${b} .salmon-kanban-cell[data-li="${l}"][data-column="${c}"] > [data-card]`)].map((el) => el.querySelector('.salmon-kanban-card-header')?.textContent ?? ''),
    [board, column, lane] as const,
  );
const headerOrder = (page: Page, board = '#main') => page.evaluate((b) => [...document.querySelectorAll<HTMLElement>(`${b} .salmon-kanban-column-header`)].map((el) => el.dataset['column']), board);
const focusedCard = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['card'] ?? document.activeElement?.tagName ?? '');

/** Pointer and keyboard drag live in a lazy chunk (drag.ts) attached after mount; drags wait for it. */
const dragReady = (page: Page) => waitForModule(page, /\/kanban\/drag\.js(\?|$)/);

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  trackModules(page);
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('.salmon-kanban-card').first()).toBeVisible();
  // A board with draggable cards or reorderable columns requests the drag chunk on mount.
  if (await page.locator('.salmon-kanban-card[aria-describedby$="-dnd"], .salmon-kanban-column-header[data-reorderable]').count()) await dragReady(page);
  return problems;
}

type Point = { x: number; y: number };
async function centerOf(target: Locator, fy = 0.5, fx = 0.5): Promise<Point> {
  const box = await target.boundingBox();
  if (!box) throw new Error('no box');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** A pointer press on `from`, past the threshold, to `to` (optionally `hold` there), then release (or `beforeUp`). */
async function drag(page: Page, from: Locator, to: Point, options: { fy?: number; beforeUp?: () => Promise<void> } = {}): Promise<void> {
  const start = await centerOf(from, options.fy ?? 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await options.beforeUp?.();
  await page.mouse.up();
}

test.describe('Kanban columns', () => {
  test('collapse toggle hides the cards, reports onCollapsedColumnsChange and follows the controlled value', async ({ page }) => {
    const problems = await open(page);
    const toggle = header(page, 'todo').locator('.salmon-kanban-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Visual consistency: sm icon button 24px
    // square with a 14px glyph; column surface lg, card inside it md, tag sm.
    expect(await toggle.evaluate((el) => [el.getBoundingClientRect().height, el.getBoundingClientRect().width, el.querySelector('svg')!.getBoundingClientRect().width])).toEqual([24, 24, 14]);
    expect(await cell(page, 'todo').evaluate((el) => getComputedStyle(el).borderRadius)).toBe('10px');
    expect(await page.locator('#main .salmon-kanban-card').first().evaluate((el) => getComputedStyle(el).borderRadius)).toBe('6px');
    await expect(toggle).toHaveAccessibleName('Collapse To do');
    await expect(header(page, 'todo').locator('.salmon-kanban-count')).toHaveText('2');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAccessibleName('Expand To do');
    await expect(cell(page, 'todo')).toHaveAttribute('data-collapsed', '');
    await expect(cell(page, 'todo').locator('[data-card]')).toHaveCount(0);
    expect(await ofKind(page, 'collapsed')).toEqual([['collapsed', ['todo'], 'pointer']]);
    // Columns without a toggle stay put; the controlled value drives the state.
    await expect(header(page, 'doing').locator('.salmon-kanban-toggle')).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { __setCollapsed(v: string[]): void }).__setCollapsed(['done']));
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(cell(page, 'todo').locator('[data-card]')).toHaveCount(2);
    await expect(cell(page, 'done')).toHaveAttribute('data-collapsed', '');
    expect(problems).toEqual([]);
  });

  test('a move over a column maximum marks [data-limit] and announces it', async ({ page }) => {
    await open(page);
    await expect(header(page, 'todo').locator('.salmon-kanban-limits')).toHaveText('Max 2');
    await expect(header(page, 'doing').locator('.salmon-kanban-limits')).toHaveText('Min 1 · Max 3');
    await expect(header(page, 'todo')).not.toHaveAttribute('data-limit');
    await drag(page, card(page, 'b1'), await centerOf(cell(page, 'todo'), 0.9));
    expect(await titles(page, 'todo')).toEqual(['Set up CI', 'Draft API', 'Write spec']);
    await expect(header(page, 'todo')).toHaveAttribute('data-limit', 'over');
    await expect(cell(page, 'todo')).toHaveAttribute('data-limit', 'over');
    await expect(live(page)).toHaveText('To do is over its limit of 2 (3 cards)');
  });

  test('the add button calls onCardAdd and opens the new-card editor; Save adds the card', async ({ page }) => {
    await open(page);
    const add = cell(page, 'backlog').getByRole('button', { name: 'Add card to Backlog' });
    await expect(add).toHaveCount(1);
    await expect(cell(page, 'todo').locator('[data-add]')).toHaveCount(0);
    await add.click();
    expect(await ofKind(page, 'add')).toEqual([['add', 'backlog', null, 'pointer']]);
    const dialog = page.locator('dialog.salmon-kanban-editor');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('New card');
    await expect(dialog.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(dialog.getByLabel('Column')).toHaveValue('backlog');
    await dialog.getByLabel('Title').fill('Plan release');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await titles(page, 'backlog')).toEqual(['Write spec', 'Design logo', 'Plan release']);
    const change = (await ofKind(page, 'change'))[0] as [string, string, { title: string; status: string }[]];
    expect(change[1]).toBe('add');
    expect(change[2][0]).toMatchObject({ title: 'Plan release', status: 'backlog' });
  });

  test('columns prop changes at runtime: hidden, shown and added columns', async ({ page }) => {
    const problems = await open(page);
    expect(await headerOrder(page)).toEqual(['backlog', 'todo', 'doing', 'review', 'done']);
    await page.evaluate(() => (window as unknown as { __hideColumn(k: string): void }).__hideColumn('review'));
    await expect(header(page, 'review')).toHaveCount(0);
    await expect(cell(page, 'review')).toHaveCount(0);
    await expect(card(page, 'r1')).toHaveCount(0);
    expect(await headerOrder(page)).toEqual(['backlog', 'todo', 'doing', 'done']);
    await page.evaluate(() => (window as unknown as { __showColumn(k: string): void }).__showColumn('review'));
    await expect(card(page, 'r1')).toHaveCount(1);
    await page.evaluate(() => (window as unknown as { __addColumn(k: string, h: string): void }).__addColumn('qa', 'QA'));
    await expect(header(page, 'qa')).toContainText('QA');
    await expect(cell(page, 'qa').locator('.salmon-kanban-empty')).toHaveText('No cards');
    expect(await headerOrder(page)).toEqual(['backlog', 'todo', 'doing', 'review', 'done', 'qa']);
    expect(problems).toEqual([]);
  });
});

test.describe('Kanban drop rules and column reorder', () => {
  test('a non-droppable column and allowedTargets refuse pointer and keyboard drops', async ({ page }) => {
    await open(page);
    // Review is not droppable.
    await drag(page, card(page, 't1'), await centerOf(cell(page, 'review'), 0.8), {
      beforeUp: async () => {
        await expect(cell(page, 'review')).toHaveAttribute('data-drop-denied', '');
      },
    });
    await expect(cell(page, 'review')).not.toHaveAttribute('data-drop-denied');
    expect(await titles(page, 'review')).toEqual(['Review PR']);
    expect(await titles(page, 'todo')).toEqual(['Set up CI', 'Draft API']);
    // Backlog cards may only move to To do.
    await drag(page, card(page, 'b1'), await centerOf(cell(page, 'doing'), 0.8));
    expect(await titles(page, 'doing')).toEqual(['Build board', 'Fix login']);
    expect(await ofKind(page, 'move')).toEqual([]);
    // Keyboard drag skips refused columns: Right reaches To do and stops there.
    await card(page, 'b1').focus();
    await page.keyboard.press('Space');
    await expect(live(page)).toHaveText('Picked up Write spec. Backlog, position 1 of 2');
    await page.keyboard.press('ArrowRight');
    await expect(live(page)).toHaveText('To do, position 1 of 3');
    await page.keyboard.press('ArrowRight');
    await expect(live(page)).toHaveText('To do, position 1 of 3');
    await page.keyboard.press('Escape');
    await expect(live(page)).toHaveText('Move cancelled, Write spec returned');
  });

  test('pointer column reorder and Alt+Arrow on the grip move a column with an announcement', async ({ page }) => {
    const problems = await open(page);
    await drag(page, header(page, 'done').locator('.salmon-kanban-column-title'), await centerOf(header(page, 'backlog'), 0.5, 0.2));
    expect(await headerOrder(page)).toEqual(['done', 'backlog', 'todo', 'doing', 'review']);
    expect(await ofKind(page, 'columnOrder')).toEqual([['columnOrder', ['done', 'backlog', 'todo', 'doing', 'review'], 'pointer']]);
    await expect(live(page)).toHaveText('Done moved to position 1 of 5');
    // The cells follow the headers.
    const cellOrder = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#main .salmon-kanban-cell')].map((el) => el.dataset['column']));
    expect(cellOrder).toEqual(['done', 'backlog', 'todo', 'doing', 'review']);
    const grip = header(page, 'backlog').getByRole('button', { name: 'Move column Backlog' });
    await grip.focus();
    await page.keyboard.press('Alt+ArrowRight');
    expect(await headerOrder(page)).toEqual(['done', 'todo', 'backlog', 'doing', 'review']);
    await expect(live(page)).toHaveText('Backlog moved to position 3 of 5');
    await expect(grip).toBeFocused();
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await headerOrder(page)).toEqual(['done', 'backlog', 'todo', 'doing', 'review']);
    expect((await ofKind(page, 'columnOrder')).map((e) => e[2])).toEqual(['pointer', 'keyboard', 'keyboard']);
    expect(problems).toEqual([]);
  });

  test('Alt+Arrow on the grip is mirrored in RTL', async ({ page }) => {
    await open(page, 'dir=rtl');
    await header(page, 'backlog').locator('.salmon-kanban-grip').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await headerOrder(page)).toEqual(['todo', 'backlog', 'doing', 'review', 'done']);
  });
});

test.describe('Kanban selection and card events', () => {
  test('click selects, Ctrl/Meta click toggles, Shift click extends within a cell, Escape clears', async ({ page }) => {
    const problems = await open(page);
    await expect(page.locator('#main [role="grid"]')).toHaveAttribute('aria-multiselectable', 'true');
    await card(page, 't1').click();
    await expect(card(page, 't1')).toHaveAttribute('aria-selected', 'true');
    await card(page, 'd1').click({ modifiers: ['ControlOrMeta'] });
    await expect(card(page, 't1')).toHaveAttribute('aria-selected', 'true');
    await expect(card(page, 'd1')).toHaveAttribute('aria-selected', 'true');
    await card(page, 'd1').click({ modifiers: ['ControlOrMeta'] });
    await expect(card(page, 'd1')).toHaveAttribute('aria-selected', 'false');
    await card(page, 'b1').click();
    await card(page, 'b2').click({ modifiers: ['Shift'] });
    await expect(card(page, 'b1')).toHaveAttribute('aria-selected', 'true');
    await expect(card(page, 'b2')).toHaveAttribute('aria-selected', 'true');
    await expect(card(page, 't1')).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('#main [aria-selected="true"]')).toHaveCount(0);
    expect((await ofKind(page, 'selected')).map((e) => e[1])).toEqual([['t1'], ['t1', 'd1'], ['t1'], ['b1'], ['b1', 'b2'], []]);
    // Keyboard: Ctrl+Space toggles, Shift+Down extends.
    await card(page, 'd1').focus();
    await page.keyboard.press('Control+Space');
    await expect(card(page, 'd1')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(card(page, 'd2')).toBeFocused();
    await expect(card(page, 'd2')).toHaveAttribute('aria-selected', 'true');
    await expect(card(page, 'd1')).toHaveAttribute('aria-selected', 'true');
    expect(problems).toEqual([]);
  });

  test('single and none selection modes', async ({ page }) => {
    await open(page, 'selection=single');
    await card(page, 't1').click();
    await card(page, 'd1').click({ modifiers: ['ControlOrMeta'] });
    await expect(page.locator('#main [aria-selected="true"]')).toHaveCount(1);
    await expect(card(page, 'd1')).toHaveAttribute('aria-selected', 'true');
    await open(page, 'selection=none');
    await card(page, 't1').click();
    await expect(card(page, 't1')).not.toHaveAttribute('aria-selected');
    await expect(page.locator('#main [role="grid"]')).not.toHaveAttribute('aria-multiselectable');
  });

  test('controlled selectedCards: the parent value wins and drives the selection', async ({ page }) => {
    await open(page, 'controlled=1');
    await setFlag(page, '__freezeSelection', true);
    await card(page, 't1').click();
    expect(await ofKind(page, 'selected')).toEqual([['selected', ['t1'], 'pointer']]);
    await expect(card(page, 't1')).toHaveAttribute('aria-selected', 'false');
    await page.evaluate(() => (window as unknown as { __setSelected(v: string[]): void }).__setSelected(['x1', 'r1']));
    await expect(card(page, 'x1')).toHaveAttribute('aria-selected', 'true');
    await expect(card(page, 'r1')).toHaveAttribute('aria-selected', 'true');
    await setFlag(page, '__freezeSelection', false);
    await card(page, 't2').click();
    await expect(card(page, 't2')).toHaveAttribute('aria-selected', 'true');
    await expect(card(page, 'x1')).toHaveAttribute('aria-selected', 'false');
  });

  test('onCardClick and onCardDoubleClick report the card; preventDefault on click skips the selection', async ({ page }) => {
    await open(page);
    await card(page, 'd1').click();
    expect(await ofKind(page, 'click')).toEqual([['click', 'd1', 'pointer']]);
    await expect(card(page, 'd1')).toHaveAttribute('aria-selected', 'true');
    await clearEvents(page);
    await setFlag(page, '__vetoClick', true);
    await card(page, 't1').click();
    expect(await ofKind(page, 'click')).toEqual([['click', 't1', 'pointer']]);
    await expect(card(page, 't1')).toHaveAttribute('aria-selected', 'false');
    await setFlag(page, '__vetoClick', false);
    await card(page, 'x1').dblclick();
    expect(await ofKind(page, 'dblclick')).toEqual([['dblclick', 'x1', 'pointer']]);
    // Default double-click action with `editor`: the card editor opens.
    await expect(page.locator('dialog.salmon-kanban-editor')).toBeVisible();
  });
});

test.describe('Kanban swimlanes', () => {
  test('swimlanes render lane groups with headers and counts; Up / Down cross lanes', async ({ page }) => {
    const problems = await open(page, 'fixture=lanes');
    const lanes = page.locator('#lanes [role="rowgroup"].salmon-kanban-lane');
    await expect(lanes).toHaveCount(3);
    await expect(lanes.nth(0).locator('.salmon-kanban-lane-title')).toHaveText(/^Alice\s*2$/);
    await expect(lanes.nth(1).locator('.salmon-kanban-lane-title')).toHaveText(/^Bob\s*2$/);
    await expect(lanes.nth(2).locator('.salmon-kanban-lane-title')).toHaveText(/^Unassigned\s*1$/);
    await expect(lanes.nth(0).getByRole('rowheader').first()).toHaveText(/^Alice/);
    // The (sticky) lane header never covers the top of its lane's cells.
    const laneHeader = (await lanes.nth(0).locator('.salmon-kanban-lane-header').boundingBox())!;
    expect(laneHeader.y + laneHeader.height).toBeLessThanOrEqual((await cell(page, 'todo', '#lanes', 0).boundingBox())!.y + 0.5);
    expect(await titles(page, 'todo', '#lanes', 1)).toEqual(['Bob todo']);
    await expect(cell(page, 'todo', '#lanes', 1).getByRole('rowheader')).toHaveText('To do, Bob, 1 cards');
    await card(page, 'a1', '#lanes').focus();
    await page.keyboard.press('ArrowDown');
    expect(await focusedCard(page)).toBe('sc1');
    await page.keyboard.press('ArrowDown');
    expect(await focusedCard(page)).toBe('su1');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    expect(await focusedCard(page)).toBe('sa2');
    expect(problems).toEqual([]);
  });

  test('cards move across lanes with swimlanes.draggable and write the lane field', async ({ page }) => {
    await open(page, 'fixture=lanes');
    await drag(page, card(page, 'a1', '#lanes'), await centerOf(cell(page, 'doing', '#lanes', 1), 0.7));
    expect(await titles(page, 'doing', '#lanes', 1)).toEqual(['Alice todo']);
    expect(await ofKind(page, 'move')).toEqual([['move', ['a1'], 'todo', 'alice', 'doing', 'bob', 0, 'pointer']]);
    const change = (await ofKind(page, 'change'))[0] as [string, string, { owner: string; status: string }[]];
    expect(change[2][0]).toMatchObject({ owner: 'bob', status: 'doing' });
    // Keyboard: PageDown moves the drop target to the next lane.
    await card(page, 'a2', '#lanes').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('PageDown');
    await expect(live(page, '#lanes')).toHaveText('In progress, Bob, position 1 of 2');
    await page.keyboard.press('Space');
    // Alice's lane is empty now and not declared `showEmpty`: Bob's lane comes first.
    await expect(page.locator('#lanes .salmon-kanban-lane')).toHaveCount(2);
    expect(await titles(page, 'doing', '#lanes', 0)).toEqual(['Alice doing', 'Alice todo']);
  });

  test('without swimlanes.draggable a cross-lane drop is refused', async ({ page }) => {
    await open(page, 'fixture=lanes&lanesDraggable=0');
    await drag(page, card(page, 'a1', '#lanes'), await centerOf(cell(page, 'todo', '#lanes', 1), 0.7), {
      beforeUp: async () => {
        await expect(cell(page, 'todo', '#lanes', 1)).toHaveAttribute('data-drop-denied', '');
      },
    });
    expect(await titles(page, 'todo', '#lanes', 0)).toEqual(['Alice todo']);
    expect(await ofKind(page, 'move')).toEqual([]);
    // Within the lane the card still moves.
    await drag(page, card(page, 'a1', '#lanes'), await centerOf(cell(page, 'done', '#lanes', 0), 0.7));
    expect(await titles(page, 'done', '#lanes', 0)).toEqual(['Alice todo']);
  });
});

test.describe('Kanban card drag', () => {
  test('pointer drag moves a card within and between columns; preventDefault and Escape cancel', async ({ page }) => {
    const problems = await open(page);
    // Within a column: Set up CI below Draft API.
    await drag(page, card(page, 't1'), await centerOf(card(page, 't2'), 0.8), {
      beforeUp: async () => {
        await expect(card(page, 't2')).toHaveAttribute('data-drop', 'after');
        await expect(page.locator('#main .salmon-kanban-ghost')).toHaveCount(1);
        await expect(card(page, 't1')).toHaveAttribute('data-dragging', '');
      },
    });
    await expect(page.locator('#main .salmon-kanban-ghost')).toHaveCount(0);
    expect(await titles(page, 'todo')).toEqual(['Draft API', 'Set up CI']);
    // Between columns: Fix login before Kickoff.
    await drag(page, card(page, 'd2'), await centerOf(card(page, 'x1'), 0.2));
    expect(await titles(page, 'done')).toEqual(['Fix login', 'Kickoff']);
    expect(await ofKind(page, 'move')).toEqual([
      ['move', ['t1'], 'todo', 'todo', 1, 'pointer', null],
      ['move', ['d2'], 'doing', 'done', 0, 'pointer', null],
    ]);
    expect((await ofKind(page, 'change')).map((e) => e[1])).toEqual(['move', 'move']);
    // The drop click neither selects nor fires onCardClick.
    expect(await ofKind(page, 'click')).toEqual([]);
    // onCardMove preventDefault keeps the card.
    await clearEvents(page);
    await setFlag(page, '__vetoMove', true);
    await drag(page, card(page, 'd1'), await centerOf(cell(page, 'done'), 0.9));
    expect(await ofKind(page, 'move')).toHaveLength(1);
    expect(await ofKind(page, 'change')).toEqual([]);
    expect(await titles(page, 'doing')).toEqual(['Build board']);
    await setFlag(page, '__vetoMove', false);
    // Escape during a pointer drag cancels it.
    await drag(page, card(page, 'd1'), await centerOf(cell(page, 'done'), 0.9), {
      beforeUp: async () => {
        await page.keyboard.press('Escape');
        await expect(page.locator('#main .salmon-kanban-ghost')).toHaveCount(0);
      },
    });
    expect(await ofKind(page, 'move')).toHaveLength(1);
    expect(await titles(page, 'doing')).toEqual(['Build board']);
    expect(problems).toEqual([]);
  });

  test('keyboard drag: Space lifts, arrows move with live-region text, Space drops, Escape cancels', async ({ page }) => {
    const problems = await open(page);
    await expect(card(page, 't1')).toHaveAttribute('aria-describedby', /.+/);
    const describedBy = await card(page, 't1').getAttribute('aria-describedby');
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Press Space to pick up. Arrow keys move, Space drops, Escape cancels.');
    await card(page, 't1').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#main')).toHaveAttribute('data-keyboard-drag', '');
    await expect(card(page, 't1')).toHaveAttribute('data-lifted', '');
    await expect(live(page)).toHaveText('Picked up Set up CI. To do, position 1 of 2');
    await page.keyboard.press('ArrowDown');
    await expect(live(page)).toHaveText('To do, position 2 of 2');
    await page.keyboard.press('ArrowRight');
    await expect(live(page)).toHaveText('In progress, position 2 of 3');
    await expect(card(page, 'd2')).toHaveAttribute('data-drop', 'before');
    await page.keyboard.press('Space');
    await expect(live(page)).toHaveText('Set up CI dropped. In progress, position 2 of 3');
    expect(await titles(page, 'doing')).toEqual(['Build board', 'Set up CI', 'Fix login']);
    await expect(card(page, 't1')).toBeFocused();
    await expect(page.locator('#main')).not.toHaveAttribute('data-keyboard-drag');
    expect(await ofKind(page, 'move')).toEqual([['move', ['t1'], 'todo', 'doing', 1, 'keyboard', null]]);
    // Escape cancels a lifted card.
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(live(page)).toHaveText('Move cancelled, Set up CI returned');
    expect(await titles(page, 'doing')).toEqual(['Build board', 'Set up CI', 'Fix login']);
    await expect(card(page, 't1')).toBeFocused();
    await expect(page.locator('#main [data-lifted]')).toHaveCount(0);
    expect(await ofKind(page, 'move')).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  test('keyboard drag is mirrored in RTL', async ({ page }) => {
    await open(page, 'dir=rtl');
    await card(page, 't1').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowLeft');
    await expect(live(page)).toHaveText('In progress, position 1 of 3');
    await page.keyboard.press('Enter');
    expect(await titles(page, 'doing')).toEqual(['Set up CI', 'Build board', 'Fix login']);
  });

  test('onCardChange preventDefault cancels the built-in move and edit writes', async ({ page }) => {
    await open(page);
    await setFlag(page, '__vetoChange', true);
    await drag(page, card(page, 'd1'), await centerOf(cell(page, 'done'), 0.9));
    expect((await ofKind(page, 'change')).map((e) => e[1])).toEqual(['move']);
    expect(await titles(page, 'doing')).toEqual(['Build board', 'Fix login']);
    await card(page, 'd1').dblclick();
    const dialog = page.locator('dialog.salmon-kanban-editor');
    await dialog.getByLabel('Title').fill('Renamed');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await ofKind(page, 'change')).map((e) => e[1])).toEqual(['move', 'update']);
    await expect(card(page, 'd1')).toContainText('Build board');
  });

  test('source writes are optimistic and a rejected write reverts with an announcement', async ({ page }) => {
    const problems = collectProblems(page);
    trackModules(page);
    await page.goto(`${URL}?fixture=source`);
    await expect(card(page, 's1', '#source')).toBeVisible();
    await dragReady(page);
    await drag(page, card(page, 's1', '#source'), await centerOf(cell(page, 'done', '#source'), 0.9));
    expect(await titles(page, 'done', '#source')).toEqual(['Remote three', 'Remote one']);
    await expect.poll(async () => (await ofKind(page, 'write')).length).toBe(1);
    expect((await ofKind(page, 'write'))[0]).toEqual(['write', ['s1'], 0, 0]);
    await page.waitForTimeout(200);
    expect(await titles(page, 'done', '#source')).toEqual(['Remote three', 'Remote one']);
    // A rejected write: the optimistic move shows at once, then reverts.
    await setFlag(page, '__rejectWrite', true);
    await drag(page, card(page, 's2', '#source'), await centerOf(cell(page, 'done', '#source'), 0.9));
    expect(await titles(page, 'done', '#source')).toEqual(['Remote three', 'Remote one', 'Remote two']);
    await expect.poll(() => titles(page, 'todo', '#source')).toEqual(['Remote two']);
    await expect(live(page, '#source')).toHaveText('The change could not be saved');
    expect(await ofKind(page, 'dataError')).toEqual([['dataError', 'write', 'rejected']]);
    expect(problems).toEqual([]);
  });
});

test.describe('Kanban drag group and external drop', () => {
  test('a card moves between two boards of one dragGroup with out / in events', async ({ page }) => {
    const problems = await open(page, 'fixture=group');
    await drag(page, card(page, 'l1', '#left'), await centerOf(cell(page, 'todo', '#right'), 0.8));
    expect(await titles(page, 'todo', '#left')).toEqual(['Left two']);
    expect(await titles(page, 'todo', '#right')).toEqual(['Right one', 'Left one']);
    expect(await ofKind(page, 'rightMove')).toEqual([['rightMove', ['l1'], 'todo', 1, 'in']]);
    expect(await ofKind(page, 'leftMove')).toEqual([['leftMove', ['l1'], 'todo', 1, 'out']]);
    expect(await ofKind(page, 'leftChange')).toEqual([['leftChange', 'delete', ['l1']]]);
    expect(await ofKind(page, 'rightChange')).toEqual([['rightChange', 'add', ['l1']]]);
    // And back, into the other column.
    await drag(page, card(page, 'l1', '#right'), await centerOf(cell(page, 'done', '#left'), 0.8));
    expect(await titles(page, 'done', '#left')).toEqual(['Left three', 'Left one']);
    expect(await titles(page, 'todo', '#right')).toEqual(['Right one']);
    expect(problems).toEqual([]);
  });

  test('an external drop target accepts cards, removes them unless onDrop prevents it, and refuses by accept()', async ({ page }) => {
    await open(page, 'fixture=group');
    const trash = page.locator('#trash');
    await drag(page, card(page, 'l2', '#left'), await centerOf(trash), {
      beforeUp: async () => {
        await expect(trash).toHaveAttribute('data-drop-target', '');
      },
    });
    await expect(trash).not.toHaveAttribute('data-drop-target');
    expect(await ofKind(page, 'externalDrop')).toEqual([['externalDrop', ['l2'], 'trash']]);
    await expect(card(page, 'l2', '#left')).toHaveCount(0);
    expect(await ofKind(page, 'leftChange')).toEqual([['leftChange', 'delete', ['l2']]]);
    // preventDefault keeps the card.
    await setFlag(page, '__keepOnDrop', true);
    await drag(page, card(page, 'l1', '#left'), await centerOf(trash));
    expect(await ofKind(page, 'externalDrop')).toHaveLength(2);
    await expect(card(page, 'l1', '#left')).toHaveCount(1);
    // accept() refuses Left three: no drop.
    await drag(page, card(page, 'l3', '#left'), await centerOf(trash), {
      beforeUp: async () => {
        await expect(trash).not.toHaveAttribute('data-drop-target');
      },
    });
    expect(await ofKind(page, 'externalDrop')).toHaveLength(2);
    await expect(card(page, 'l3', '#left')).toHaveCount(1);
  });
});

test.describe('Kanban keyboard', () => {
  test('arrows, Home / End and Ctrl+Home / End move between cards; one tab stop', async ({ page }) => {
    const problems = await open(page);
    await expect(page.locator('#main [role="grid"] [tabindex="0"]')).toHaveCount(1);
    await expect(card(page, 'b1')).toHaveAttribute('tabindex', '0');
    // Tab reaches the board's single card tab stop after the header buttons.
    await header(page, 'done').locator('.salmon-kanban-grip').focus();
    await page.keyboard.press('Tab');
    expect(await focusedCard(page)).toBe('sb1');
    await page.keyboard.press('ArrowRight');
    expect(await focusedCard(page)).toBe('st1');
    await page.keyboard.press('ArrowDown');
    expect(await focusedCard(page)).toBe('st2');
    await page.keyboard.press('ArrowRight');
    expect(await focusedCard(page)).toBe('sd2');
    await page.keyboard.press('Home');
    expect(await focusedCard(page)).toBe('sd1');
    await page.keyboard.press('End');
    expect(await focusedCard(page)).toBe('sd2');
    await page.keyboard.press('ControlOrMeta+Home');
    expect(await focusedCard(page)).toBe('sb1');
    await page.keyboard.press('ControlOrMeta+End');
    expect(await focusedCard(page)).toBe('sx1');
    await page.keyboard.press('ArrowRight');
    expect(await focusedCard(page)).toBe('sx1');
    // The roving tab stop follows focus.
    await expect(page.locator('#main [role="grid"] [tabindex="0"]')).toHaveCount(1);
    await expect(card(page, 'x1')).toHaveAttribute('tabindex', '0');
    // Collapsed columns are skipped.
    await header(page, 'todo').locator('.salmon-kanban-toggle').click();
    await card(page, 'b1').focus();
    await page.keyboard.press('ArrowRight');
    expect(await focusedCard(page)).toBe('sd1');
    expect(problems).toEqual([]);
  });

  test('Left / Right are mirrored in RTL', async ({ page }) => {
    await open(page, 'dir=rtl');
    await card(page, 'b1').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await focusedCard(page)).toBe('st1');
    await page.keyboard.press('ArrowRight');
    expect(await focusedCard(page)).toBe('sb1');
    // The first column sits at the inline start (right edge) of the board.
    const [b, t] = await Promise.all([cell(page, 'backlog').boundingBox(), cell(page, 'todo').boundingBox()]);
    expect(b!.x).toBeGreaterThan(t!.x);
  });
});

test.describe('Kanban editor', () => {
  test('double click opens the editor; required validation; Save updates and returns focus', async ({ page }) => {
    const problems = await open(page);
    await card(page, 'd1').dblclick();
    const dialog = page.locator('dialog.salmon-kanban-editor');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('Edit card');
    // md control metrics in a lg dialog.
    expect(await dialog.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('10px');
    expect(await dialog.getByLabel('Title').evaluate((el) => [el.getBoundingClientRect().height, getComputedStyle(el).borderRadius])).toEqual([32, '6px']);
    expect((await dialog.getByRole('button', { name: 'Save' }).boundingBox())!.height).toBe(32);
    await expect(dialog.getByLabel('Title')).toHaveValue('Build board');
    await expect(dialog.getByLabel('Description')).toHaveValue('Columns and cards');
    await expect(dialog.getByLabel('Column')).toHaveValue('doing');
    expect(await ofKind(page, 'editing')).toEqual([['editing', 'd1', 'pointer']]);
    await dialog.getByLabel('Title').fill('');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.locator('.salmon-kanban-editor-error')).toHaveText('Title is required');
    await expect(dialog.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByLabel('Title')).toBeFocused();
    await dialog.getByLabel('Title').fill('Build kanban');
    await dialog.getByLabel('Column').selectOption('done');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    // An update keeps the card's place in the data order (sort `by: 'data'`).
    expect(await titles(page, 'done')).toEqual(['Build kanban', 'Kickoff']);
    const change = (await ofKind(page, 'change'))[0] as [string, string, { title: string; status: string }[]];
    expect(change[1]).toBe('update');
    expect(change[2][0]).toMatchObject({ id: 'd1', title: 'Build kanban', status: 'done' });
    await expect(card(page, 'd1')).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('Enter opens the editor, Delete removes the card, Escape and Cancel close with focus back on the card', async ({ page }) => {
    await open(page);
    const dialog = page.locator('dialog.salmon-kanban-editor');
    await card(page, 't2').focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(card(page, 't2')).toBeFocused();
    expect((await ofKind(page, 'editing')).map((e) => e[1])).toEqual(['t2', null]);
    await page.keyboard.press('F2');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card(page, 't2')).toBeFocused();
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card(page, 't2')).toHaveCount(0);
    expect((await ofKind(page, 'change')).map((e) => e[1])).toEqual(['delete']);
    // The API opens and closes the editor.
    await page.evaluate(() => (window as unknown as { __api: { openEditor(id: string): void } }).__api.openEditor('x1'));
    await expect(dialog.getByLabel('Title')).toHaveValue('Kickoff');
    await page.evaluate(() => (window as unknown as { __api: { closeEditor(): void } }).__api.closeEditor());
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('Kanban tooltip', () => {
  test('the tooltip shows on hover and on focus and describes the card', async ({ page }) => {
    const problems = await open(page, 'tooltip=1');
    const tip = page.locator('#main [role="tooltip"]');
    await card(page, 'd1').hover();
    await expect(tip).toHaveText('Build board — Columns and cards');
    const id = await tip.getAttribute('id');
    await expect(card(page, 'd1')).toHaveAttribute('aria-describedby', new RegExp(`${id}$`));
    await page.mouse.move(5, 5);
    await expect(tip).toHaveCount(0);
    await expect(card(page, 'd1')).not.toHaveAttribute('aria-describedby', new RegExp(`${id}`));
    // Keyboard focus shows it too; moving on describes the next card.
    await card(page, 't1').focus();
    await expect(tip).toHaveText('Set up CI');
    await page.keyboard.press('ArrowDown');
    await expect(tip).toHaveText('Draft API');
    await expect(card(page, 't2')).toHaveAttribute('aria-describedby', new RegExp(`${id}$`));
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test.describe('Kanban virtualization', () => {
  const VURL = 'fixture=virtual';
  test('a virtual cell renders a window; scrolling renders later cards', async ({ page }) => {
    const problems = await open(page, VURL);
    const c0 = cell(page, 'c0', '#virtual');
    await expect(c0).toHaveAttribute('data-virtual', '');
    const rendered = await c0.locator('[data-card]').count();
    expect(rendered).toBeGreaterThan(3);
    expect(rendered).toBeLessThan(40);
    await expect(c0.locator('.salmon-kanban-spacer')).toHaveCount(1);
    await expect(header(page, 'c0', '#virtual').locator('.salmon-kanban-count')).toHaveText('2000');
    await c0.evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
    await expect(c0.locator('[data-card]').first()).not.toHaveAttribute('data-card', 'sv0-0');
    const mid = await titles(page, 'c0', '#virtual');
    const n = Number(/Card 0-(\d+)/.exec(mid[0] ?? '')?.[1]);
    expect(n).toBeGreaterThan(500);
    expect(mid.length).toBeLessThan(40);
    await expect(c0.locator('.salmon-kanban-spacer')).toHaveCount(2);
    expect(problems).toEqual([]);
  });

  test('keyboard End reaches the last card of a virtual cell; Home comes back', async ({ page }) => {
    await open(page, VURL);
    await card(page, 'v0-0', '#virtual').focus();
    await page.keyboard.press('End');
    await expect.poll(() => focusedCard(page)).toBe('sv0-1999');
    await expect(card(page, 'v0-1999', '#virtual')).toBeInViewport();
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => focusedCard(page)).toBe('sv0-1998');
    await page.keyboard.press('Home');
    await expect.poll(() => focusedCard(page)).toBe('sv0-0');
    await page.evaluate(() => (window as unknown as { __virtual: { focusCard(id: string): void } }).__virtual.focusCard('v2-1500'));
    await expect.poll(() => focusedCard(page)).toBe('sv2-1500');
  });

  test('a pointer drag near the cell edge auto-scrolls the virtual cell and drops deep in it', async ({ page }) => {
    await open(page, VURL);
    const c1 = cell(page, 'c1', '#virtual');
    const box = (await c1.boundingBox())!;
    const start = await centerOf(card(page, 'v0-1', '#virtual'));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 10, start.y + 10, { steps: 2 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4, { steps: 6 });
    await expect.poll(() => c1.evaluate((el) => el.scrollTop), { timeout: 5000 }).toBeGreaterThan(600);
    // Move off the edge so scrolling stops, then drop.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
    await page.mouse.up();
    const move = (await ofKind(page, 'move'))[0] as unknown[];
    expect(move.slice(0, 3)).toEqual(['move', ['v0-1'], 'c0']);
    expect(move[3]).toBe('c1');
    expect(move[4] as number).toBeGreaterThan(5);
    await expect(header(page, 'c1', '#virtual').locator('.salmon-kanban-count')).toHaveText('2001');
  });
});

test.describe('Kanban narrow layout and loading', () => {
  test('a narrow container shows the column picker and one snapped column per view', async ({ page }) => {
    const problems = await open(page, 'fixture=narrow');
    const picker = page.locator('#narrow select.salmon-kanban-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAccessibleName('Column');
    const scroller = page.locator('#narrow .salmon-kanban-scroller');
    const sBox = (await scroller.boundingBox())!;
    const cBox = (await cell(page, 'backlog', '#narrow').boundingBox())!;
    expect(cBox.width).toBeGreaterThan(sBox.width * 0.8);
    expect(cBox.width).toBeLessThanOrEqual(sBox.width);
    expect(await scroller.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x');
    await picker.selectOption({ label: 'In progress' });
    await expect
      .poll(async () => {
        const c = (await cell(page, 'doing', '#narrow').boundingBox())!;
        const s = (await scroller.boundingBox())!;
        return Math.abs(c.x - s.x) < 20;
      })
      .toBe(true);
    await expect(cell(page, 'doing', '#narrow')).toBeInViewport({ ratio: 0.9 });
    // A wide board has no picker.
    await open(page);
    await expect(page.locator('#main select.salmon-kanban-picker')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('a data source shows the loading state, then the cards', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?fixture=source`);
    const root = page.locator('#source');
    await expect(root).toHaveAttribute('aria-busy', 'true');
    await expect(root).toHaveAttribute('data-state', 'loading');
    await expect(root.locator('.salmon-kanban-status')).toHaveText('Loading…');
    await expect(card(page, 's1', '#source')).toBeVisible();
    await expect(root).not.toHaveAttribute('aria-busy');
    await expect(root).not.toHaveAttribute('data-state');
    await expect(root.locator('.salmon-kanban-status')).toHaveText('');
    expect(await titles(page, 'todo', '#source')).toEqual(['Remote one', 'Remote two']);
    expect(problems).toEqual([]);
  });
});

test.describe('Kanban hydration', () => {
  for (const fixture of ['basic', 'lanes', 'virtual']) {
    test(`?mode=hydrate (${fixture}) hydrates with zero console errors or warnings`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.goto(`${URL}?mode=hydrate&fixture=${fixture}`);
      await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
      const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
      expect(html).toContain('role="grid"');
      expect(html).toContain('class="salmon-kanban-card"');
      await page.waitForTimeout(300);
      // Interactive after hydration.
      const first = page.locator('.salmon-kanban-card').first();
      await first.click();
      await expect(first).toHaveAttribute('aria-selected', 'true');
      expect(problems).toEqual([]);
    });
  }
});
