// Public types of `@salmonui/chat/conversation`: the chat variant and the
// assistant variant. The adapter contract is provider-agnostic: no provider SDK
// types, and model output is text, parts and `ReactNode`, never HTML.

import type { CSSProperties, ReactNode, Ref } from 'react';
import type { LocaleMessage } from '@salmonui/core/format';
import type { SpeechRecognizer } from '@salmonui/inputs/speech-to-text';

/** Delivery status of a message. */
export type ConversationMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

/** A file attached to a message or pending in the composer. */
export interface ConversationAttachment {
  /** Stable id (the upload transport's reference, or a generated id). */
  readonly id: string;
  readonly name: string;
  /** Size in bytes. */
  readonly size?: number;
  /** MIME type. */
  readonly type?: string;
  /** Where the stored file can be opened (from the `upload` transport). */
  readonly url?: string;
  /** The picked file, when no `upload` transport stored it. */
  readonly file?: File;
}

/** Quoted preview of a reply target that is not loaded. */
export interface ConversationReplyPreview {
  readonly author: string;
  readonly text: string;
}

export interface ConversationMessage {
  /** Stable id: the list key and the store key. */
  readonly id: string;
  /** User id of the author. */
  readonly author: string;
  readonly text: string;
  readonly createdAt?: Date | string | number;
  readonly status?: ConversationMessageStatus;
  /** Id of the message this one replies to. */
  readonly replyTo?: string;
  /** Preview of the reply target when it is not in `messages`. */
  readonly replyPreview?: ConversationReplyPreview;
  readonly pinned?: boolean;
  readonly forwarded?: boolean;
  /** User ids mentioned in `text` (rendered as mention tokens). */
  readonly mentions?: readonly string[];
  readonly attachments?: readonly ConversationAttachment[];
  /** Assistant responses: reasoning and tool parts, in arrival order. */
  readonly parts?: readonly ConversationResponsePart[];
  /** Assistant responses: earlier responses to the same prompt, oldest first; `text` is the latest. */
  readonly alternatives?: readonly string[];
  /** Assistant responses: the user's rating. */
  readonly feedback?: 'positive' | 'negative';
}

/** A non-text part of an assistant response; a plain string chunk is a text delta. */
export type ConversationResponsePart =
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'reasoning'; readonly delta: string }
  | { readonly type: 'tool'; readonly id: string; readonly name: string; readonly input: unknown; readonly output?: unknown; readonly status?: 'running' | 'done' | 'error' };

/** A tool part. */
export type ConversationToolPart = Extract<ConversationResponsePart, { readonly type: 'tool' }>;

export interface ConversationUser {
  readonly id: string;
  readonly name: string;
  /** Image URL or a node; initials of `name` otherwise. */
  readonly avatar?: string | ReactNode;
  /** Presence indicator next to the avatar. */
  readonly status?: ReactNode;
}

/** What caused a change: the composer, a built-in action, a bot response or the API. */
export type ConversationChangeReason = 'send' | 'delete' | 'pin' | 'response' | 'retry' | 'regenerate' | 'feedback';

export interface ConversationChangeEvent {
  readonly reason: ConversationChangeReason;
}

export interface ConversationSendEvent {
  /** The message that is sent (cancellable in `onBeforeSend`). */
  readonly message: ConversationMessage;
}

export interface ConversationBeforeSendEvent extends ConversationSendEvent {
  /** Keeps the draft in the composer and sends nothing. */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface ConversationTypingEvent {
  readonly typing: boolean;
}

/** Built-in message actions: chat and assistant items. */
export type ConversationBuiltInAction = 'copy' | 'reply' | 'pin' | 'delete' | 'edit' | 'regenerate' | 'feedback';

export interface ConversationCustomAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

export type ConversationActionItem = ConversationBuiltInAction | ConversationCustomAction;

export interface ConversationItemActionEvent {
  /** A built-in action (`'copy'`, `'reply'`, `'pin'`, `'delete'`, `'edit'`, `'regenerate'`, `'feedback'`) or a custom item's `id`. */
  readonly action: string;
  readonly message: ConversationMessage;
  /** `'feedback'`: the rating the click sets (`undefined` clears it). */
  readonly feedback?: 'positive' | 'negative' | undefined;
  /** Cancels the built-in follow-up of a built-in action. */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface ConversationMentionUser {
  readonly id: string;
  readonly name: string;
}

/** A mention trigger of the composer, through the Dropdowns `Mention`. */
export interface ConversationMentionConfig {
  /** Trigger character, `'@'` by default. */
  readonly trigger?: string;
  readonly items: readonly ConversationMentionUser[];
}

export interface ConversationMentionSelectEvent {
  readonly user: ConversationMentionUser;
  readonly trigger: string;
}

export interface ConversationBeforeMentionSelectEvent extends ConversationMentionSelectEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** Upload transport (the Inputs `FileUpload` contract shape). */
export type ConversationUploadTransport = (
  file: File,
  context: { readonly signal: AbortSignal; readonly onProgress: (loaded: number, total: number) => void },
) => Promise<Partial<ConversationAttachment> | void>;

export interface ConversationAttachmentOptions {
  /** The file input's `accept`. */
  readonly accept?: string;
  /** Largest accepted file in bytes. */
  readonly maxSize?: number;
  /** Most files per message. */
  readonly maxCount?: number;
  /** Where dropped files are accepted (default `'composer'`; `'none'` disables drag and drop). */
  readonly dropTarget?: 'composer' | 'conversation' | 'none';
  /** Stores a file before sending; without it, attachments carry the `File`. */
  readonly upload?: ConversationUploadTransport;
  /** Chip of a pending attachment in the composer. */
  readonly renderPreview?: (context: { readonly attachment: ConversationAttachment; readonly progress: number | null; readonly error: unknown; readonly remove: () => void }) => ReactNode;
}

export interface ConversationBeforeAttachEvent {
  readonly files: readonly File[];
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface ConversationAttachEvent {
  readonly attachments: readonly ConversationAttachment[];
}

export interface ConversationAttachmentEvent {
  readonly attachment: ConversationAttachment;
  /** The message that carries it; null for a pending composer attachment. */
  readonly message: ConversationMessage | null;
}

/** A rejected file (too large, too many, wrong type) or a failed upload. */
export interface ConversationAttachmentError {
  readonly file: File;
  readonly reason: 'size' | 'count' | 'type' | 'upload';
  readonly error?: unknown;
}

/**
 * Bot and assistant replies: a Promise is one final
 * response, an AsyncIterable streams text chunks and response parts. The
 * `signal` aborts on Stop, `api.stop()`, a new send and unmount.
 */
export type ConversationAdapter = (
  request: ConversationRequest,
  context: { readonly signal: AbortSignal },
) => Promise<string> | AsyncIterable<string | ConversationResponsePart>;

export interface ConversationRequest {
  /** History including the new message. */
  readonly messages: readonly ConversationMessage[];
  readonly text: string;
  readonly attachments: readonly ConversationAttachment[];
}

export interface ConversationLocaleText {
  readonly feedLabel: LocaleMessage;
  readonly composerLabel: LocaleMessage;
  readonly placeholder: LocaleMessage;
  readonly send: LocaleMessage;
  readonly stop: LocaleMessage;
  readonly attach: LocaleMessage;
  readonly removeAttachment: LocaleMessage;
  readonly jumpToLatest: LocaleMessage;
  readonly unread: LocaleMessage;
  readonly typingOne: LocaleMessage;
  readonly typingTwo: LocaleMessage;
  readonly typingMany: LocaleMessage;
  readonly newMessage: LocaleMessage;
  readonly responseComplete: LocaleMessage;
  readonly messageActions: LocaleMessage;
  readonly copy: LocaleMessage;
  readonly reply: LocaleMessage;
  readonly pin: LocaleMessage;
  readonly unpin: LocaleMessage;
  readonly delete: LocaleMessage;
  readonly replyingTo: LocaleMessage;
  readonly cancelReply: LocaleMessage;
  readonly pinned: LocaleMessage;
  readonly forwarded: LocaleMessage;
  readonly status_sending: LocaleMessage;
  readonly status_sent: LocaleMessage;
  readonly status_delivered: LocaleMessage;
  readonly status_read: LocaleMessage;
  readonly status_error: LocaleMessage;
  readonly retry: LocaleMessage;
  readonly loadingOlder: LocaleMessage;
  readonly suggestionsLabel: LocaleMessage;
  /** Composer clear button. */
  readonly clear: LocaleMessage;
  // Assistant variant and `Conversation.Dictation`; defaults live in the assistant chunk (see the docs page).
  /** `Conversation.Dictation` button. */
  readonly dictate?: LocaleMessage;
  /** `Conversation.Dictation` without speech recognition in the browser. */
  readonly dictationUnsupported?: LocaleMessage;
  readonly edit?: LocaleMessage;
  readonly regenerate?: LocaleMessage;
  readonly helpful?: LocaleMessage;
  readonly notHelpful?: LocaleMessage;
  readonly previousResponse?: LocaleMessage;
  readonly nextResponse?: LocaleMessage;
  /** `{index}` of `{count}` responses. */
  readonly responseIndex?: LocaleMessage;
  readonly reasoning?: LocaleMessage;
  /** Tool part heading: `{name}`, `{status}`. */
  readonly tool?: LocaleMessage;
  readonly toolRunning?: LocaleMessage;
  readonly toolDone?: LocaleMessage;
  readonly toolError?: LocaleMessage;
  /** Pending response (screen readers). */
  readonly responding?: LocaleMessage;
}

export interface ConversationItemRenderContext {
  readonly message: ConversationMessage;
  readonly index: number;
  /** The default item content; wrap or decorate it. */
  readonly defaultItem: ReactNode;
}

export interface ConversationApi {
  /** Scrolls to the latest message. */
  scrollToBottom(options?: { readonly behavior?: ScrollBehavior }): void;
  /** Scrolls a message into view (mounted or virtualized) and returns whether it exists. */
  scrollToMessage(id: string, options?: { readonly focus?: boolean }): boolean;
  /** Focuses the composer input. */
  focus(): void;
  /** Sends `text` as the current user (runs `onBeforeSend` and the adapter). */
  send(text: string): void;
  /** Aborts a pending adapter response. */
  stop(): void;
  /** Assistant variant: runs the adapter again for response `id` and keeps the previous text as an alternative. */
  regenerate(id: string): void;
  /** The root element. */
  readonly element: HTMLDivElement | null;
}

export type ConversationPart = 'root' | 'scroller' | 'feed' | 'item' | 'composer' | 'typing';

/** Context of `renderContent`. */
export interface ConversationContentContext {
  readonly message: ConversationMessage;
  /** The text is still streaming (called once per animation frame). */
  readonly streaming: boolean;
}

export interface ConversationProps {
  /** `'chat'` (people, default) or `'assistant'` (prompts and responses). */
  readonly variant?: 'chat' | 'assistant';
  readonly messages?: readonly ConversationMessage[];
  readonly defaultMessages?: readonly ConversationMessage[];
  readonly onMessagesChange?: (messages: readonly ConversationMessage[], event: ConversationChangeEvent) => void;
  /** User id of the person using the UI; their items align to the inline end (default `'user'`). */
  readonly currentUser?: string;
  readonly users?: readonly ConversationUser[];
  /** User ids typing right now. */
  readonly typingUsers?: readonly string[];
  readonly onBeforeSend?: (event: ConversationBeforeSendEvent) => void;
  readonly onSend?: (event: ConversationSendEvent) => void;
  /** Bot replies: runs after each send; streamed text is flushed once per animation frame. */
  readonly adapter?: ConversationAdapter;
  /** Author id of adapter responses (default `'assistant'`). */
  readonly adapterAuthor?: string;
  readonly onError?: (error: unknown) => void;
  /** Stop, `api.stop()`, a new send or regenerate aborted a pending response. */
  readonly onStop?: (event: { readonly message: ConversationMessage | undefined }) => void;
  /**
   * Message text renderer, for example the application's Markdown
   * renderer; default plain text with preserved line breaks. Never HTML
   * strings: return React nodes.
   */
  readonly renderContent?: (text: string, context: ConversationContentContext) => ReactNode;
  /** Assistant: the pending response before the first chunk (default skeleton lines). */
  readonly renderPending?: (context: { readonly message: ConversationMessage }) => ReactNode;
  /** Assistant: a reasoning part (default a collapsed disclosure). */
  readonly renderReasoning?: (context: { readonly text: string; readonly message: ConversationMessage; readonly streaming: boolean }) => ReactNode;
  /** Replaces the chip of a sent attachment; `tabIndex` keeps the item's roving tab stop on interactive content. */
  readonly renderAttachment?: (context: { readonly attachment: ConversationAttachment; readonly message: ConversationMessage; readonly tabIndex: 0 | -1 }) => ReactNode;
  /** Assistant: tool part renderers by tool name; others use the default summary. */
  readonly renderTool?: Readonly<Record<string, (context: { readonly part: ConversationToolPart; readonly message: ConversationMessage }) => ReactNode>>;
  /** Assistant: the default reasoning disclosure opened or closed. */
  readonly onReasoningClick?: (event: { readonly message: ConversationMessage; readonly open: boolean }) => void;
  /** Retry of a message with `status: 'error'`. */
  readonly onRetry?: (event: { readonly message: ConversationMessage }) => void;
  /** Composer typing start and stop, at most one of each per burst. */
  readonly onTypingChange?: (event: ConversationTypingEvent) => void;
  /** Idle time in ms after which typing stops (default 3000). */
  readonly typingTimeout?: number;
  /** Show timestamps (default true). */
  readonly timestamps?: boolean;
  /** `Intl.DateTimeFormatOptions` or a formatter (default hour and minute). */
  readonly formatTimestamp?: Intl.DateTimeFormatOptions | ((date: Date, context: { readonly locale: string; readonly timeZone: string | undefined }) => string);
  /** BCP 47 locale of timestamps (default `'en-US'`). */
  readonly locale?: string;
  /** IANA time zone; without it, times render in UTC on the server and switch to the host zone after hydration. */
  readonly timeZone?: string;
  /** Date separators between days (default false). */
  readonly dateSeparators?: boolean;
  readonly renderDateSeparator?: (context: { readonly date: Date; readonly label: string }) => ReactNode;
  /** `'bubbles'` (default: own messages at the inline end) or `'compact'` (all at the start). */
  readonly layout?: 'bubbles' | 'compact';
  readonly renderEmpty?: () => ReactNode;
  readonly renderItem?: (context: ConversationItemRenderContext) => ReactNode;
  readonly renderAvatar?: (context: { readonly user: ConversationUser | undefined; readonly id: string }) => ReactNode;
  readonly renderTyping?: (context: { readonly users: readonly ConversationUser[] }) => ReactNode;
  /**
   * Actions of every item (chat default copy, reply, pin, delete); `false`
   * hides them. Assistant default: copy, regenerate, feedback on responses;
   * edit, copy on prompts (an object sets each).
   */
  readonly itemActions?: readonly ConversationActionItem[] | { readonly prompt?: readonly ConversationActionItem[]; readonly response?: readonly ConversationActionItem[] } | false;
  readonly onItemActionClick?: (event: ConversationItemActionEvent) => void;
  readonly onAttachmentClick?: (event: ConversationAttachmentEvent) => void;
  /** Older history exists (load on demand). */
  readonly hasOlder?: boolean;
  /** Loads older messages; the app prepends them to `messages`. */
  readonly onLoadOlder?: () => Promise<unknown> | void;
  /** `'whenAtBottom'` (default), `'always'` or `'never'`. */
  readonly autoScroll?: 'whenAtBottom' | 'always' | 'never';
  /** Render the default jump-to-latest button (default true). */
  readonly jumpButton?: boolean;
  /** Estimated item height in px before measurement (default 64). */
  readonly estimatedItemHeight?: number;
  /** Items rendered on the server and before measurement (default 30). */
  readonly initialItemCount?: number;
  readonly localeText?: Partial<ConversationLocaleText>;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly classNames?: Partial<Record<ConversationPart, string>>;
  readonly styles?: Partial<Record<ConversationPart, CSSProperties>>;
  /** Parts: `Conversation.Header`, `.Suggestions`, `.Composer`, `.Footer`, `.JumpButton`. */
  readonly children?: ReactNode;
  readonly ref?: Ref<ConversationApi>;
}

export interface ConversationHeaderProps {
  readonly title?: ReactNode;
  readonly icon?: ReactNode;
  /** Toolbar items (buttons); arrow keys move between them (APG Toolbar). */
  readonly children?: ReactNode;
  /** Accessible name of the toolbar (default the title text). */
  readonly toolbarLabel?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export interface ConversationComposerProps {
  readonly placeholder?: string;
  /** Controlled draft. */
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /** Shows a clear button while there is a draft. */
  readonly clearable?: boolean;
  readonly disabled?: boolean;
  /** Visible rows of the textarea (default 1; it grows with content). */
  readonly rows?: number;
  readonly mentions?: readonly ConversationMentionConfig[];
  readonly onBeforeMentionSelect?: (event: ConversationBeforeMentionSelectEvent) => void;
  readonly onMentionSelect?: (event: ConversationMentionSelectEvent) => void;
  /** Enables attachments (`true` for defaults). */
  readonly attachments?: boolean | ConversationAttachmentOptions;
  readonly onBeforeAttach?: (event: ConversationBeforeAttachEvent) => void;
  readonly onAttach?: (event: ConversationAttachEvent) => void;
  readonly onAttachmentRemove?: (event: ConversationAttachmentEvent) => void;
  readonly onAttachmentError?: (error: ConversationAttachmentError) => void;
  /** Extra controls next to the send button. */
  readonly toolbar?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export interface ConversationSuggestionsProps {
  readonly items: readonly string[];
  readonly heading?: ReactNode;
  readonly renderItem?: (context: { readonly item: string; readonly index: number }) => ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export interface ConversationItemProps {
  readonly message: ConversationMessage;
  /** Replaces the message text in the bubble. */
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export interface ConversationItemActionsProps {
  readonly message: ConversationMessage;
  readonly items?: readonly ConversationActionItem[];
  readonly className?: string;
}

export interface ConversationJumpButtonProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** `Conversation.Dictation`: a microphone button over the Inputs `useSpeechRecognition`. */
export interface ConversationDictationProps {
  /** BCP 47 recognition language (default the document language). */
  readonly lang?: string;
  /** Replaces the browser recognizer (the Inputs `SpeechRecognizer` contract). */
  readonly recognizer?: () => SpeechRecognizer;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export interface ConversationFooterProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}
