// `@salmonui/rich-text/collab`: opt-in Yjs collaboration
// for RichTextEditor and BlockEditor through the `extensions` prop. The only
// entry that may reach yjs, y-prosemirror and y-protocols. The application
// owns the Y.Doc, the provider (WebSocket, WebRTC, ...) and the server.
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { redoCommand, undoCommand, yCursorPlugin, ySyncPlugin, yUndoPlugin, prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import type { RichTextExtension } from './engine/types.js';

/** The local user as remote peers see them (cursor label and color). */
export interface CollaborationUser {
  readonly id: string;
  readonly name: string;
  /** A CSS color for the remote cursor and selection, for example `#2563eb`. */
  readonly color: string;
}

export interface CollaborationOptions {
  /** The shared document. Seed it once (see {@link seedCollaborationDoc}); the editor then renders its content. */
  readonly doc: Y.Doc;
  /** Name of the Y.XmlFragment holding the content (default `'prosemirror'`). */
  readonly fragment?: string;
  /** Presence: remote cursors and selections with the user's name and color. */
  readonly awareness?: Awareness;
  readonly user: CollaborationUser;
}

/**
 * The collaboration extension: pass it in `extensions` (keep it
 * stable, for example in `useMemo` per doc). It binds the editor to the Y.Doc
 * (`ySyncPlugin`), shows remote cursors (`yCursorPlugin`, when `awareness` is
 * given) and replaces the engine history with the per-user Yjs undo manager
 * (`yUndoPlugin`): undo and redo, their keys and the toolbar buttons revert
 * only the local user's changes. The Y.Doc is the source of truth, so do not
 * drive a collaborative editor with a controlled `value`.
 */
export function createCollaboration(options: CollaborationOptions): RichTextExtension {
  const { doc, awareness, user } = options;
  const type = doc.getXmlFragment(options.fragment ?? 'prosemirror');
  if (awareness) awareness.setLocalStateField('user', { id: user.id, name: user.name, color: user.color });
  return {
    name: 'salmonCollaboration',
    replacesHistory: true,
    history: { undo: undoCommand, redo: redoCommand },
    plugins: () => [
      ySyncPlugin(type),
      ...(awareness ? [yCursorPlugin(awareness)] : []),
      yUndoPlugin(),
    ],
  };
}

export interface CollaborationHtmlOptions {
  readonly fragment?: string;
  readonly embedHosts?: readonly string[];
}

/**
 * Seeds an empty Y.Doc with HTML (sanitized and parsed through the shared
 * schema), on the server or by the first client. Seed a doc only once: an
 * editor bound to a seeded doc renders the doc, not its own `value`. Loads
 * the engine on demand, so the `/collab` entry stays small.
 */
export async function seedCollaborationDoc(doc: Y.Doc, html: string, options: CollaborationHtmlOptions = {}): Promise<void> {
  const { createEngineSync } = await import('./engine/load.js');
  const engine = createEngineSync({ html, ...(options.embedHosts ? { embedHosts: options.embedHosts } : {}) });
  prosemirrorToYXmlFragment(engine.state.doc, doc.getXmlFragment(options.fragment ?? 'prosemirror'));
}

/** Sanitized HTML of a Y.Doc (server rendering, persistence, previews with RichTextContent). */
export async function collaborationDocToHtml(doc: Y.Doc, options: CollaborationHtmlOptions = {}): Promise<string> {
  const [{ engineSchema, serializeDoc }, { sanitizeHtml }] = await Promise.all([import('./engine/load.js'), import('./html/sanitize.js')]);
  const schema = engineSchema(options.embedHosts ? { embedHosts: options.embedHosts } : {});
  const node = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(options.fragment ?? 'prosemirror'), schema);
  return sanitizeHtml(serializeDoc(node), options.embedHosts ? { embedHosts: options.embedHosts } : {});
}
