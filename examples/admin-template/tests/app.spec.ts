import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// Main flows of the admin template: filters, sorting, the status filter menu,
// paging, the routed editor drawer with its unsaved-changes guard, delete with
// an async confirm, the history tab, the 404 page, the collapsed rail and the
// mobile drawer menu, each with an axe-core run over the whole page.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function axe(page: Page): Promise<{ id: string; nodes: string[] }[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const transitions = document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => undefined));
    await Promise.race([Promise.all(transitions), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    const api = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await api.run(document, { resultTypes: ['violations'] });
    return result.violations.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  });
}

const expectClean = async (page: Page): Promise<void> => expect(await axe(page)).toEqual([]);

const rows = (page: Page) => page.getByRole('grid', { name: '訂單' }).locator('.salmon-data-grid-body [role="row"]');
const status = (page: Page) => page.locator('.atlas-pager');

async function openOrders(page: Page): Promise<void> {
  await page.goto('/workspace/orders');
  await expect(rows(page).first()).toContainText('ORD-02680');
}

test.describe('orders list', () => {
  test('renders the first page and passes axe', async ({ page }) => {
    await openOrders(page);
    await expect(page).toHaveTitle('訂單管理 - Atlas');
    await expect(status(page)).toContainText('顯示 1–25 筆');
    await expect(status(page)).toContainText('共 96 筆');
    await expect(page.getByRole('navigation', { name: '主選單' }).getByRole('link', { name: '訂單管理' })).toHaveAttribute('aria-current', 'page');
    await expectClean(page);
  });

  test('the root redirects to the orders page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/workspace\/orders$/);
  });

  test('filters by keyword and status, and resets', async ({ page }) => {
    await openOrders(page);
    await page.getByRole('textbox', { name: '關鍵字' }).fill('王小安');
    await page.getByRole('button', { name: '查詢' }).click();
    await expect(status(page)).toContainText('共 12 筆');
    await expect(rows(page)).toHaveCount(12);

    await page.getByRole('combobox', { name: '訂單狀態' }).click();
    await page.getByRole('option', { name: '已退款' }).click();
    await page.getByRole('button', { name: '查詢' }).click();
    await expect(status(page)).toContainText('共 4 筆');
    for (const text of await rows(page).allInnerTexts()) expect(text).toContain('已退款');

    await page.getByRole('button', { name: '重設' }).click();
    await expect(status(page)).toContainText('共 96 筆');
    await expect(page.getByRole('textbox', { name: '關鍵字' })).toHaveValue('');
  });

  test('sorts by amount', async ({ page }) => {
    await openOrders(page);
    const header = page.getByRole('columnheader', { name: '金額' });
    await expect(header).toHaveAttribute('aria-sort', 'none');
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(rows(page).first()).toContainText('$680');
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  test('filters the status column from its header menu', async ({ page }) => {
    await openOrders(page);
    await page.getByRole('columnheader', { name: '狀態' }).locator('[data-kind="filter"]').click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();
    await expectClean(page);
    // Clear every value, then keep only 付款失敗.
    await dialog.getByRole('checkbox').first().uncheck();
    await dialog.getByRole('option', { name: /付款失敗/ }).click();
    await dialog.getByRole('button', { name: '確定' }).click();
    await expect(rows(page)).not.toHaveCount(25);
    for (const text of await rows(page).allInnerTexts()) expect(text).toContain('付款失敗');
  });

  test('pages through the orders', async ({ page }) => {
    await openOrders(page);
    await page.locator('.atlas-pager').getByRole('button', { name: /2/ }).first().click();
    await expect(status(page)).toContainText('顯示 26–50 筆');
    await expect(rows(page).first()).toContainText('ORD-02655');
  });
});

test.describe('order editor', () => {
  test('opens the routed drawer with tabs, history and details', async ({ page }) => {
    await openOrders(page);
    await page.getByRole('link', { name: 'ORD-02680' }).click();
    await expect(page).toHaveURL(/\/workspace\/orders\/ORD-02680$/);
    const drawer = page.getByRole('dialog', { name: /編輯訂單/ });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('textbox', { name: '客戶' })).toHaveValue('王小安');
    await expect(page).toHaveTitle('訂單明細 - Atlas');
    await expect(drawer.locator('.atlas-drawer__footer').getByRole('button', { name: '關閉' })).toBeVisible();
    await expectClean(page);

    await drawer.getByRole('tab', { name: '異動紀錄' }).click();
    const history = drawer.getByRole('grid', { name: '異動紀錄' });
    await expect(history.locator('.salmon-data-grid-body [role="row"]')).toHaveCount(2);
    await expectClean(page);
    await history.getByRole('button', { name: '查看異動詳情：狀態、負責人' }).click();
    const details = page.getByRole('dialog', { name: '異動詳情' });
    await expect(details).toBeVisible();
    await expect(details.getByRole('grid', { name: '欄位變更' })).toContainText('未指派');
    await expectClean(page);
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    await expect(drawer).toBeVisible();
  });

  test('asks before discarding unsaved changes, on close and on navigation', async ({ page }) => {
    await openOrders(page);
    await page.getByRole('link', { name: 'ORD-02680' }).click();
    const drawer = page.getByRole('dialog', { name: /編輯訂單/ });
    const customer = page.getByRole('textbox', { name: '客戶' });
    await customer.fill('王大安');
    await expect(drawer.getByRole('button', { name: '儲存' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: '棄用' })).toBeVisible();

    // Close button: keep editing, then discard.
    await drawer.locator('.salmon-dialog-close-button').click();
    const confirm = page.getByRole('alertdialog', { name: '捨棄未儲存的變更？' });
    await expect(confirm).toContainText('關閉後將會遺失');
    await expectClean(page);
    await confirm.getByRole('button', { name: '繼續編輯' }).click();
    await expect(confirm).toBeHidden();
    await expect(customer).toHaveValue('王大安');

    // Browser back is blocked too.
    await page.goBack();
    const leave = page.getByRole('alertdialog', { name: '捨棄未儲存的變更？' });
    await expect(leave).toContainText('離開後將會遺失');
    await leave.getByRole('button', { name: '繼續編輯' }).click();
    await expect(page).toHaveURL(/ORD-02680$/);

    // 棄用 resets the form; the footer goes back to 關閉.
    await drawer.getByRole('button', { name: '棄用' }).click();
    await expect(customer).toHaveValue('王小安');
    await expect(drawer.locator('.atlas-drawer__footer').getByRole('button', { name: '關閉' })).toBeVisible();

    await customer.fill('王大安');
    await drawer.locator('.salmon-dialog-close-button').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '捨棄' }).click();
    await expect(page).toHaveURL(/\/workspace\/orders$/);
    await expect(drawer).toBeHidden();
  });

  test('saves an edit and shows a toast', async ({ page }) => {
    await page.goto('/workspace/orders/ORD-02678');
    await page.getByRole('textbox', { name: '客戶' }).fill('陳柏宇二號');
    await page.getByRole('button', { name: '儲存' }).click();
    await expect(page.locator('.salmon-toast-title', { hasText: '訂單資料已更新' })).toBeVisible();
    await expect(page).toHaveURL(/\/workspace\/orders$/);
    await expect(rows(page).nth(2)).toContainText('陳柏宇二號');
  });

  test('validates a new order', async ({ page }) => {
    await openOrders(page);
    await page.getByRole('button', { name: '新增訂單' }).click();
    await expect(page).toHaveURL(/\/workspace\/orders\/new$/);
    const drawer = page.getByRole('dialog', { name: '新增訂單' });
    await page.getByRole('textbox', { name: '客戶' }).fill('新客戶');
    await page.getByRole('textbox', { name: 'Email' }).fill('not-an-email');
    await drawer.getByRole('button', { name: '儲存' }).click();
    await expect(drawer).toContainText('Email 格式不正確');
    await expect(drawer).toContainText('請輸入方案');
    await page.getByRole('textbox', { name: 'Email' }).fill('new@example.com');
    await page.getByRole('textbox', { name: '方案' }).fill('Starter 年繳方案');
    await drawer.getByRole('button', { name: '儲存' }).click();
    await expect(page.locator('.salmon-toast-title', { hasText: '訂單已新增' })).toBeVisible();
    await expect(status(page)).toContainText('共 97 筆');
  });

  test('deletes an order after an async confirm', async ({ page }) => {
    await page.goto('/workspace/orders/ORD-02679');
    const drawer = page.getByRole('dialog', { name: /編輯訂單/ });
    await drawer.getByRole('button', { name: '刪除' }).click();
    const confirm = page.getByRole('alertdialog', { name: '刪除訂單' });
    await expect(confirm).toContainText('確定要刪除「ORD-02679」嗎？');
    await expectClean(page);
    await confirm.getByRole('button', { name: '刪除' }).click();
    await expect(page.locator('.salmon-toast-title', { hasText: '訂單已刪除' })).toBeVisible();
    await expect(page).toHaveURL(/\/workspace\/orders$/);
    await expect(status(page)).toContainText('共 95 筆');
    await expect(page.getByRole('link', { name: 'ORD-02679' })).toHaveCount(0);
  });

  test('shows a not-found drawer for an unknown order', async ({ page }) => {
    await page.goto('/workspace/orders/ORD-99999');
    const drawer = page.getByRole('dialog', { name: '找不到訂單' });
    await expect(drawer).toContainText('訂單 ORD-99999 不存在');
    await drawer.getByRole('button', { name: '返回訂單列表' }).click();
    await expect(page).toHaveURL(/\/workspace\/orders$/);
  });
});

test.describe('layout', () => {
  test('404 page', async ({ page }) => {
    await page.goto('/nope');
    await expect(page.getByRole('heading', { name: '找不到頁面' })).toBeVisible();
    await expect(page).toHaveTitle('找不到頁面 - Atlas');
    await expectClean(page);
    await page.getByRole('link', { name: '返回首頁' }).click();
    await expect(page).toHaveURL(/\/workspace\/orders$/);
  });

  test('collapses the sidebar to a rail and opens the account menu', async ({ page }) => {
    await openOrders(page);
    const toggle = page.getByRole('button', { name: '收合側邊欄' });
    await toggle.click();
    await expect(page.locator('.salmon-sidebar-menu')).toHaveAttribute('data-collapsed', '');
    await expectClean(page);
    await page.getByRole('button', { name: '展開側邊欄' }).click();
    await expect(page.locator('.salmon-sidebar-menu')).not.toHaveAttribute('data-collapsed', '');

    await page.getByRole('button', { name: 'Olivia 帳號選單' }).click();
    await expect(page.getByRole('menuitem', { name: '個人設定' })).toBeVisible();
    await expectClean(page);
    await page.keyboard.press('Escape');
  });

  test('mobile: the sidebar is a drawer menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOrders(page);
    await expect(page.getByRole('navigation', { name: '主選單' })).toBeHidden();
    await page.getByRole('button', { name: '開啟選單' }).click();
    const nav = page.getByRole('navigation', { name: '主選單' });
    await expect(nav).toBeVisible();
    await expectClean(page);
    await nav.getByRole('link', { name: '總覽' }).click();
    await expect(page).toHaveURL(/\/workspace\/overview$/);
    await expect(nav).toBeHidden();
    await expect(page.getByRole('heading', { name: '找不到頁面' })).toBeVisible();
  });
});
