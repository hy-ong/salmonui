// Text suggestions: a DOM controller attached to a native
// <textarea> by `useTextSuggest` (`@salmonui/chat/text-suggest`, an explicit
// composition the application wires to the Inputs `TextArea`). Request state lives in a per-instance closure, the ghost text in an
// overlay element's textContent; nothing here touches React state, and the
// module never runs on the server (no top-level DOM access).
import { caretOffset } from '@salmonui/dropdowns/internal/caret';

/** What the application's `suggest` function receives. */
export interface SuggestContext {
  readonly value: string;
  readonly textBeforeCaret: string;
  readonly textAfterCaret: string;
}

export type SuggestFunction = (context: SuggestContext, init: { readonly signal: AbortSignal }) => Promise<string | null>;

/** `'auto'`: inline ghost text on fine pointers, a popover on coarse pointers, chosen by CSS. */
export type SuggestionDisplay = 'inline' | 'popover' | 'auto';

/** Cancellable event fired before a suggestion shows. */
export interface BeforeSuggestionShowEvent {
  readonly text: string;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface SuggestionEvent {
  readonly text: string;
}

export interface SuggestLocaleText {
  /** Hint linked through `aria-describedby` while a suggestion is visible. Default "Tab to accept". */
  readonly acceptHint?: string | undefined;
}

export interface SuggestOptions {
  readonly suggest: SuggestFunction;
  readonly suggestionDisplay?: SuggestionDisplay | undefined;
  /** Idle time after the last keystroke before a request, in ms. Default 300. */
  readonly suggestDelay?: number | undefined;
  readonly onBeforeSuggestionShow?: ((event: BeforeSuggestionShowEvent) => void) | undefined;
  readonly onSuggestionShow?: ((event: SuggestionEvent) => void) | undefined;
  readonly onSuggestionAccept?: ((event: SuggestionEvent) => void) | undefined;
  readonly localeText?: SuggestLocaleText | undefined;
  /**
   * Element that receives the overlay, hint and live region; it should be the
   * textarea's positioned wrapper (`position: relative`). Default: the
   * textarea's parent element.
   */
  readonly container?: HTMLElement | undefined;
}

export interface SuggestController {
  update(options: SuggestOptions): void;
  dispose(): void;
}

export const DEFAULT_SUGGEST_DELAY = 300;
export const DEFAULT_ACCEPT_HINT = 'Tab to accept';

/** Letters, digits (any script) and `_`. */
export function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{M}\p{N}_]/u.test(ch);
}

/**
 * Whether a request may start: a collapsed selection, no IME
 * composition, some non-blank text before the caret, and the caret at a word
 * boundary, which here means the character after the caret is not a word
 * character (end of text, whitespace or punctuation). The text before the
 * caret may end in a word (completing it) or in whitespace (next word).
 */
export function isSuggestPosition(value: string, selectionStart: number, selectionEnd: number, composing: boolean): boolean {
  if (composing || selectionStart !== selectionEnd) return false;
  if (value.slice(0, selectionStart).trim() === '') return false;
  return !isWordChar(value[selectionStart]);
}

export function suggestContext(value: string, caret: number): SuggestContext {
  return { value, textBeforeCaret: value.slice(0, caret), textAfterCaret: value.slice(caret) };
}

/**
 * Text inserted at `anchor` between two snapshots when the edit was a plain
 * insertion at the caret, otherwise null (deletions, edits elsewhere).
 */
export function typedSince(prevValue: string, anchor: number, value: string, caret: number): string | null {
  if (caret <= anchor || value.length - caret !== prevValue.length - anchor) return null;
  if (!value.startsWith(prevValue.slice(0, anchor)) || value.slice(caret) !== prevValue.slice(anchor)) return null;
  return value.slice(anchor, caret);
}

/** Remainder of `suggestion` after the user typed its first characters, or null when it no longer matches or is used up. */
export function keepRemainder(suggestion: string, typed: string): string | null {
  return typed !== '' && suggestion.startsWith(typed) && suggestion.length > typed.length ? suggestion.slice(typed.length) : null;
}

export function createBeforeShowEvent(text: string): BeforeSuggestionShowEvent {
  let prevented = false;
  return {
    text,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
}

/** Runs `onBeforeSuggestionShow`; false when the handler called `preventDefault()`. */
export function allowSuggestion(handler: SuggestOptions['onBeforeSuggestionShow'], text: string): boolean {
  const event = createBeforeShowEvent(text);
  handler?.(event);
  return !event.defaultPrevented;
}

export interface SchedulerTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SuggestScheduler {
  /** Restarts the idle timer; aborts the request in flight and drops its result. */
  schedule(context: SuggestContext): void;
  /** Aborts the timer and any request in flight. */
  cancel(): void;
}

/**
 * Debounced, abortable request runner. Each `schedule` or `cancel`
 * aborts the previous AbortController and bumps a token, so a late response
 * of an earlier request is never delivered. Rejections are swallowed: a
 * failed suggestion shows nothing.
 */
export function createSuggestScheduler(
  getSuggest: () => SuggestFunction,
  getDelay: () => number,
  onResult: (text: string, context: SuggestContext) => void,
  timers: SchedulerTimers = globalThis,
): SuggestScheduler {
  let timer: unknown;
  let controller: AbortController | null = null;
  let token = 0;
  const cancel = (): void => {
    token++;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = null;
  };
  return {
    cancel,
    schedule(context) {
      cancel();
      const mine = token;
      timer = timers.setTimeout(() => {
        timer = undefined;
        const current = new AbortController();
        controller = current;
        let pending: Promise<string | null>;
        try {
          pending = Promise.resolve(getSuggest()(context, { signal: current.signal }));
        } catch {
          return;
        }
        pending.then(
          (text) => {
            // `cancel` bumps the token before it aborts: a stale token covers an aborted request.
            if (mine !== token) return;
            controller = null;
            if (text) onResult(text, context);
          },
          () => {},
        );
      }, getDelay());
    },
  };
}

function addToken(list: string | null, id: string): string {
  const tokens = (list ?? '').split(/\s+/).filter(Boolean);
  return (tokens.includes(id) ? tokens : [...tokens, id]).join(' ');
}

function removeToken(list: string | null, id: string): string {
  return (list ?? '').split(/\s+/).filter((t) => t && t !== id).join(' ');
}

/**
 * Attaches suggestions to a native textarea. Call from an effect after
 * hydration; `dispose()` in the effect cleanup.
 */
export function attachSuggest(textarea: HTMLTextAreaElement, options: SuggestOptions): SuggestController {
  const doc = textarea.ownerDocument;
  const view = doc.defaultView!;
  const container = options.container ?? textarea.parentElement!;
  const hintId = `${textarea.id || 'salmon-text-area'}-suggestion-hint-${Math.random().toString(36).slice(2, 8)}`;

  const overlay = doc.createElement('div');
  overlay.className = 'salmon-text-suggest';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  const hint = doc.createElement('span');
  hint.id = hintId;
  hint.className = 'salmon-text-suggest-hint';
  hint.hidden = true;
  const live = doc.createElement('div');
  live.className = 'salmon-text-suggest-live';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  container.append(overlay, hint, live);

  /** Visible suggestion remainder and the value/caret it was shown for. */
  let text: string | null = null;
  let anchorValue = '';
  let anchor = 0;
  let composing = false;
  let accepting = false;

  const applyOptions = (): void => {
    overlay.setAttribute('data-suggestion-display', options.suggestionDisplay ?? 'auto');
    hint.textContent = options.localeText?.acceptHint ?? DEFAULT_ACCEPT_HINT;
  };
  applyOptions();

  const isPopover = (): boolean => {
    const mode = options.suggestionDisplay ?? 'auto';
    return mode === 'popover' || (mode === 'auto' && view.matchMedia?.('(pointer: coarse)').matches === true);
  };

  const place = (): void => {
    if (text === null) return;
    const computed = view.getComputedStyle(textarea);
    const rtl = computed.direction === 'rtl';
    const offset = caretOffset(textarea, anchor);
    const x = rtl ? (offset.right ?? offset.left) : offset.left;
    const style = overlay.style;
    style.direction = computed.direction;
    style.font = computed.font;
    style.letterSpacing = computed.letterSpacing;
    style.top = `${textarea.offsetTop + offset.top - textarea.scrollTop}px`;
    style.left = `${textarea.offsetLeft + x - textarea.scrollLeft}px`;
    style.setProperty('--salmon-text-suggest-line', `${offset.height}px`);
    // Inline ghost text stops at the field's content edge on its side of the caret.
    const room = rtl
      ? x - parseFloat(computed.borderLeftWidth) - parseFloat(computed.paddingLeft)
      : textarea.offsetWidth - x - parseFloat(computed.borderRightWidth) - parseFloat(computed.paddingRight);
    style.setProperty('--salmon-text-suggest-room', `${Math.max(room, 0)}px`);
    overlay.toggleAttribute('data-rtl', rtl);
  };

  const render = (next: string): void => {
    text = next;
    overlay.textContent = next;
    overlay.hidden = false;
    hint.hidden = false;
    textarea.setAttribute('aria-describedby', addToken(textarea.getAttribute('aria-describedby'), hintId));
    if (isPopover()) live.textContent = next;
    place();
  };

  const hide = (): void => {
    if (text === null) return;
    text = null;
    overlay.hidden = true;
    overlay.textContent = '';
    hint.hidden = true;
    live.textContent = '';
    const rest = removeToken(textarea.getAttribute('aria-describedby'), hintId);
    if (rest) textarea.setAttribute('aria-describedby', rest);
    else textarea.removeAttribute('aria-describedby');
  };

  const scheduler = createSuggestScheduler(
    () => options.suggest,
    () => options.suggestDelay ?? DEFAULT_SUGGEST_DELAY,
    (result, context) => {
      // Drop results for a field that moved on without an input event (focus, caret).
      if (doc.activeElement !== textarea || composing) return;
      const caret = textarea.selectionStart;
      if (textarea.value !== context.value || caret !== context.textBeforeCaret.length || caret !== textarea.selectionEnd) return;
      if (!allowSuggestion(options.onBeforeSuggestionShow, result)) return;
      anchorValue = context.value;
      anchor = caret;
      render(result);
      options.onSuggestionShow?.({ text: result });
    },
  );

  const request = (): void => {
    const { value, selectionStart, selectionEnd } = textarea;
    if (isSuggestPosition(value, selectionStart, selectionEnd, composing)) scheduler.schedule(suggestContext(value, selectionStart));
    else scheduler.cancel();
  };

  const stop = (): void => {
    scheduler.cancel();
    hide();
  };

  const accept = (): void => {
    if (text === null) return;
    const accepted = text;
    stop();
    accepting = true;
    try {
      textarea.setSelectionRange(anchor, anchor);
      // execCommand keeps the native undo stack and fires `input` itself.
      let inserted = false;
      try {
        inserted = doc.execCommand('insertText', false, accepted);
      } catch {
        // Unsupported: the setRangeText fallback below.
      }
      if (!inserted) {
        textarea.setRangeText(accepted, anchor, anchor, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } finally {
      accepting = false;
    }
    options.onSuggestionAccept?.({ text: accepted });
  };

  const onInput = (): void => {
    if (accepting || composing) return;
    if (text !== null) {
      const caret = textarea.selectionStart;
      const typed = caret === textarea.selectionEnd ? typedSince(anchorValue, anchor, textarea.value, caret) : null;
      const rest = typed === null ? null : keepRemainder(text, typed);
      if (rest !== null) {
        anchorValue = textarea.value;
        anchor = caret;
        render(rest);
        return;
      }
      hide();
    }
    request();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || composing) return;
    const { key } = event;
    if (key === 'Tab') {
      if (text !== null && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        accept();
      }
      return;
    }
    if (key === 'Escape') {
      if (text !== null) {
        event.preventDefault();
        stop();
      }
      return;
    }
    // Caret movement (arrows, Home, End, Page keys) dismisses; typing and deleting go through `input`.
    if (key.length > 1 && !/^(Backspace|Delete|Enter|Shift|Control|Alt|Meta)$/.test(key)) stop();
  };

  const onCompositionStart = (): void => {
    composing = true;
    stop();
  };
  const onCompositionEnd = (): void => {
    composing = false;
    request();
  };
  // Touch has no Tab key: a press on the popover accepts it, focus stays in the field.
  const onOverlayPress = (event: PointerEvent): void => {
    if (!isPopover()) return;
    event.preventDefault();
    accept();
  };

  const listeners: readonly [string, (event: never) => void][] = [
    ['input', onInput],
    ['keydown', onKeyDown],
    ['compositionstart', onCompositionStart],
    ['compositionend', onCompositionEnd],
    ['blur', stop],
    ['pointerdown', stop],
    ['scroll', place],
  ];
  for (const [type, listener] of listeners) textarea.addEventListener(type, listener as EventListener);
  overlay.addEventListener('pointerdown', onOverlayPress);

  return {
    update(next) {
      options = next;
      applyOptions();
      if (text !== null && isPopover()) live.textContent = text;
    },
    dispose() {
      stop();
      for (const [type, listener] of listeners) textarea.removeEventListener(type, listener as EventListener);
      overlay.remove();
      hint.remove();
      live.remove();
    },
  };
}
