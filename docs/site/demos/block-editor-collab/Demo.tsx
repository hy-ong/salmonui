'use client';

import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { BlockEditor, RichTextContent, type RichTextExtension } from '@salmonui/rich-text';
import { collaborationDocToHtml, createCollaboration, seedCollaborationDoc } from '@salmonui/rich-text/collab';
import '@salmonui/rich-text/styles.css';
import { Button } from '@salmonui/buttons/button';

interface Peer {
  readonly name: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly extensions: readonly RichTextExtension[];
}

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

const SEED =
  '<h2 data-block-id="title">Shared agenda</h2>' +
  '<p data-block-id="p1">Both editors edit one Yjs document. Type here and watch the other side.</p>' +
  '<ul data-type="checklist"><li data-checked="false" data-block-id="c1"><p>Pick a launch date</p></li></ul>';

/**
 * Two peers in one page, each with its own Y.Doc and Awareness, connected by update events.
 * A real application connects one Y.Doc to its server with a provider (y-websocket, WebRTC, ...).
 */
async function connect(): Promise<[Peer, Peer]> {
  const a = new Y.Doc();
  const b = new Y.Doc();
  await seedCollaborationDoc(a, SEED);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  a.on('update', (update: Uint8Array, origin: unknown) => origin !== 'peer' && Y.applyUpdate(b, update, 'peer'));
  b.on('update', (update: Uint8Array, origin: unknown) => origin !== 'peer' && Y.applyUpdate(a, update, 'peer'));
  const wa = new Awareness(a);
  const wb = new Awareness(b);
  wa.on('update', ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    if (origin !== 'peer') applyAwarenessUpdate(wb, encodeAwarenessUpdate(wa, [...added, ...updated, ...removed]), 'peer');
  });
  wb.on('update', ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    if (origin !== 'peer') applyAwarenessUpdate(wa, encodeAwarenessUpdate(wb, [...added, ...updated, ...removed]), 'peer');
  });
  return [
    { name: 'Ana', doc: a, awareness: wa, extensions: [createCollaboration({ doc: a, awareness: wa, user: { id: 'ana', name: 'Ana', color: '#2563eb' } })] },
    { name: 'Ben', doc: b, awareness: wb, extensions: [createCollaboration({ doc: b, awareness: wb, user: { id: 'ben', name: 'Ben', color: '#db2777' } })] },
  ];
}

export default function BlockEditorCollabDemo() {
  // Yjs documents and awareness timers exist only in the browser: the server renders the loading state.
  const [peers, setPeers] = useState<[Peer, Peer] | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let created: [Peer, Peer] | null = null;
    const destroy = (pair: [Peer, Peer]) => {
      for (const peer of pair) {
        peer.awareness.destroy();
        peer.doc.destroy();
      }
    };
    void connect().then((pair) => {
      created = pair;
      if (live) setPeers(pair);
      else destroy(pair);
    });
    return () => {
      live = false;
      if (created) destroy(created);
    };
  }, []);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {peers ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {peers.map((peer) => (
            <section key={peer.name} aria-label={`${peer.name}'s editor`} style={{ display: 'grid', alignContent: 'start', gap: 8, padding: 12, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)', background: 'var(--salmon-surface-base)' }}>
              <strong>{peer.name}</strong>
              <BlockEditor aria-label={`${peer.name}'s document`} extensions={peer.extensions} style={{ minBlockSize: 160 }} />
            </section>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <p role="status" style={{ margin: 0 }}>
            Connecting the two editors…
          </p>
          <RichTextContent value={SEED} aria-label="Shared agenda (loading)" />
        </div>
      )}
      <div>
        <Button variant="outline" type="button" disabled={!peers} onClick={() => peers && void collaborationDocToHtml(peers[0].doc).then(setHtml)}>
          collaborationDocToHtml(doc)
        </Button>
      </div>
      {html === null ? null : <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{html}</pre>}
    </div>
  );
}
