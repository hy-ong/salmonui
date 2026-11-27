'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/chat/conversation`: Conversation (chat and assistant variants)
// and its parts. The assistant renderers are a chunk
// loaded only for `variant="assistant"`. Styles:
// `@salmonui/chat/conversation/styles.css` (self-contained: it includes the
// Mention popup rules the composer uses).
import { ConversationRoot } from './conversation/Conversation.js';
import { ConversationItem, ConversationItemActions } from './conversation/Item.js';
import { ConversationComposer, ConversationDictation, ConversationFooter, ConversationHeader, ConversationJumpButton, ConversationSuggestions } from './conversation/parts.js';

/** `<Conversation variant="chat" | "assistant">` with its parts as static members (also exported flat). */
export const Conversation: typeof ConversationRoot & {
  readonly Header: typeof ConversationHeader;
  readonly Item: typeof ConversationItem;
  readonly ItemActions: typeof ConversationItemActions;
  readonly Suggestions: typeof ConversationSuggestions;
  readonly Composer: typeof ConversationComposer;
  readonly Dictation: typeof ConversationDictation;
  readonly JumpButton: typeof ConversationJumpButton;
  readonly Footer: typeof ConversationFooter;
} = Object.assign(ConversationRoot, {
  Header: ConversationHeader,
  Item: ConversationItem,
  ItemActions: ConversationItemActions,
  Suggestions: ConversationSuggestions,
  Composer: ConversationComposer,
  Dictation: ConversationDictation,
  JumpButton: ConversationJumpButton,
  Footer: ConversationFooter,
});

export { ConversationComposer, ConversationDictation, ConversationFooter, ConversationHeader, ConversationItem, ConversationItemActions, ConversationJumpButton, ConversationSuggestions };
export { CONVERSATION_DEFAULT_LOCALE_TEXT } from './conversation/format.js';
export type {
  ConversationActionItem,
  ConversationAdapter,
  ConversationApi,
  ConversationAttachEvent,
  ConversationAttachment,
  ConversationAttachmentError,
  ConversationAttachmentEvent,
  ConversationAttachmentOptions,
  ConversationBeforeAttachEvent,
  ConversationBeforeMentionSelectEvent,
  ConversationBeforeSendEvent,
  ConversationBuiltInAction,
  ConversationChangeEvent,
  ConversationChangeReason,
  ConversationComposerProps,
  ConversationContentContext,
  ConversationCustomAction,
  ConversationDictationProps,
  ConversationFooterProps,
  ConversationHeaderProps,
  ConversationItemActionEvent,
  ConversationItemActionsProps,
  ConversationItemProps,
  ConversationItemRenderContext,
  ConversationJumpButtonProps,
  ConversationLocaleText,
  ConversationMentionConfig,
  ConversationMentionSelectEvent,
  ConversationMentionUser,
  ConversationMessage,
  ConversationMessageStatus,
  ConversationPart,
  ConversationProps,
  ConversationReplyPreview,
  ConversationRequest,
  ConversationResponsePart,
  ConversationSendEvent,
  ConversationSuggestionsProps,
  ConversationToolPart,
  ConversationTypingEvent,
  ConversationUploadTransport,
  ConversationUser,
} from './conversation/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/chat/conversation', 'salmon-conversation');
