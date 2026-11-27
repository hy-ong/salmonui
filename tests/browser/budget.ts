import { expect, test } from '@playwright/test';
import { checkBudget, type BudgetOptions } from '../../tooling/bench/budget.mjs';

/**
 * Checks a measured timing against its product target (tooling/bench/budget.mjs):
 * a failing expectation on an enforcing environment (`local`), a reported
 * miss and a `perf-target-missed` annotation on a relatively gated one
 * (`linux-2080ti`, where `npm run bench` gates against the baseline).
 * `value <= budget`; `{ strict: true }` for `value < budget`; `{ atLeast: true }`
 * for a lower bound (`>=`, strict `>`). `label` names
 * the metric (unique within the suite; it keys the bench's target summary).
 */
export function expectBudget(value: number, budget: number, label: string, options: BudgetOptions = {}): boolean {
  return checkBudget(value, budget, label, {
    ...options,
    fail: (message) => {
      if (options.atLeast) {
        if (options.strict) expect(value, message).toBeGreaterThan(budget);
        else expect(value, message).toBeGreaterThanOrEqual(budget);
      } else if (options.strict) expect(value, message).toBeLessThan(budget);
      else expect(value, message).toBeLessThanOrEqual(budget);
    },
    warn: (message) => {
      test.info().annotations.push({ type: 'perf-target-missed', description: message });
    },
  });
}
