export declare const RELATIVE_GATE_ENVIRONMENTS: ReadonlySet<string>;
export declare function benchEnv(vars?: Record<string, string | undefined>, platform?: string): string;
export declare function enforcesTargets(env?: string): boolean;
export interface BudgetOptions {
  /** `value < budget` instead of `value <= budget`. */
  readonly strict?: boolean;
  /** A lower bound: `value >= budget` (`strict`: `>`), for counts that a slower machine lowers. */
  readonly atLeast?: boolean;
  /** Unit printed after the numbers (default `ms`). */
  readonly unit?: string;
  readonly env?: string;
}
export interface ParsedTarget {
  readonly value: number;
  readonly budget: number;
  readonly op: '<' | '<=' | '>' | '>=';
  readonly unit: string;
}
export declare function targetLine(label: string, value: number, budget: number, options?: BudgetOptions): string;
export declare function parseTargets(output: string): Record<string, ParsedTarget>;
export declare function missed(target: ParsedTarget): boolean;
export declare function checkBudget(
  value: number,
  budget: number,
  label: string,
  options?: BudgetOptions & { fail?: (message: string) => void; warn?: (message: string) => void; log?: (message: string) => void },
): boolean;
export declare function assertBudget(value: number, budget: number, label: string, options?: BudgetOptions): boolean;
