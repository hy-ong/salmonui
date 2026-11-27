// Public types of `@salmonui/chat/inline-assist`. The adapter
// contract mirrors the Conversation adapter: a Promise is one final
// response, an AsyncIterable streams, a plain string chunk is a text delta.

import type { CSSProperties, KeyboardEvent, ReactNode, Ref, RefObject, TextareaHTMLAttributes } from 'react';
import type { StreamPart } from '../internal/stream-run.js';

/** A point in viewport coordinates (`clientX` / `clientY`). */
export interface InlineAssistPoint {
  readonly x: number;
  readonly y: number;
}

/** What the popover is placed next to: an element, a text range (the selection), a point, or a ref to an element. */
export type InlineAssistAnchor = Element | Range | InlineAssistPoint | RefObject<Element | null>;

/** A typed response part; a plain string chunk is `{ type: 'text', delta }`. `reasoning` and `tool` parts are ignored by InlineAssist. */
export type InlineAssistResponsePart = StreamPart;

/** A slash command of the command menu. */
export interface InlineAssistCommand {
  /** Stable id, reported in `onCommandSelect` and in the request. */
  readonly id: string;
  /** Menu text; also what typing after `/` filters on. */
  readonly label: string;
  /** Prompt sent when the command is chosen (default: `label`). */
  readonly prompt?: string;
  /** More words that match the filter. */
  readonly keywords?: readonly string[];
  /** Decorative leading icon. */
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

/** One prompt and its response. */
export interface InlineAssistMessage {
  readonly id: string;
  readonly prompt: string;
  /** Id of the command that produced the prompt. */
  readonly command?: string;
  readonly response: string;
  /** `'aborted'`: stopped by Stop or by closing; `'error'`: the adapter threw. */
  readonly status: 'done' | 'aborted' | 'error';
}

export interface InlineAssistRequest {
  /** The prompt text (a command's `prompt` when a command was chosen). */
  readonly prompt: string;
  /** The chosen command, if any. */
  readonly command: InlineAssistCommand | undefined;
  /** The selected text: `selection`, else the text of a `Range` anchor, else `''`. */
  readonly selection: string;
  /** Earlier prompts and responses (without the new one). */
  readonly messages: readonly InlineAssistMessage[];
}

export type InlineAssistAdapter = (
  request: InlineAssistRequest,
  context: { readonly signal: AbortSignal },
) => PromiseLike<string> | AsyncIterable<string | InlineAssistResponsePart>;

export type InlineAssistMode = 'popover' | 'inline';

export type InlineAssistOpenChangeReason = 'escape' | 'outside' | 'focus-outside' | 'accept' | 'discard' | 'api';

export interface InlineAssistOpenChangeEvent {
  readonly reason: InlineAssistOpenChangeReason;
}

export interface InlineAssistSendEvent {
  readonly request: InlineAssistRequest;
}

export interface InlineAssistBeforeSendEvent extends InlineAssistSendEvent {
  /** Sends nothing and keeps the prompt. */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface InlineAssistCommandSelectEvent {
  readonly command: InlineAssistCommand;
  /** Skips the built-in send of the command prompt. */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface InlineAssistMessagesChangeEvent {
  /** `'response'`: a response finished (or stopped); `'retry'`: Retry replaced the last response. */
  readonly reason: 'response' | 'retry';
}

/** Built-in response actions. */
export type InlineAssistBuiltInAction = 'accept' | 'discard' | 'retry';

export interface InlineAssistCustomAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

export type InlineAssistResponseAction = InlineAssistBuiltInAction | InlineAssistCustomAction;

export interface InlineAssistResponseActionEvent {
  /** `'accept'`, `'discard'`, `'retry'` or a custom action's `id`. */
  readonly action: string;
  readonly text: string;
  readonly message: InlineAssistMessage;
  /** Cancels the built-in follow-up of a built-in action. */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface InlineAssistAcceptEvent {
  readonly text: string;
  readonly message: InlineAssistMessage;
}

export interface InlineAssistDiscardEvent {
  readonly message: InlineAssistMessage;
}

/** Imperative API (`ref`). */
export interface InlineAssistApi {
  open(): void;
  close(): void;
  /** Sends `text` (default: the current prompt) as a new request. */
  send(text?: string): void;
  /** Aborts the running response. */
  stop(): void;
  /** Shows the command menu (unfiltered). */
  showCommands(): void;
  hideCommands(): void;
  /** Focuses the prompt. */
  focus(): void;
  /** The dialog element while open. */
  readonly element: HTMLElement | null;
}

/** Props of the default prompt `<textarea>`; spread them on a custom input in `renderComposer`. */
export type InlineAssistInputProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'onKeyDown' | 'value'> & {
  readonly ref: Ref<HTMLTextAreaElement>;
  readonly value: string;
  readonly onChange: (event: { readonly currentTarget: { readonly value: string } }) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

export interface InlineAssistComposerRenderProps {
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly send: (text?: string) => void;
  readonly stop: () => void;
  /** A response is pending or streaming. */
  readonly responding: boolean;
  readonly inputProps: InlineAssistInputProps;
  /** The built-in `<textarea>`. */
  readonly defaultComposer: ReactNode;
}

export interface InlineAssistContentOptions {
  /** The text is still streaming. */
  readonly streaming: boolean;
}

/** User-visible strings. */
export interface InlineAssistLocaleText {
  /** Accessible name of the dialog. Default `"AI assistant"`. */
  readonly label?: string;
  /** Accessible name of the prompt. Default `"Prompt"`. */
  readonly prompt?: string;
  /** Default `"Ask AI, or type / for commands"`. */
  readonly placeholder?: string;
  readonly send?: string;
  readonly stop?: string;
  readonly accept?: string;
  readonly discard?: string;
  readonly retry?: string;
  /** Accessible name of the command menu. Default `"Commands"`. */
  readonly commands?: string;
  /** Accessible name of the response actions. Default `"Response actions"`. */
  readonly responseActions?: string;
  /** Shown while the response is pending. Default `"Thinking…"`. */
  readonly pending?: string;
  /** Shown when the adapter failed. */
  readonly error?: string;
  /** Accessible name of the dictation button. Default `"Dictate"`. */
  readonly dictation?: string;
}

export interface InlineAssistProps {
  /** Element, text range, viewport point or element ref the popover is placed next to. */
  readonly anchor?: InlineAssistAnchor | null | undefined;
  readonly open?: boolean | undefined;
  /** Applied after hydration (the server renders the assist closed). */
  readonly defaultOpen?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean, event: InlineAssistOpenChangeEvent) => void) | undefined;
  /** `'popover'` (default): an anchored top-layer popover. `'inline'`: rendered in place, in the flow of the page. */
  readonly mode?: InlineAssistMode | undefined;
  /** Prompt text (controlled). */
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  /** Prompt and response history (controlled). */
  readonly messages?: readonly InlineAssistMessage[] | undefined;
  readonly defaultMessages?: readonly InlineAssistMessage[] | undefined;
  readonly onMessagesChange?: ((messages: readonly InlineAssistMessage[], event: InlineAssistMessagesChangeEvent) => void) | undefined;
  readonly placeholder?: string | undefined;
  /** Produces the response. */
  readonly adapter?: InlineAssistAdapter | undefined;
  /** Selected text passed in the request (default: the text of a `Range` anchor). */
  readonly selection?: string | undefined;
  readonly onBeforeSend?: ((event: InlineAssistBeforeSendEvent) => void) | undefined;
  readonly onSend?: ((event: InlineAssistSendEvent) => void) | undefined;
  /** The adapter threw. */
  readonly onError?: ((error: unknown) => void) | undefined;
  /** Slash commands, shown as a `Menu` when the prompt starts with `/` or through `api.showCommands()`. */
  readonly commands?: readonly InlineAssistCommand[] | undefined;
  readonly onCommandSelect?: ((event: InlineAssistCommandSelectEvent) => void) | undefined;
  /** Actions under a finished response. Default `['accept', 'discard', 'retry']`. */
  readonly responseActions?: readonly InlineAssistResponseAction[] | undefined;
  readonly onResponseActionClick?: ((event: InlineAssistResponseActionEvent) => void) | undefined;
  /** Accept: insert `text` into the editor. Closes the assist. */
  readonly onAccept?: ((event: InlineAssistAcceptEvent) => void) | undefined;
  /** Discard: the response is dropped. Closes the assist. */
  readonly onDiscard?: ((event: InlineAssistDiscardEvent) => void) | undefined;
  /** Extra controls next to the prompt (`'inline'`, default) or in a row below it (`'bottom'`). */
  readonly toolbar?: ReactNode;
  readonly toolbarPlacement?: 'inline' | 'bottom' | undefined;
  /** Replaces the prompt input. */
  readonly renderComposer?: ((props: InlineAssistComposerRenderProps) => ReactNode) | undefined;
  /** Renders response text (default: plain text with line breaks). Never receives HTML; bring a Markdown renderer here. */
  readonly renderContent?: ((text: string, options: InlineAssistContentOptions) => ReactNode) | undefined;
  /** Return focus to the element focused before opening (the editor) on close. Default true. */
  readonly returnFocus?: boolean | undefined;
  readonly localeText?: InlineAssistLocaleText | undefined;
  /** Parts in the composer row, such as `InlineAssist.Dictation`. */
  readonly children?: ReactNode;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
  readonly ref?: Ref<InlineAssistApi> | undefined;
}
