// Lazy assistant renderers (`#conversation-assistant` under the `browser`
// condition: the assistant renderers are a chunk loaded
// only for `variant="assistant"` and `Conversation.Dictation`, the
// `#scheduler-views` pattern). One `import()` and a module-level load cache:
// renders always read the same promise with `use` (which React reads
// synchronously once it settled), as `use` requires on a retry. A load cache,
// not render state.

import type { AssistantModule } from './assistant-types.js';

let promise: Promise<AssistantModule> | undefined;

/** Loads the assistant chunk once (a failed load is retried by the next call). */
export const loadAssistant = (): Promise<AssistantModule> =>
  (promise ??= import('./assistant.js').catch((error: unknown) => {
    promise = undefined;
    throw error;
  }));

/** The load promise, for `use` (the static registry returns the module). */
export const readAssistant = (): AssistantModule | Promise<AssistantModule> => loadAssistant();
