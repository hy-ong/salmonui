// Editor field validation: the Data Grid rule names. A module of
// its own so only the lazy editor chunk carries it (`rules.ts` re-exports it).

export interface FieldValidation {
  readonly required?: boolean | string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: RegExp | string;
  /** Returns an error message, or null / undefined when valid. */
  readonly validate?: (value: unknown, values: Readonly<Record<string, unknown>>) => string | null | undefined;
}

export interface ValidationMessages {
  readonly required: string;
  readonly minLength: string;
  readonly maxLength: string;
  readonly pattern: string;
}

/** Errors per role for the editor values; empty when valid. */
export function validateFields(values: Readonly<Record<string, unknown>>, rules: Readonly<Record<string, FieldValidation | undefined>>, messages: ValidationMessages): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [role, rule] of Object.entries(rules)) {
    if (!rule) continue;
    const v = values[role];
    const text = v == null ? '' : String(v);
    if (rule.required && !text.trim()) errors[role] = typeof rule.required === 'string' ? rule.required : messages.required;
    else if (rule.minLength !== undefined && text.length < rule.minLength) errors[role] = messages.minLength.replace('{min}', String(rule.minLength));
    else if (rule.maxLength !== undefined && text.length > rule.maxLength) errors[role] = messages.maxLength.replace('{max}', String(rule.maxLength));
    else if (rule.pattern !== undefined && text && !(typeof rule.pattern === 'string' ? new RegExp(rule.pattern) : rule.pattern).test(text)) errors[role] = messages.pattern;
    else {
      const custom = rule.validate?.(v, values);
      if (custom) errors[role] = custom;
    }
  }
  return errors;
}
