import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

// axe-core over the Select and Combobox roots and their open popups
// (select.spec.ts, combobox.spec.ts); page-level rules belong to the host page.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

export async function axeDropdowns(page: Page): Promise<{ id: string; nodes: string[] }[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const include = [...document.querySelectorAll('.salmon-select, .salmon-combobox, .salmon-dropdown-popup, .salmon-dropdown-field')].map((el) => [el]);
    const result = await axeApi.run({ include }, { resultTypes: ['violations'], rules: { region: { enabled: false }, 'page-has-heading-one': { enabled: false }, 'landmark-one-main': { enabled: false } } });
    return result.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
  });
}
