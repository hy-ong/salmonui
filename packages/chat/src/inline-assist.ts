'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/chat/inline-assist`: InlineAssist, its
// Dictation part and types. Render-safe: the assist renders nothing on the
// server (it opens on the client); browser APIs only in effects and event
// handlers. CSS: `@salmonui/chat/inline-assist/styles.css` (carries the
// Button, Menu and SpeechToText rules it composes).
export { InlineAssist, InlineAssistDictation } from './inline-assist/InlineAssist.js';
export type { InlineAssistDictationProps } from './inline-assist/InlineAssist.js';
export { INLINE_ASSIST_DEFAULT_LOCALE_TEXT } from './inline-assist/model.js';
export type {
  InlineAssistAcceptEvent,
  InlineAssistAdapter,
  InlineAssistAnchor,
  InlineAssistApi,
  InlineAssistBeforeSendEvent,
  InlineAssistBuiltInAction,
  InlineAssistCommand,
  InlineAssistCommandSelectEvent,
  InlineAssistComposerRenderProps,
  InlineAssistContentOptions,
  InlineAssistCustomAction,
  InlineAssistDiscardEvent,
  InlineAssistInputProps,
  InlineAssistLocaleText,
  InlineAssistMessage,
  InlineAssistMessagesChangeEvent,
  InlineAssistMode,
  InlineAssistOpenChangeEvent,
  InlineAssistOpenChangeReason,
  InlineAssistPoint,
  InlineAssistProps,
  InlineAssistRequest,
  InlineAssistResponseAction,
  InlineAssistResponseActionEvent,
  InlineAssistResponsePart,
  InlineAssistSendEvent,
} from './inline-assist/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/chat/inline-assist', 'salmon-inline-assist');
