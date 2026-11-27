'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/editors/inline-edit`: InlineEdit, an in-place editor.
// Styles: `@salmonui/editors/inline-edit/styles.css`
// plus `@salmonui/buttons/button/styles.css` for the actions.
export { InlineEdit, INLINE_EDIT_DEFAULT_LOCALE_TEXT } from './inline-edit/InlineEdit.js';
export type {
  InlineEditActionsContext,
  InlineEditApi,
  InlineEditCancelEvent,
  InlineEditCancellable,
  InlineEditDraftChangeEvent,
  InlineEditEditingChangeEvent,
  InlineEditInputProps,
  InlineEditLocaleText,
  InlineEditPart,
  InlineEditProps,
  InlineEditRenderContext,
  InlineEditSaveErrorEvent,
  InlineEditSaveEvent,
  InlineEditSource,
  InlineEditStartEvent,
  InlineEditTrigger,
  InlineEditValidation,
  InlineEditValidator,
} from './inline-edit/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/editors/inline-edit', 'salmon-inline-edit');
