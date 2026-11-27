// Form context of the field primitive. `Form`
// provides it; every field registers one entry so a submit can validate,
// reveal and focus fields without re-rendering the others.
import { createContext, use, type ReactNode } from 'react';

/** When errors become visible. */
export type ValidateOn = 'blur' | 'change' | 'submit';

/** `'native'` blocks an invalid submit; `'aria'` marks fields and lets it proceed. */
export type ValidationBehavior = 'native' | 'aria';

/** Server errors keyed by field `name`. */
export type ValidationErrors = Readonly<Record<string, string | readonly string[] | undefined>>;

/** One registered field. */
export interface FieldEntry {
  readonly name: () => string;
  /** The element focused when the field is the first invalid one. */
  readonly element: () => HTMLElement | null;
  /** Runs every rule now: the errors, or a promise while async rules are pending. */
  readonly validate: () => readonly string[] | Promise<readonly string[]>;
  /** Reveals the current errors (submit attempt, `invalid` event). */
  readonly reveal: () => void;
  /** Hides errors again (form reset). */
  readonly conceal: () => void;
}

export interface FormContextValue {
  readonly validationBehavior: ValidationBehavior;
  readonly validateOn: ValidateOn | undefined;
  readonly validationErrors: ValidationErrors | undefined;
  readonly register: (entry: FieldEntry) => () => void;
}

export const FormContext = createContext<FormContextValue | null>(null);

// The field state of the nearest field: shared here so a field outside the
// Inputs package (the rich text editor) reads the `Field` it sits in.

export interface FieldState {
  readonly inputId: string;
  readonly labelId: string;
  readonly descriptionId: string;
  readonly errorId: string;
  /** Errors currently shown (rules, native constraints, server). */
  readonly errors: readonly string[];
  /** True while an error is shown or `invalid` is set. */
  readonly invalid: boolean;
  readonly validating: boolean;
  readonly hasDescription: boolean;
  /** ARIA wiring for the element that owns the value. */
  readonly inputProps: {
    readonly id: string;
    readonly 'aria-describedby': string | undefined;
    readonly 'aria-invalid': true | undefined;
    readonly 'aria-errormessage': string | undefined;
  };
  /** `data-*` state hooks for the root. */
  readonly rootProps: {
    readonly 'data-invalid': '' | undefined;
    readonly 'data-disabled': '' | undefined;
    readonly 'data-validating': '' | undefined;
  };
  /** Call from the control's blur handler. */
  readonly onBlur: () => void;
  /** Runs every rule now and reveals the result (e.g. on commit). */
  readonly validate: () => readonly string[] | Promise<readonly string[]>;
  readonly errorMessage: ReactNode | ((ctx: { readonly errors: readonly string[] }) => ReactNode) | undefined;
}

/** The field state of the nearest field (`useFieldContext`, `FieldError`, `FieldDescription`). */
export const FieldStateContext = createContext<FieldState | null>(null);

/** The state of the enclosing `Field`, or null outside one. */
export function useFieldContext(): FieldState | null {
  return use(FieldStateContext);
}
