// Locale families of @salmonui/chat (see ../locale-coverage.test.mjs).
export default {
  conversation: {
    defaults: [{ module: 'packages/chat/dist/conversation/format.js', export: 'CONVERSATION_DEFAULT_LOCALE_TEXT' }],
    // The assistant-variant text: inline English in packages/chat/src/conversation/assistant.tsx (lazy chunk).
    keys: ['dictate', 'dictationUnsupported', 'edit', 'regenerate', 'helpful', 'notHelpful', 'previousResponse', 'nextResponse', 'responseIndex', 'reasoning', 'tool', 'toolRunning', 'toolDone', 'toolError', 'responding'],
  },
  inlineAssist: { defaults: [{ module: 'packages/chat/dist/inline-assist/model.js', export: 'INLINE_ASSIST_DEFAULT_LOCALE_TEXT' }] },
  // `acceptHint`: inline English (DEFAULT_ACCEPT_HINT) in packages/chat/src/internal/suggest.ts.
  textSuggest: { keys: ['acceptHint'] },
};
