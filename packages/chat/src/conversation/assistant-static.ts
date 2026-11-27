// Static assistant renderers (`#conversation-assistant` on the server, in
// workers and by default): the module is imported, so a server render never
// suspends and the server HTML holds the assistant markup (never a
// placeholder). The browser resolves
// assistant-lazy.ts instead.

import * as assistant from './assistant.js';
import type { AssistantModule } from './assistant-types.js';

export const loadAssistant = (): Promise<AssistantModule> => Promise.resolve(assistant);
export const readAssistant = (): AssistantModule | Promise<AssistantModule> => assistant;
