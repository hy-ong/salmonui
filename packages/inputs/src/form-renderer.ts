'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/form-renderer`: a form from a
// JSON Schema subset and a UI schema, rendered with the Salmon field
// families, `Form` and `Button`. CSS: `@salmonui/inputs/form-renderer/styles.css`
// (carries the rules of every family it renders).
export { FormRenderer } from './form-renderer/FormRenderer.js';
export type { FormRendererLocaleText, FormRendererProps, FormRendererSubmitDetails } from './form-renderer/FormRenderer.js';
export type { FormRendererData, FormSchema, FormSchemaProperty, FormSchemaType, FormSchemaValue, FormUiField, FormUiSchema, FormUiWidget } from './form-renderer/schema.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/form-renderer', 'salmon-form-renderer');
