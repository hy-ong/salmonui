'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/speech-to-text`: the
// recognition hook and its toggle button (renders `@salmonui/buttons/button`).
// CSS: `@salmonui/inputs/speech-to-text/styles.css` (carries the button rules).
export { useSpeechRecognition } from './speech-to-text/useSpeechRecognition.js';
export type { SpeechRecognitionApi } from './speech-to-text/useSpeechRecognition.js';
export { SpeechToTextButton, SPEECH_TO_TEXT_DEFAULT_LOCALE_TEXT } from './speech-to-text/SpeechToTextButton.js';
export type { SpeechToTextButtonProps, SpeechToTextLocaleText } from './speech-to-text/SpeechToTextButton.js';
export type {
  SpeechRecognitionError,
  SpeechRecognitionErrorCode,
  SpeechRecognitionState,
  SpeechRecognizer,
  SpeechRecognizerAlternative,
  SpeechRecognizerResult,
  SpeechRecognizerResultEvent,
  SpeechTranscriptDetails,
  UseSpeechRecognitionOptions,
} from './speech-to-text/controller.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/speech-to-text', 'salmon-speech-to-text');
