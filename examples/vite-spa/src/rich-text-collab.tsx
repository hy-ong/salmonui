// Collaboration browser page (tests/browser/rich-text-collab.spec.ts):
// two editors, each on its own Y.Doc and Awareness, connected in-page by update events
// (the stand-in for a provider such as y-websocket).
//
//   ?block   two BlockEditors instead of two RichTextEditors
//
// window.__collab exposes { docs, html() } for the spec.
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import '@salmonui/core/styles.css';
import '@salmonui/rich-text/styles.css';
import { BlockEditor, RichTextEditor, type RichTextExtension } from '@salmonui/rich-text';
import { createCollaboration, collaborationDocToHtml } from '@salmonui/rich-text/collab';

const params = new URLSearchParams(location.search);
const block = params.has('block');

interface Peer {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly extension: RichTextExtension;
}

function peers(): [Peer, Peer] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  // Seed: one paragraph (seedCollaborationDoc does the same from HTML, asynchronously).
  const p = new Y.XmlElement('paragraph');
  if (block) p.setAttribute('blockId', 'p1');
  p.insert(0, [new Y.XmlText('Shared text')]);
  a.getXmlFragment('prosemirror').insert(0, [p]);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'peer' && Y.applyUpdate(b, u, 'peer'));
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'peer' && Y.applyUpdate(a, u, 'peer'));
  const wa = new Awareness(a);
  const wb = new Awareness(b);
  wa.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin !== 'peer') applyAwarenessUpdate(wb, encodeAwarenessUpdate(wa, [...added, ...updated, ...removed]), 'peer');
  });
  wb.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin !== 'peer') applyAwarenessUpdate(wa, encodeAwarenessUpdate(wb, [...added, ...updated, ...removed]), 'peer');
  });
  return [
    { doc: a, awareness: wa, extension: createCollaboration({ doc: a, awareness: wa, user: { id: 'ann', name: 'Ann', color: '#2563eb' } }) },
    { doc: b, awareness: wb, extension: createCollaboration({ doc: b, awareness: wb, user: { id: 'bob', name: 'Bob', color: '#db2777' } }) },
  ];
}

function Page(): ReactNode {
  const [[a, b]] = useState(peers);
  (window as unknown as { __collab: unknown }).__collab = { html: () => Promise.all([collaborationDocToHtml(a.doc), collaborationDocToHtml(b.doc)]) };
  const [extA] = useState(() => [a.extension]);
  const [extB] = useState(() => [b.extension]);
  return (
    <main style={{ padding: 24, display: 'grid', gap: 24, gridTemplateColumns: '1fr 1fr' }} data-salmon-a11y-root="">
      <h1 style={{ gridColumn: '1 / -1' }}>Collaboration</h1>
      {block ? (
        <>
          <BlockEditor className="peer-a" aria-label="Ann's editor" extensions={extA} />
          <BlockEditor className="peer-b" aria-label="Bob's editor" extensions={extB} />
        </>
      ) : (
        <>
          <RichTextEditor className="peer-a" aria-label="Ann's editor" extensions={extA} />
          <RichTextEditor className="peer-b" aria-label="Bob's editor" extensions={extB} />
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
