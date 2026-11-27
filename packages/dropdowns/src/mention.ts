import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/dropdowns/mention`: Mention over a <textarea>, an <input> or a contenteditable target.
// Styles: `@salmonui/dropdowns/mention/styles.css`.
export { Mention, MENTION_DEFAULT_LOCALE_TEXT } from './mention/Mention.js';
export type {
  MentionBeforeInsertEvent,
  MentionData,
  MentionDataSource,
  MentionEditorInsertion,
  MentionEditorTarget,
  MentionEventSource,
  MentionInsertEvent,
  MentionItem,
  MentionLocaleText,
  MentionOpenChangeEvent,
  MentionOpenChangeReason,
  MentionPart,
  MentionProps,
  MentionRenderItemContext,
  MentionSearchChangeEvent,
  MentionSearchOperator,
  MentionTrigger,
} from './mention/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/dropdowns/mention', 'salmon-mention');
