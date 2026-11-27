'use client';

// `useTextSuggest`:
// inline completions for any native <textarea>, the Inputs `TextArea` first.
// An explicit composition: the application calls the hook and passes `ref`
// to the field, so `@salmonui/inputs/text-field` carries no suggestion code
// and no loader. The controller
// (`internal/suggest.ts`) owns the ghost text, the hint and the polite live
// region as DOM next to the field; nothing here touches React state, and the
// server render is unchanged (the ref never runs there).

import { useCallback, useLayoutEffect, useRef } from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { attachSuggest, type SuggestController, type SuggestOptions } from '../internal/suggest.js';

export type TextSuggestOptions = SuggestOptions;

export interface TextSuggest {
  /** Pass to the field: `<TextArea ref={suggest.ref} />` (a stable callback ref). */
  readonly ref: (textarea: HTMLTextAreaElement | null) => void;
}

/**
 * Attaches inline suggestions to the `<textarea>` that receives `ref`. Options
 * are read when events happen, so `suggest` and the callbacks may be inline
 * functions.
 */
export function useTextSuggest(options: TextSuggestOptions): TextSuggest {
  const latest = useRef(options);
  // The attached field and its controller. A ref forwarded through a
  // component that builds a new callback per render (the Inputs `TextArea`)
  // is called with `null` and then the same element on every commit, so a
  // detach waits for a microtask and is cancelled when the element comes
  // back: the controller (and a request in flight) survives re-renders.
  const attached = useRef<{ el: HTMLTextAreaElement; controller: SuggestController; leaving: boolean } | null>(null);
  const localeText = useLocaleText('textSuggest', options.localeText);
  useLayoutEffect(() => {
    // The controller reads `localeText`: the provider-merged text.
    attached.current?.controller.update((latest.current = { ...options, localeText }));
  });
  const ref = useCallback((textarea: HTMLTextAreaElement | null) => {
    const current = attached.current;
    if (current && current.el === textarea) {
      current.leaving = false;
      return undefined;
    }
    if (!textarea) {
      if (!current) return undefined;
      current.leaving = true;
      queueMicrotask(() => {
        if (!current.leaving || attached.current !== current) return;
        current.controller.dispose();
        attached.current = null;
      });
      return undefined;
    }
    current?.controller.dispose();
    attached.current = { el: textarea, controller: attachSuggest(textarea, latest.current), leaving: false };
    return undefined;
  }, []);
  return { ref };
}
