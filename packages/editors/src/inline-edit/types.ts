import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode, Ref } from 'react';
import type { ColumnValidation } from '@salmonui/core/validation';
import type { Placement } from '@salmonui/core/internal/position';

/** Input that caused a lifecycle event. */
export type InlineEditSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** What ended an edit: the action buttons, Enter, Escape, focus leaving, or a ref method. */
export type InlineEditTrigger = 'actions' | 'enter' | 'escape' | 'blur' | 'api';

/** Custom validator of `validation.validate`: an error message, or null / undefined / true when valid (false uses the default message). May be async. */
export type InlineEditValidator<T> = (value: T) => string | boolean | null | undefined | PromiseLike<string | boolean | null | undefined>;

/**
 * Validation rules: the Data Grid `column.validation` vocabulary,
 * evaluated by `@salmonui/core/validation`. Each rule value is the
 * argument or `[argument, message]`.
 */
export type InlineEditValidation<T = unknown> = Omit<ColumnValidation, 'validate'> & {
  readonly validate?: InlineEditValidator<T> | readonly [InlineEditValidator<T>, string] | readonly InlineEditValidator<T>[];
};

/** A cancellable event (`preventDefault()` vetoes the step). */
export interface InlineEditCancellable {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface InlineEditStartEvent {
  readonly source: InlineEditSource;
}

export interface InlineEditSaveEvent<T> {
  /** The value being saved (the draft). */
  readonly value: T;
  /** The saved value before this edit. */
  readonly previousValue: T;
  readonly source: InlineEditSource;
  readonly trigger: InlineEditTrigger;
}

export interface InlineEditCancelEvent<T> {
  /** The discarded draft. */
  readonly value: T;
  readonly source: InlineEditSource;
  readonly trigger: InlineEditTrigger;
}

export interface InlineEditDraftChangeEvent<T> {
  readonly value: T;
  readonly previousValue: T;
}

export interface InlineEditSaveErrorEvent<T> {
  readonly value: T;
  readonly error: unknown;
}

/** Second argument of `onEditingChange` (frozen). */
export interface InlineEditEditingChangeEvent {
  readonly source: InlineEditSource;
  readonly reason: 'start' | 'save' | 'cancel';
}

/** Props for the edit element: spread them on an input or pass them to a Salmon field. */
export interface InlineEditInputProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (event: { readonly target: { readonly value: string } }) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly 'aria-invalid': true | undefined;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-label': string | undefined;
  readonly readOnly: boolean;
  readonly autoFocus: true;
}

/** Argument of the `children` render prop. */
export interface InlineEditRenderContext<T> {
  /** The draft value. */
  readonly value: T;
  /** Replaces the draft. */
  readonly setValue: (value: T) => void;
  /** Wiring for a text-like input (`value` is the draft as a string). */
  readonly inputProps: InlineEditInputProps;
  readonly save: () => void;
  readonly cancel: () => void;
  /** True while `save` (or async validation) is pending. */
  readonly pending: boolean;
  /** Validation messages of the draft (empty when valid). */
  readonly errors: readonly string[];
}

export interface InlineEditActionsContext {
  readonly save: () => void;
  readonly cancel: () => void;
  readonly pending: boolean;
}

/** Text of the built-in parts. */
export interface InlineEditLocaleText {
  readonly save: string;
  readonly cancel: string;
  readonly edit: string;
  readonly empty: string;
  readonly saving: string;
  readonly saveFailed: string;
}

/** Ref handle: the Data Grid edit method names. */
export interface InlineEditApi {
  /** The root element. */
  readonly element: HTMLSpanElement | null;
  startEdit(): void;
  /** Saves the draft; resolves to true when the value was saved. */
  save(): Promise<boolean>;
  cancelEdit(): void;
  /** Validates the draft (or the saved value when idle) and resolves to the error list. */
  validate(): Promise<readonly string[]>;
}

export type InlineEditPart = 'preview' | 'editor' | 'actions' | 'error';

type RootProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'defaultValue' | 'onChange' | 'placeholder' | 'className' | 'style'>;

export interface InlineEditProps<T = string> extends RootProps {
  /** Saved value (controlled). */
  readonly value?: T | undefined;
  /** Initial saved value when uncontrolled. Default `''`. */
  readonly defaultValue?: T | undefined;
  /** Persists a value. May return a promise: pending state, abort on cancel or unmount, rejection keeps editing. */
  readonly save?: ((value: T, options: { readonly signal: AbortSignal }) => void | PromiseLike<void>) | undefined;
  /** `'popover'` (default) opens the editor in a non-modal dialog anchored to the preview; `'inline'` replaces the preview. */
  readonly mode?: 'inline' | 'popover' | undefined;
  /** What starts editing. Default `'click'`. */
  readonly trigger?: 'click' | 'doubleClick' | 'editButton' | undefined;
  /** What focus leaving the editor does. Default `'save'`. */
  readonly blurAction?: 'save' | 'cancel' | 'keep' | undefined;
  /** Enter saves (Mod+Enter in a textarea). Default true. */
  readonly saveOnEnter?: boolean | undefined;
  /** Shows the Save and Cancel buttons. Default true. */
  readonly showActions?: boolean | undefined;
  /** Replaces the default actions. */
  readonly renderActions?: ((context: InlineEditActionsContext) => ReactNode) | undefined;
  readonly validation?: InlineEditValidation<T> | undefined;
  /** Shown when the value is empty. Default `localeText.empty`. */
  readonly placeholder?: ReactNode;
  /** Display state content. Default `String(value)`. */
  readonly renderPreview?: ((context: { readonly value: T; readonly placeholder: ReactNode }) => ReactNode) | undefined;
  /** Field label: the accessible name of the preview and the editor. */
  readonly label?: string | undefined;
  /** Editing state. */
  readonly editing?: boolean | undefined;
  readonly defaultEditing?: boolean | undefined;
  readonly onEditingChange?: ((editing: boolean, event: InlineEditEditingChangeEvent) => void) | undefined;
  readonly disabled?: boolean | undefined;
  /** Form field name: a hidden input carries the saved value. */
  readonly name?: string | undefined;
  /** Popover placement and offset. */
  readonly popoverProps?: { readonly placement?: Placement | undefined; readonly offset?: number | undefined } | undefined;
  readonly localeText?: Partial<InlineEditLocaleText> | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: Partial<Record<InlineEditPart, string>> | undefined;
  readonly styles?: Partial<Record<InlineEditPart, CSSProperties>> | undefined;
  readonly ref?: Ref<InlineEditApi> | undefined;
  /** The edit element. Default: a text input. */
  readonly children?: ((context: InlineEditRenderContext<T>) => ReactNode) | undefined;
  readonly onBeforeEditStart?: ((event: InlineEditStartEvent & InlineEditCancellable) => void) | undefined;
  readonly onEditStart?: ((event: InlineEditStartEvent) => void) | undefined;
  readonly onBeforeSave?: ((event: InlineEditSaveEvent<T> & InlineEditCancellable) => void) | undefined;
  readonly onSave?: ((event: InlineEditSaveEvent<T>) => void) | undefined;
  readonly onSaveError?: ((event: InlineEditSaveErrorEvent<T>) => void) | undefined;
  readonly onBeforeEditCancel?: ((event: InlineEditCancelEvent<T> & InlineEditCancellable) => void) | undefined;
  readonly onEditCancel?: ((event: InlineEditCancelEvent<T>) => void) | undefined;
  readonly onDraftChange?: ((event: InlineEditDraftChangeEvent<T>) => void) | undefined;
}
