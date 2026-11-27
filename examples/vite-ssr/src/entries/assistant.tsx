// Client entry of the Conversation assistant page (assistant.html, `?assistant`).
import '@salmonui/core/styles.css';
import '@salmonui/inputs/speech-to-text/styles.css';
import '@salmonui/chat/conversation/styles.css';
import '../app.css';
import { AssistantPage } from '../Assistant.tsx';
import { hydrate } from '../hydrate.tsx';

hydrate(<AssistantPage />);
