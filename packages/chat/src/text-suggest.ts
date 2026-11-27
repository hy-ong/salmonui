'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/chat/text-suggest`: `useTextSuggest`,
// inline completions wired to the Inputs `TextArea` (or any native
// <textarea>) through its `ref`. CSS: `@salmonui/chat/text-suggest/styles.css`.
export { useTextSuggest } from './text-suggest/useTextSuggest.js';
export type { TextSuggest, TextSuggestOptions } from './text-suggest/useTextSuggest.js';
export type { BeforeSuggestionShowEvent, SuggestContext, SuggestFunction, SuggestionDisplay, SuggestionEvent, SuggestLocaleText } from './internal/suggest.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/chat/text-suggest', 'salmon-text-suggest');
