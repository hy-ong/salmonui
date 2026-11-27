// `@salmonui/rich-text/collab`: the extension shape, Y.Doc <->
// ProseMirror conversion with the engine schema, and two docs syncing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON, yDocToProsemirror } from 'y-prosemirror';
import { createCollaboration, seedCollaborationDoc, collaborationDocToHtml } from '@salmonui/rich-text/collab';
import { loadRichTextEngine } from '@salmonui/rich-text';

const user = { id: 'u1', name: 'Ann', color: '#2563eb' };

describe('createCollaboration', () => {
  it('returns an extension that replaces the history and binds sync, cursor and undo plugins', async () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const ext = createCollaboration({ doc, awareness, user });
    assert.equal(ext.name, 'salmonCollaboration');
    assert.equal(ext.replacesHistory, true);
    assert.equal(typeof ext.history?.undo, 'function');
    assert.equal(typeof ext.history?.redo, 'function');
    const { engineSchema } = await loadRichTextEngine();
    const plugins = await ext.plugins!({ schema: engineSchema({}), getState: () => { throw new Error('unused'); }, getView: () => null });
    const keys = plugins.map((p) => (p as unknown as { key: string }).key);
    assert.equal(plugins.length, 3);
    assert.ok(keys.some((k) => k.startsWith('y-sync')));
    assert.ok(keys.some((k) => k.startsWith('yjs-cursor')));
    assert.ok(keys.some((k) => k.startsWith('y-undo')));
    assert.deepEqual(awareness.getLocalState()?.user, { id: 'u1', name: 'Ann', color: '#2563eb' });
    const noCursor = await createCollaboration({ doc, user }).plugins!({ schema: engineSchema({}), getState: () => { throw new Error('unused'); }, getView: () => null });
    assert.equal(noCursor.length, 2);
    awareness.destroy();
  });

  it('the engine accepts it: no prosemirror-history, undo goes to the Yjs undo manager', async () => {
    const { createEngine } = await loadRichTextEngine();
    const doc = new Y.Doc();
    const engine = await createEngine({ html: '<p>x</p>', extensions: [createCollaboration({ doc, user })] });
    assert.ok(!engine.state.plugins.some((p) => (p as unknown as { key: string }).key.startsWith('history')));
    assert.ok(engine.historyCommands);
    assert.equal(engine.commands.undo(), false);
    engine.destroy();
  });
});

describe('Y.Doc conversion with the engine schema', () => {
  it('prosemirrorJSONToYDoc and yDocToProsemirrorJSON round-trip a document', async () => {
    const { createEngineSync, engineSchema } = await loadRichTextEngine();
    const engine = createEngineSync({ html: '<h2 data-block-id="h">T</h2><p><strong>b</strong> <a href="https://x.example">l</a></p><ul data-type="checklist"><li data-checked="true"><p>t</p></li></ul>' });
    const json = engine.state.doc.toJSON();
    const schema = engineSchema({});
    const ydoc = prosemirrorJSONToYDoc(schema, json);
    // Same document (attribute defaults may be written out in the JSON).
    assert.deepEqual(yDocToProsemirror(schema, ydoc).toJSON(), json);
    assert.deepEqual(schema.nodeFromJSON(yDocToProsemirrorJSON(ydoc)).toJSON(), json);
  });

  it('seedCollaborationDoc and collaborationDocToHtml go through the sanitizer and the schema', async () => {
    const doc = new Y.Doc();
    await seedCollaborationDoc(doc, '<h1>Plan</h1><p onclick="x">a <em>b</em><script>alert(1)</script></p>');
    assert.equal(await collaborationDocToHtml(doc), '<h1>Plan</h1><p>a <em>b</em></p>');
  });

  it('two docs converge through update events', async () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.on('update', (update: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(b, update, 'remote'));
    b.on('update', (update: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(a, update, 'remote'));
    await seedCollaborationDoc(a, '<p>from a</p>');
    assert.equal(await collaborationDocToHtml(b), '<p>from a</p>');
    const fragment = b.getXmlFragment('prosemirror');
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('from b')]);
    fragment.insert(fragment.length, [p]);
    assert.equal(await collaborationDocToHtml(a), '<p>from a</p><p>from b</p>');
  });
});
