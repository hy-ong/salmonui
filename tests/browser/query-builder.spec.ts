import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// QueryBuilder in the browser. Page:
// examples/vite-spa/inputs.html?only=query (src/inputs-query.tsx).

async function open(page: Page, query = '?only=query'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true && !!window.__qb);
}
const events = (page: Page, kind: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const value = (page: Page) => page.evaluate(() => window.__qb!.getValue()) as Promise<{ logic: string; not?: boolean; filters: { id: string; field?: string; filters?: unknown[]; locked?: boolean; value?: unknown; operator?: string }[] }>;
const qb = (page: Page) => page.locator('#qb');
const rule = (page: Page, id: string) => page.locator(`#qb [data-node-id="${id}"]`);

test.describe('QueryBuilder', () => {
  test('add and remove rules and groups keep focus; groups are named by their connector', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const root = qb(page).getByRole('group', { name: 'Audience' });
    await expect(qb(page).getByRole('group', { name: 'Or group' })).toBeVisible();
    await root.locator(':scope > .salmon-query-builder__bar [data-action="addCondition"]').click();
    const v = await value(page);
    const added = v.filters.at(-1)!;
    expect(added.field).toBe('');
    // Focus moves to the new rule's field picker.
    await expect(rule(page, added.id).getByRole('combobox', { name: 'Field' })).toBeFocused();
    await rule(page, added.id).getByRole('button', { name: 'Remove condition' }).click();
    await expect(root.locator(':scope > .salmon-query-builder__bar [data-action="addCondition"]')).toBeFocused();
    expect((await value(page)).filters.length).toBe(3);
    // A new group starts with one rule (addRuleToNewGroups).
    await root.locator(':scope > .salmon-query-builder__bar [data-action="addGroup"]').click();
    const g = (await value(page)).filters.at(-1)!;
    expect(g.filters?.length).toBe(1);
    expect((await events(page, 'qb')).at(-1)).toMatchObject({ action: 'addGroup' });
    expect(problems).toEqual([]);
  });

  test('maxGroups disables adding groups at the nesting limit', async ({ page }) => {
    await open(page);
    const nested = qb(page).getByRole('group', { name: 'Or group' });
    await nested.locator(':scope > .salmon-query-builder__bar [data-action="addGroup"]').click();
    const inner = nested.getByRole('group', { name: 'And group' });
    await expect(inner.locator(':scope > .salmon-query-builder__bar [data-action="addGroup"]')).toBeDisabled();
  });

  test('field picker lists categories; picking a field selects its first operator', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__qb!.addRules([{ id: 'new', field: '', operator: '' }]));
    await rule(page, 'new').getByRole('combobox', { name: 'Field' }).click();
    await expect(page.getByRole('group', { name: 'Person' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Place' })).toBeVisible();
    await page.getByRole('option', { name: 'Age' }).click();
    await expect.poll(async () => (await page.evaluate(() => window.__qb!.getNode('new'))) as unknown).toMatchObject({ field: 'age', operator: 'equal' });
  });

  test('value editors write typed values; numbers step; matchCase is written', async ({ page }) => {
    await open(page);
    const age = rule(page, 'r2').getByRole('spinbutton', { name: 'Value' });
    await age.fill('42');
    await age.blur();
    await expect.poll(async () => ((await page.evaluate(() => window.__qb!.getNode('r2'))) as { value: unknown }).value).toBe(42);
    await age.focus();
    await age.press('ArrowUp');
    await expect.poll(async () => ((await page.evaluate(() => window.__qb!.getNode('r2'))) as { value: unknown }).value).toBe(47);
    await rule(page, 'r1').getByRole('textbox', { name: 'Value' }).fill('Ada');
    // matchCase is written to every edited condition.
    await expect.poll(async () => ((await page.evaluate(() => window.__qb!.getNode('r1'))) as { matchCase?: boolean }).matchCase).toBe(true);
    await expect(page.locator('#qb-sql')).toContainText("name LIKE '%Ada%'");
    // between shows two editors; a boolean field a checkbox; in a chips combobox.
    await page.evaluate(() => window.__qb!.addRules([{ id: 'b', field: 'age', operator: 'between', value: [1, 2] }, { id: 'c', field: 'active', operator: 'equal', value: false }, { id: 'd', field: 'name', operator: 'in', value: ['x'] }]));
    await expect(rule(page, 'b').getByRole('spinbutton', { name: 'From' })).toHaveValue('1');
    await expect(rule(page, 'b').getByRole('spinbutton', { name: 'To' })).toHaveValue('2');
    await rule(page, 'c').getByRole('checkbox', { name: 'Value' }).check();
    await expect.poll(async () => ((await page.evaluate(() => window.__qb!.getNode('c'))) as { value: unknown }).value).toBe(true);
    await expect(rule(page, 'd').getByRole('combobox', { name: 'Value' })).toBeVisible();
  });

  test('the NOT toggle negates a group', async ({ page }) => {
    await open(page);
    await qb(page).getByRole('group', { name: 'Or group' }).getByRole('checkbox', { name: 'Not' }).first().check();
    expect(((await value(page)).filters[1] as { not?: boolean }).not).toBe(true);
    await expect(page.locator('#qb-sql')).toContainText('NOT (');
  });

  test('lock disables a rule; clone copies a node next to itself and focuses it', async ({ page }) => {
    await open(page);
    await rule(page, 'r1').getByRole('button', { name: 'Lock' }).click();
    expect((await value(page)).filters[0]?.locked).toBe(true);
    await expect(rule(page, 'r1').getByRole('combobox', { name: 'Field' })).toBeDisabled();
    await expect(rule(page, 'r1').getByRole('button', { name: 'Remove condition' })).toHaveCount(0);
    await rule(page, 'r1').getByRole('button', { name: 'Unlock' }).click();
    expect((await value(page)).filters[0]?.locked).toBeUndefined();
    await rule(page, 'r4').getByRole('button', { name: 'Clone condition' }).click();
    const v = await value(page);
    expect(v.filters.length).toBe(4);
    expect(v.filters[3]).toMatchObject({ field: 'tier', operator: 'equal', value: 'gold' });
    await expect(rule(page, v.filters[3]!.id).getByRole('combobox', { name: 'Field' })).toBeFocused();
    // The API locks groups and clones into another group.
    await page.evaluate(() => window.__qb!.lock('g1'));
    await expect(qb(page).getByRole('group', { name: 'Or group' }).locator('[data-action="addCondition"]')).toHaveCount(0);
    const id = await page.evaluate(() => window.__qb!.clone('r1', { parentId: 'g1', index: 0 }));
    expect((await value(page)).filters[1]?.filters?.[0]).toMatchObject({ id, field: 'name' });
  });

  test('Alt+Arrow on a handle moves rules into and out of groups; pointer drag drops before a rule', async ({ page }) => {
    await open(page);
    const handle = rule(page, 'r1').getByRole('button', { name: 'Move', exact: true });
    await handle.focus();
    await page.keyboard.press('Alt+ArrowDown');
    let v = await value(page);
    expect(v.filters[0]?.id).toBe('g1');
    expect(v.filters[0]?.filters?.map((n) => (n as { id: string }).id)).toEqual(['r1', 'r2', 'r3']);
    await expect(rule(page, 'r1').getByRole('button', { name: 'Move', exact: true })).toBeFocused();
    await expect(page.locator('#qb .salmon-query-builder__live')).toHaveText('Moved to position 1');
    await page.keyboard.press('Alt+ArrowUp');
    v = await value(page);
    expect(v.filters.map((n) => n.id)).toEqual(['r1', 'g1', 'r4']);
    expect((await events(page, 'qb-drop')).at(-1)).toMatchObject({ nodeId: 'r1', source: 'keyboard' });
    // Pointer: drag r4 above r1.
    const from = await rule(page, 'r4').getByRole('button', { name: 'Move', exact: true }).boundingBox();
    const to = await rule(page, 'r1').boundingBox();
    await page.mouse.move(from!.x + 5, from!.y + 5);
    await page.mouse.down();
    await page.mouse.move(to!.x + 40, to!.y + 3, { steps: 6 });
    await expect(page.locator('#qb .salmon-query-builder__drop-indicator')).toBeVisible();
    await page.mouse.up();
    await expect.poll(async () => (await value(page)).filters.map((n) => n.id)).toEqual(['r4', 'r1', 'g1']);
    expect((await events(page, 'qb-drag-start')).length).toBe(1);
  });

  test('onBeforeChange cancels a change', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window.__qbCancel = 'removeCondition'));
    await rule(page, 'r4').getByRole('button', { name: 'Remove condition' }).click();
    expect((await value(page)).filters.length).toBe(3);
    await page.evaluate(() => (window.__qbCancel = null));
    await rule(page, 'r4').getByRole('button', { name: 'Remove condition' }).click();
    expect((await value(page)).filters.length).toBe(2);
    // api.remove names the removed node's kind, like the built-in buttons.
    await page.evaluate(() => window.__qb!.remove('g1'));
    expect((await events(page, 'qb')).at(-1)).toMatchObject({ action: 'removeGroup', nodeId: 'g1', source: 'api' });
    await page.evaluate(() => window.__qb!.remove(['r1']));
    expect((await events(page, 'qb')).at(-1)).toMatchObject({ action: 'removeCondition', nodeId: 'r1', source: 'api' });
  });

  test('API value round trip, valid value, validate shows inline errors and blocks submit', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__qb!.addRules([{ id: 'bad', field: 'age', operator: 'equal', value: 300 }, { id: 'half', field: 'name', operator: 'contains' }]));
    expect(await page.evaluate(() => window.__qb!.getValidValue().filters.length)).toBe(4);
    await page.locator('#qb-submit').click();
    expect(await events(page, 'qb-submit')).toEqual([]);
    await expect(rule(page, 'bad').locator('.salmon-query-builder__error')).toHaveText(/150/);
    await expect(rule(page, 'half').locator('.salmon-query-builder__error')).toHaveText('Complete this condition');
    await expect(rule(page, 'bad')).toHaveAttribute('aria-describedby', 'bad-error');
    // Fixing the values validates.
    await page.evaluate(() => window.__qb!.remove(['bad', 'half']));
    expect(await page.evaluate(() => window.__qb!.validate())).toBe(true);
    await page.locator('#qb-submit').click();
    const posted = await page.evaluate(() => window.__inputForms?.['qb']);
    expect(JSON.parse(posted!.find(([k]) => k === 'query')![1]).filters.length).toBe(3);
    await page.evaluate(() => window.__qb!.setValue({ logic: 'or', filters: [{ field: 'name', operator: 'equal', value: 'z' }] }));
    await expect.poll(async () => (await value(page)).logic).toBe('or');
  });

  test('API reads see the API changes made before React commits them', async ({ page }) => {
    await open(page);
    // One script turn: no render task runs between the calls, as when a
    // test's next evaluation reaches a busy page before React's render task.
    const seen = await page.evaluate(() => {
      const api = window.__qb!;
      const ids = api.addRules([{ id: 'bad', field: 'age', operator: 'equal', value: 300 }]);
      const added = api.getValue().filters.length;
      const invalid = api.validate();
      api.remove(ids);
      const node = api.getNode('bad');
      const valid = api.validate();
      api.lock('r1');
      const clone = api.clone('r1');
      return { added, invalid, node, valid, locked: api.getNode('r1')?.locked, cloned: api.getValue().filters.length, clone: clone !== null };
    });
    expect(seen).toEqual({ added: 4, invalid: false, node: null, valid: true, locked: true, cloned: 4, clone: true });
    await expect(rule(page, 'r1').getByRole('button', { name: 'Unlock' })).toBeVisible();
    await expect(rule(page, 'bad')).toHaveCount(0);
  });

  test('summary toggles to the editor with Edit and back with Done', async ({ page }) => {
    await open(page);
    const s = page.locator('#qb-summary');
    await expect(s.locator('.salmon-query-builder__sentence')).toHaveText('Name contains an AND (Age greater than 30 OR Address City equal Oslo) AND Tier equal Gold');
    await s.getByRole('button', { name: 'Edit' }).click();
    await expect(s.getByRole('group', { name: 'Summary' })).toBeVisible();
    await s.getByRole('button', { name: 'Done' }).click();
    await expect(s.getByRole('button', { name: 'Edit' })).toBeFocused();
  });

  test('hydration: the builder hydrates without mismatches', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?only=query&hydrate');
    await expect(qb(page).getByRole('group', { name: 'Or group' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('fieldPicker tree picks fields from a TreeSelect with categories and nested fields (a lazy chunk)', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const tree = page.locator('#qb-tree [data-node-id="t1"]');
    const trigger = tree.getByRole('combobox', { name: 'Field' });
    // The tree picker replaces the list picker once its chunk loads and shows the nested field.
    await expect(trigger).toHaveAttribute('aria-haspopup', 'tree');
    await expect(trigger).toContainText('City');
    await trigger.click();
    const popup = page.getByRole('tree');
    await expect(popup.getByRole('treeitem', { name: 'Place' })).toBeVisible();
    await expect(popup.getByRole('treeitem', { name: 'Person' })).toBeVisible();
    // Categories are parents, not values: open Person and pick Age.
    await popup.getByRole('treeitem', { name: 'Person' }).click();
    await popup.getByRole('treeitem', { name: 'Age' }).click();
    await expect.poll(async () => (await events(page, 'qb-tree')).at(-1)).toEqual({ kind: 'qb-tree', fields: ['age'] });
    await expect(trigger).toContainText('Age');
    // Changing `fieldPicker` after mount swaps the picker of existing rules.
    await page.locator('#qb-tree-switch').click();
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(trigger).toContainText('Age');
    await page.locator('#qb-tree-switch').click();
    await expect(trigger).toHaveAttribute('aria-haspopup', 'tree');
    expect(problems).toEqual([]);
  });

  test('a group is a container: lg radius and 8px padding around md-radius controls', async ({ page }) => {
    await open(page);
    const group = qb(page).locator('.salmon-query-builder__group').first();
    const box = await group.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderTopLeftRadius, padding: s.paddingTop, gap: s.rowGap };
    });
    expect(box).toEqual({ radius: '10px', padding: '8px', gap: '8px' });
    // The rule editors inside keep the control radius, one level lower than the group.
    const select = group.locator('.salmon-query-builder__rule .salmon-select-trigger, .salmon-query-builder__rule [role="combobox"]').first();
    expect(await select.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('6px');
    // A locked group's And / Or connector reads as disabled, like its rule editors.
    await page.evaluate(() => window.__qb!.lock('g1'));
    const logic = qb(page).locator('[data-node-id="g1"] .salmon-query-builder__logic label').first();
    await expect(logic.locator('input')).toBeDisabled();
    expect(await logic.evaluate((el) => getComputedStyle(el).cursor)).toBe('not-allowed');
  });

  test('a between rule stacks inside a narrow container instead of widening the builder', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    await page.evaluate(() => window.__qb!.setValue({ logic: 'and', filters: [{ field: 'age', operator: 'between', value: [18, 65] }] }));
    const root = qb(page);
    await expect(root.locator('.salmon-query-builder__range')).toBeVisible();
    const fits = await root.evaluate((el) => {
      const outer = el.getBoundingClientRect();
      return [...el.querySelectorAll('.salmon-query-builder__group, .salmon-query-builder__range')].every((n) => n.getBoundingClientRect().right <= outer.right + 0.5);
    });
    expect(fits).toBe(true);
  });
});
