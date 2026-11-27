'use client';

// useSmartPaste: reads the clipboard inside the user gesture, describes the
// form's fields to a provider-agnostic adapter and fills the answer back.
// `pending` is the only React state; the request's AbortController lives in
// a ref and is aborted by a newer paste and on unmount.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { collectControls, describeFields, fillControls, parseAnswer, type SmartPasteCustomField, type SmartPasteField } from './fields.js';

export type { SmartPasteCustomField, SmartPasteField } from './fields.js';

/** What the adapter receives: the pasted text and the field descriptors, never other page data. */
export interface SmartPasteRequest {
  readonly clipboardText: string;
  readonly fields: readonly SmartPasteField[];
}

/** Returns a JSON object keyed by field name, or JSON text of one. */
export type SmartPasteAdapter = (request: SmartPasteRequest, init: { readonly signal: AbortSignal }) => Promise<string | Readonly<Record<string, unknown>>>;

/** Field names filled, and the described fields the answer did not fill. */
export interface SmartPasteResult {
  readonly filled: readonly string[];
  readonly skipped: readonly string[];
}

export interface SmartPasteOptions {
  /** Fields that are not native controls (a Salmon `Select`, `Combobox`, `DatePicker`): described to the adapter and filled by `fill`. */
  readonly fields?: readonly SmartPasteCustomField[] | undefined;
}

export interface SmartPaste {
  /**
   * Without an argument reads `navigator.clipboard.readText()` (call it from
   * the click handler, inside the user gesture); with `text` uses that text.
   * Rejects with the adapter's error, the clipboard error, or an `AbortError`
   * when a newer paste or unmount aborted it.
   */
  readonly paste: (text?: string) => Promise<SmartPasteResult>;
  /** True while a paste waits for the clipboard or the adapter. */
  readonly pending: boolean;
}

/**
 * Smart paste for the form (or any container) behind `formRef`: pair it with
 * any `Button` (`onClick={() => paste()}`, `aria-busy={pending}`).
 */
export function useSmartPaste(formRef: RefObject<HTMLElement | null>, adapter: SmartPasteAdapter, options?: SmartPasteOptions): SmartPaste {
  const [pending, setPending] = useState(false);
  const current = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      current.current?.abort();
      current.current = null;
    },
    [],
  );
  const paste = async (text?: string): Promise<SmartPasteResult> => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const { signal } = controller;
    // Read before the first await so the call stays inside the user gesture.
    const clipboard = text === undefined ? navigator.clipboard.readText() : text;
    setPending(true);
    try {
      const clipboardText = await clipboard;
      signal.throwIfAborted();
      const root = formRef.current;
      const groups = root ? collectControls(root) : new Map();
      const custom = options?.fields ?? [];
      const fields = [...describeFields(groups), ...custom.map(({ fill: _fill, ...field }) => field)];
      const answer = parseAnswer(await adapter({ clipboardText, fields }, { signal }));
      signal.throwIfAborted();
      const filled: string[] = [];
      const skipped: string[] = [];
      for (const field of fields) {
        const value = answer[field.name];
        const list = groups.get(field.name);
        const fill = custom.find((c) => c.name === field.name)?.fill;
        const ok = value !== undefined && value !== null && value !== '' && (list ? fillControls(list, value) : fill?.(value) !== false);
        (ok ? filled : skipped).push(field.name);
      }
      return { filled, skipped };
    } finally {
      if (current.current === controller) {
        current.current = null;
        setPending(false);
      }
    }
  };
  return { paste, pending };
}
