import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/rich-text`: RichTextEditor,
// BlockEditor and RichTextContent on one ProseMirror engine. ProseMirror loads
// with dynamic import() after hydration; everything this entry exports
// statically is server-safe. Styles: `@salmonui/rich-text/styles.css`.
//
// Each area keeps its own barrel so the modules stay independent:
// - ./html: the server-safe HTML parser, sanitizer and paste cleanup;
// - ./blocks: the BlockEditor JSON model and its HTML serializers;
// - ./content: RichTextContent (read-only, server and client);
// - ./engine: engine-facing public types and the `extensions` API;
// - ./react: RichTextEditor and BlockEditor;
// - ./mention: the Mention target for a plain contenteditable element.
export * from './html/index.js';
export * from './blocks/index.js';
export * from './content/index.js';
export * from './engine/index.js';
export * from './react/index.js';
export * from './mention/index.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/rich-text', 'salmon-rich-text');
