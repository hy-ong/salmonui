import type { CSSProperties, ReactNode, Ref, RefObject } from 'react';
import type { DataSource } from '@salmonui/core/data';
import type { SearchOperator } from '../internal/collection/search.js';

/** `'startsWith' | 'contains' | 'endsWith'` or a predicate; Mention defaults to `'contains'`. */
export type MentionSearchOperator<T> = SearchOperator<T>;

/** Default item shape: `{ value, label, disabled }`; a string or number is its own value and label. */
export interface MentionItem {
  readonly value: string | number;
  readonly label?: string;
  readonly disabled?: boolean;
}

/**
 * Remote suggestions: any `@salmonui/data` source (or another object with the
 * structural `read()` of the Data Grid data source contract). The search
 * text is sent as `query.search`, the result window as `range`.
 */
export type MentionDataSource<T> = Pick<DataSource<T>, 'read'>;

/** Local items or a remote source. */
export type MentionData<T> = readonly T[] | MentionDataSource<T>;

export interface MentionTrigger<T = MentionItem> {
  /** The trigger character (or string), for example `'@'` or `'#'`. */
  readonly char: string;
  /** Suggestions for this trigger; defaults to the `Mention` `data`. */
  readonly data?: MentionData<T>;
  /** Keep the trigger character in the inserted text. */
  readonly keepChar?: boolean;
  /** Text appended after the insertion, such as `' '` or `'\n'`. */
  readonly suffix?: string;
}

/** What the change and insert callbacks report as the cause. */
export type MentionEventSource = 'pointer' | 'keyboard' | 'touch' | 'api';

export interface MentionInsertEvent<T = MentionItem> {
  readonly item: T;
  /** The text that replaces the trigger and the search text. */
  readonly text: string;
  /** The trigger character that started this mention. */
  readonly trigger: string;
  readonly source: MentionEventSource;
}

export interface MentionBeforeInsertEvent<T = MentionItem> extends MentionInsertEvent<T> {
  /** Cancels the insertion; the list stays open. */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export type MentionOpenChangeReason = 'trigger' | 'insert' | 'escape' | 'outside' | 'blur' | 'caret' | 'tab';

export interface MentionOpenChangeEvent {
  readonly source: MentionEventSource;
  readonly reason: MentionOpenChangeReason;
}

export interface MentionSearchChangeEvent {
  readonly text: string;
  readonly trigger: string;
}

export interface MentionRenderItemContext<T = MentionItem> {
  readonly item: T;
  readonly label: string;
  readonly active: boolean;
  readonly disabled: boolean;
  /** Matched range of `label` when `highlightMatches` is on, else null. */
  readonly matches: readonly [number, number] | null;
  readonly trigger: string;
}

export interface MentionLocaleText {
  /** Accessible name of the suggestion list. */
  readonly listLabel: string;
  /** Shown when nothing matches. */
  readonly noResults: string;
  /** Shown while a remote read is pending. */
  readonly loading: string;
  /** Shown when a remote read fails. */
  readonly loadError: string;
}

export type MentionPart = 'root' | 'popup' | 'list' | 'option';

/** What `Mention` asks an editor target to insert. */
export interface MentionEditorInsertion {
  /** Offset of the trigger in the text block (the text `getTextBeforeCaret()` returns). */
  readonly start: number;
  /** Offset of the caret: `[start, end)` is the trigger and the search text to replace. */
  readonly end: number;
  /** The text the textarea path would insert: trigger (with `keepChar`), the insert text, then `suffix`. */
  readonly text: string;
  /** The trigger suffix included at the end of `text` (`''` by default). */
  readonly suffix: string;
  readonly trigger: string;
  readonly value: string | number;
  readonly label: string;
  readonly item: unknown;
}

/**
 * A rich text surface `Mention` attaches to instead of a `<textarea>` or
 * `<input>`: a plain `contenteditable` element through
 * `createContentEditableMentionTarget`, or the `@salmonui/rich-text` engine.
 * Offsets count the characters of the current text block, an inline atom
 * (an inserted mention) as one U+FFFC character.
 */
export interface MentionEditorTarget {
  /**
   * The editable element (the host gives it `role="textbox"`). `Mention` adds the
   * combobox ARIA attributes to it while the list is open, listens for `keydown` in
   * the capture phase (keys it handles while open call `preventDefault()` and
   * `stopImmediatePropagation()`), for composition and for `focusout`.
   */
  readonly element: HTMLElement;
  /** Text of the current text block from its start to the caret; `null` when the selection is not collapsed or not editable. */
  getTextBeforeCaret(): string | null;
  /** Viewport rectangle of the character at `offset` of that text, `null` when unknown. */
  getCaretRect(offset: number): { readonly left: number; readonly top: number; readonly bottom: number } | null;
  /** Replaces `[start, end)` of the text block with the mention (and its suffix) and puts the caret after it. */
  insertMention(insertion: MentionEditorInsertion): void;
  /** Calls `listener` after the editor applied a text or selection change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export interface MentionProps<T = MentionItem> {
  /** One `<textarea>` or `<input>` (possibly nested in other markup). Omit it and pass `target` instead. */
  readonly children?: ReactNode;
  /** The field to attach to when it is not a child. */
  readonly target?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  /**
   * A `contenteditable` surface to attach to instead of a field: the
   * result of `createContentEditableMentionTarget(element)` or the target a
   * rich text editor provides. Keep it stable across renders; it wins over
   * `target` and children fields.
   */
  readonly editor?: MentionEditorTarget | null;
  /** Suggestions for triggers without their own `data`. */
  readonly data?: MentionData<T>;
  /** Trigger characters, each with optional own data (default `[{ char: '@' }]`). */
  readonly triggers?: readonly MentionTrigger<T>[];
  /** A trigger only counts at the start or after whitespace (default `true`). */
  readonly requireLeadingSpace?: boolean;
  /** The search text may contain spaces. */
  readonly multiWord?: boolean;
  /** Characters typed after the trigger before the list opens. */
  readonly minSearchLength?: number;
  /** Suggestions shown at most. */
  readonly maxResults?: number;
  /** Default `'contains'`. */
  readonly searchOperator?: MentionSearchOperator<T>;
  readonly matchCase?: boolean;
  readonly ignoreAccents?: boolean;
  /** Fields a remote source searches (default `['label']`). */
  readonly searchFields?: readonly string[];
  /** Delay in ms before a remote read (default 300); local data filters on every keystroke. */
  readonly debounce?: number;
  /** Mark the matched text in each suggestion (`<mark>`). */
  readonly highlightMatches?: boolean;
  readonly getItemValue?: (item: T) => string | number;
  readonly getItemLabel?: (item: T) => string;
  readonly isItemDisabled?: (item: T) => boolean;
  /** Text inserted for an item (default its label). */
  readonly getInsertText?: (item: T, trigger: MentionTrigger<T>) => string;
  readonly onBeforeInsert?: (event: MentionBeforeInsertEvent<T>) => void;
  readonly onInsert?: (event: MentionInsertEvent<T>) => void;
  readonly onOpenChange?: (open: boolean, event: MentionOpenChangeEvent) => void;
  readonly onSearchChange?: (event: MentionSearchChangeEvent) => void;
  readonly onLoadError?: (error: unknown) => void;
  readonly renderItem?: (context: MentionRenderItemContext<T>) => ReactNode;
  readonly renderEmpty?: () => ReactNode;
  readonly renderLoading?: () => ReactNode;
  readonly renderError?: (context: { readonly error: unknown }) => ReactNode;
  readonly localeText?: Partial<MentionLocaleText>;
  /** Portal container of the popup (default the field's closest theme scope, else `document.body`). */
  readonly container?: Element | null;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly classNames?: Partial<Record<MentionPart, string>>;
  readonly styles?: Partial<Record<MentionPart, CSSProperties>>;
  /** The root `<div>` that wraps `children`. */
  readonly ref?: Ref<HTMLDivElement>;
}
