'use client';

import { useLayoutEffect, useMemo, useRef, type FormEvent, type SubmitEvent, type FormHTMLAttributes, type ReactNode, type Ref } from 'react';
import { FormContext, type FieldEntry, type FormContextValue, type ValidateOn, type ValidationBehavior, type ValidationErrors } from '@salmonui/core/internal/field/context';
import { assignRef } from '@salmonui/core/internal/form';

/** `onBeforeValidate` event: `preventDefault()` skips client validation for this submit. */
export interface FormValidateEvent {
  readonly form: HTMLFormElement;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `onValidate` result: errors keyed by field `name`. */
export interface FormValidationResult {
  readonly valid: boolean;
  readonly errors: Readonly<Record<string, readonly string[]>>;
}

export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'action'> {
  readonly children?: ReactNode;
  readonly ref?: Ref<HTMLFormElement> | undefined;
  /** A URL or a React 19 action (`useActionState`). */
  readonly action?: string | ((formData: FormData) => void | Promise<void>) | undefined;
  /** `'native'` (default) blocks an invalid submit and focuses the first invalid field; `'aria'` marks fields and submits. */
  readonly validationBehavior?: ValidationBehavior | undefined;
  /** Default `validateOn` of the fields inside. Default `'blur'`. */
  readonly validateOn?: ValidateOn | undefined;
  /** Server errors keyed by field `name`, shown until the field's value changes. */
  readonly validationErrors?: ValidationErrors | undefined;
  readonly onBeforeValidate?: ((event: FormValidateEvent) => void) | undefined;
  readonly onValidate?: ((result: FormValidationResult) => void) | undefined;
  /**
   * Marks the label of every required field inside with a decorative
   * asterisk (`@salmonui/inputs/form/styles.css`); the requirement itself is
   * announced from `required` / `aria-required`. A `Field` opts out with
   * `requiredMark={false}`.
   */
  readonly requiredMark?: boolean | undefined;
}

const isPromise = (x: unknown): x is Promise<readonly string[]> => typeof (x as Promise<unknown> | null)?.then === 'function';

/**
 * A native `<form>` that validates its Salmon fields on submit. Native submission, `FormData`, `useFormStatus` and React 19
 * actions work unchanged. `ref` is the `<form>`.
 */
export function Form(props: FormProps): ReactNode {
  const { children, ref, validationBehavior = 'native', validateOn, validationErrors, onBeforeValidate, onValidate, onSubmit, onReset, noValidate, action, requiredMark, ...rest } = props;
  const entries = useRef(new Set<FieldEntry>());
  const node = useRef<HTMLFormElement | null>(null);
  // Set while a submit replays after async rules settled.
  const replay = useRef(false);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const context = useMemo<FormContextValue>(
    () => ({
      validationBehavior,
      validateOn,
      validationErrors,
      register: (entry) => {
        entries.current.add(entry);
        return () => void entries.current.delete(entry);
      },
    }),
    [validationBehavior, validateOn, validationErrors],
  );

  const ordered = (): FieldEntry[] =>
    [...entries.current].sort((a, b) => {
      const x = a.element();
      const y = b.element();
      if (!x || !y) return 0;
      return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

  const finish = (form: HTMLFormElement, list: FieldEntry[], results: (readonly string[])[]): boolean => {
    const errors: Record<string, readonly string[]> = {};
    let first: HTMLElement | null = null;
    results.forEach((r, i) => {
      if (r.length === 0) return;
      const entry = list[i] as FieldEntry;
      errors[entry.name() || `#${i}`] = r;
      first ??= entry.element();
    });
    // Native controls outside Salmon fields.
    let valid = Object.keys(errors).length === 0;
    if (valid && !form.checkValidity()) {
      valid = false;
      for (const el of Array.from(form.elements)) {
        const c = el as HTMLInputElement;
        if (c.willValidate && !c.validity.valid) {
          first ??= c;
          if (c.name) errors[c.name] = [c.validationMessage];
        }
      }
    }
    latest.current.onValidate?.({ valid, errors });
    if (!valid && latest.current.validationBehavior !== 'aria') (first as HTMLElement | null)?.focus();
    return valid;
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    const form = event.currentTarget;
    if (replay.current) {
      replay.current = false;
      onSubmit?.(event);
      return;
    }
    let skip = false;
    const before: FormValidateEvent = {
      form,
      get defaultPrevented() {
        return skip;
      },
      preventDefault() {
        skip = true;
      },
    };
    latest.current.onBeforeValidate?.(before);
    if (!skip) {
      const list = ordered();
      const results = list.map((e) => e.validate());
      const blocking = latest.current.validationBehavior !== 'aria';
      if (results.some(isPromise)) {
        // wait for pending rules, then submit again or focus the first error.
        event.preventDefault();
        void Promise.all(results).then((settled) => {
          const valid = finish(form, list, settled);
          if (valid || !blocking) {
            replay.current = true;
            form.requestSubmit();
          }
        });
        return;
      }
      const valid = finish(form, list, results as (readonly string[])[]);
      if (!valid && blocking) {
        event.preventDefault();
        return;
      }
    }
    onSubmit?.(event);
  };

  const handleReset = (event: FormEvent<HTMLFormElement>): void => {
    onReset?.(event);
    for (const entry of entries.current) entry.conceal();
  };

  return (
    <FormContext value={context}>
      <form
        {...rest}
        action={action as never}
        // Salmon shows the messages; the browser's bubbles stay off (still works through reportValidity()).
        noValidate={noValidate ?? true}
        data-required-mark={requiredMark}
        ref={(el) => {
          node.current = el;
          assignRef(ref as never, el);
        }}
        onSubmit={handleSubmit}
        onReset={handleReset}
      >
        {children}
      </form>
    </FormContext>
  );
}
