// InlineEdit validation: the rules compile with the Data
// Grid evaluator (`@salmonui/core/validation`); built-in rules run synchronously, custom `validate`
// functions may be async. Pure: Node-testable.

import { compileValidationRules, NO_ERRORS, type ColumnValidation, type ValidatorContext } from '@salmonui/core/validation';
import type { InlineEditValidation } from './types.js';

export interface InlineEditValidator {
  /** Built-in rules: the first message, or an empty list. */
  readonly sync: (value: unknown) => readonly string[];
  /** Custom rules, or null when there are none. */
  readonly custom: ((value: unknown) => string | null | PromiseLike<string | null>) | null;
}

// Custom validators of InlineEdit take only the value; the grid context is a frozen stub.
const CONTEXT = Object.freeze({ rowId: '', columnId: '', column: undefined, isNew: false }) as unknown as ValidatorContext<unknown>;

export function compileInlineValidation(rules: InlineEditValidation<never> | undefined): InlineEditValidator | null {
  if (!rules) return null;
  const compiled = compileValidationRules(rules as unknown as ColumnValidation);
  const custom = compiled.custom;
  return {
    sync: (value) => compiled.validate(value, undefined),
    custom: custom ? (value) => custom(value, undefined, CONTEXT) : null,
  };
}

/** Runs every rule; returns the errors synchronously when no custom rule is async. */
export function runValidation(validator: InlineEditValidator | null, value: unknown): readonly string[] | Promise<readonly string[]> {
  if (!validator) return NO_ERRORS;
  const errors = validator.sync(value);
  if (errors.length || !validator.custom) return errors;
  const out = validator.custom(value);
  if (out && typeof (out as PromiseLike<string | null>).then === 'function') {
    return Promise.resolve(out).then((message) => (message ? Object.freeze([message]) : NO_ERRORS));
  }
  return out ? Object.freeze([out as string]) : NO_ERRORS;
}
