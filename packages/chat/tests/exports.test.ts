// @salmonui/chat export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/chat', {
  './conversation': ['Conversation', 'ConversationHeader', 'ConversationItem', 'ConversationComposer', 'ConversationFooter', 'ConversationSuggestions', 'CONVERSATION_DEFAULT_LOCALE_TEXT'],
  './inline-assist': ['InlineAssist', 'INLINE_ASSIST_DEFAULT_LOCALE_TEXT'],
  './text-suggest': ['useTextSuggest'],
  './smart-paste': ['useSmartPaste'],
});
