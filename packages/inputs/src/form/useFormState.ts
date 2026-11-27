'use client';

// useFormState: dirty tracking for the native
// FormData model. No field registers anything: the hook snapshots the
// form's FormData when the <form> mounts (its initial values are the
// controls' `defaultValue`s) and compares the live FormData with it on
// `input` / `change` events and on DOM changes of the form's controls (the
// hidden inputs and options Salmon fields render change without events).
// Its own subpath, so `@salmonui/inputs/form` does not carry it.

import { useState } from 'react';

/** What `useFormState()` returns. */
export interface FormState {
  /** Attach to the `<form>` (`<Form ref={state.ref}>`); its values on mount are the initial values. */
  readonly ref: (form: HTMLFormElement | null) => (() => void) | undefined;
  /** True while any field differs from its initial value. */
  readonly isDirty: boolean;
  /** Names of the fields whose values differ from the initial ones, in form order. */
  readonly dirtyFields: readonly string[];
  /** Whether the field `name` differs from its initial value. */
  readonly isFieldDirty: (name: string) => boolean;
  /** Resets the form (`form.reset()`): every field returns to its `defaultValue`, and the state is clean again. */
  readonly reset: () => void;
}

type Snapshot = Map<string, string[]>;

const NONE: readonly string[] = Object.freeze([]);

/** FormData as name -> values; a file compares by name, size and date. */
function snapshot(form: HTMLFormElement): Snapshot {
  const out: Snapshot = new Map();
  new FormData(form).forEach((value, name) => {
    const v = typeof value === 'string' ? value : `${value.name}\0${value.size}\0${value.lastModified}`;
    const list = out.get(name);
    if (list) list.push(v);
    else out.set(name, [v]);
  });
  return out;
}

function changed(initial: Snapshot, current: Snapshot): readonly string[] {
  const names: string[] = [];
  for (const name of new Set([...current.keys(), ...initial.keys()])) {
    const a = initial.get(name);
    const b = current.get(name);
    if (!a || !b || a.length !== b.length || a.some((v, i) => v !== b[i])) names.push(name);
  }
  return names.length ? names : NONE;
}

/**
 * Dirty tracking against the initial values of a native form:
 *
 *   const form = useFormState();
 *   <Form ref={form.ref}>...</Form>
 *   {form.isDirty ? <Button onClick={form.reset}>Discard</Button> : null}
 *
 * Initial values are the form's FormData when it mounts; a form that
 * mounts again (a drawer that opens again, a `key` change after a save)
 * takes a new snapshot and starts clean. Controlled fields whose value the
 * parent holds count as dirty until the parent resets them.
 */
export function useFormState(): FormState {
  const [dirtyFields, setDirtyFields] = useState<readonly string[]>(NONE);
  // The attached form and the teardown of its listeners. `Form` passes its ref through an
  // inline callback, so a re-render detaches (null) and attaches the same <form> again: the
  // teardown waits a microtask and a re-attach of the same form keeps its snapshot.
  const [live] = useState(() => ({ form: null as HTMLFormElement | null, stop: null as (() => void) | null, detached: false }));
  const [ref] = useState(() => (form: HTMLFormElement | null) => {
    if (!form) {
      live.detached = true;
      queueMicrotask(() => (live.detached ? live.stop?.() : undefined));
      return undefined;
    }
    live.detached = false;
    if (form === live.form) return live.stop ?? undefined;
    live.stop?.();
    const initial = snapshot(form);
    // One FormData read per task, after the event: a state update inside the `input` event,
    // before React's own listener, would re-render a controlled field with its old value. The
    // task also runs after a reset has restored native controls.
    let queued = false;
    const check = (): void => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        if (live.form !== form) return;
        const next = changed(initial, snapshot(form));
        setDirtyFields((prev) => (prev.length === next.length && prev.every((n, i) => n === next[i]) ? prev : next));
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'checked', 'selected', 'name', 'disabled'] });
    form.addEventListener('input', check);
    form.addEventListener('change', check);
    form.addEventListener('reset', check);
    live.form = form;
    setDirtyFields(NONE);
    const stop = (): void => {
      if (live.stop !== stop) return;
      live.stop = null;
      live.form = null;
      observer.disconnect();
      form.removeEventListener('input', check);
      form.removeEventListener('change', check);
      form.removeEventListener('reset', check);
      setDirtyFields(NONE);
    };
    live.stop = stop;
    return stop;
  });
  return {
    ref,
    isDirty: dirtyFields.length > 0,
    dirtyFields,
    isFieldDirty: (name) => dirtyFields.includes(name),
    reset: () => {
      live.form?.reset();
      setDirtyFields(NONE);
    },
  };
}
