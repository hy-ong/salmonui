import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';

// axe-core helpers shared by the a11y specs. axe-core's exact version is pinned in the root
// package.json.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

export interface AxeSummary {
  violations: { id: string; impact: string | null; nodes: string[] }[];
  incomplete: string[];
  passes: number;
}

export async function axe(page: Page, only?: readonly string[]): Promise<AxeSummary> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (runOnly) => {
    // Let running CSS transitions (dialog / popover open fades) finish first: axe
    // computes color-contrast from the composited opacity, so a surface caught
    // mid-fade reports false "serious" contrast failures. Bounded so a stuck
    // transition cannot hang the run; infinite CSS animations (spinners) are ignored.
    const transitions = document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => undefined));
    await Promise.race([Promise.all(transitions), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    // The grid, its live regions, the toolbar (previous sibling of the grid), the pager
    // (next sibling) and open overlays (portaled); page-level landmark rules belong to the host app.
    // Non-grid component pages: the Listbox root and `[data-salmon-a11y-root]` (Buttons, ...); menu
    // triggers, split buttons and menus (popups are portaled); pivot dialogs (portaled backdrops).
    const include = ['.salmon-data-grid', '.salmon-data-grid-live', '.salmon-data-grid-toolbar', '.salmon-data-grid-pager', '[data-salmon-popover]', '.salmon-listbox', '[data-salmon-a11y-root]', '.salmon-menu-button', '.salmon-split-button', '.salmon-menu', '.salmon-popover', '.salmon-tooltip', '.salmon-dialog', '.salmon-drawer', '.salmon-color-picker-popup', '.salmon-pivot-table-backdrop'].filter((s) => document.querySelector(s)).map((s) => [s]);
    const result = await axeApi.run(
      { include },
      runOnly
        ? { resultTypes: ['violations', 'incomplete'], runOnly: { type: 'rule', values: runOnly } }
        : { resultTypes: ['violations', 'incomplete'], rules: { region: { enabled: false } } },
    );
    return {
      violations: result.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) })),
      incomplete: result.incomplete.map((v: any) => v.id),
      passes: result.passes.length,
    };
  }, only ? [...only] : null);
}

export async function expectClean(page: Page, state: string, reviewed: readonly string[] = []): Promise<void> {
  const result = await axe(page);
  const violations = result.violations;
  expect(violations, `${state}: ${JSON.stringify(violations)}`).toEqual([]);
  // "Needs review" items must have a documented reason. color-contrast: axe
  // cannot resolve the background under sticky header and pinned cells.
  const unexpected = result.incomplete.filter((id) => id !== 'color-contrast' && !reviewed.includes(id));
  expect(unexpected, `${state}: incomplete ${unexpected.join(',')}`).toEqual([]);
}
