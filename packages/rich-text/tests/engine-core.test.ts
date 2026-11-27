// Headless engine in Node without a DOM: schema round trip, the
// always-on sanitizer, commands over transactions, history, maxLength, find
// and replace, format painter and the extension API.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEngine, createEngineSync, DEFAULT_KEY_BINDINGS, toolbarState } from '../dist/engine/load.js';
import { loadRichTextEngine } from '@salmonui/rich-text';

const VOCAB =
  '<h2 style="text-align:center">Title</h2>' +
  '<p style="line-height:1.5" data-indent="2">Hello <strong>bold <em>both</em></strong> <u>u</u> <s>s</s> <sub>2</sub><sup>3</sup> <code>c</code> ' +
  '<a href="https://x.dev" title="X" target="_blank" rel="noopener noreferrer">link</a> <span style="color:#ff0000">red</span>' +
  '<span style="background-color:#ffff00">bg</span><span style="font-family:Georgia, serif">f</span><span style="font-size:18pt">z</span></p>' +
  '<blockquote><p>q</p></blockquote><hr><pre><code class="language-js">let a = 1;</code></pre>' +
  '<ul style="list-style-type:square"><li><p>a</p></li></ul><ol start="3" style="list-style-type:lower-roman"><li><p>b</p></li></ol>' +
  '<ul data-type="checklist"><li data-checked="true"><p>done</p></li><li data-checked="false"><p>todo</p></li></ul>' +
  '<figure><img src="https://x.dev/a.png" alt="A" width="10" height="20"><figcaption>Cap</figcaption></figure>' +
  '<audio controls src="https://x.dev/a.mp3"></audio><video controls src="https://x.dev/v.mp4" width="320" height="180"></video>' +
  '<table class="salmon-rich-text-table--bordered"><tbody><tr><th><p>H</p></th><th colspan="2"><p>H2</p></th></tr><tr><td data-colwidth="120"><p>c</p></td><td><p>d</p></td><td><p>e</p></td></tr></tbody></table>' +
  '<div data-type="callout" data-tone="warning"><p>careful</p></div>' +
  '<details open><summary>More</summary><p>body</p></details>' +
  '<p><span data-type="mention" data-id="42" data-trigger="@">@Alice</span> <span data-type="label" data-id="bug" data-trigger="#" data-tone="info">#bug</span> x<br>y <img src="https://x.dev/i.png" alt="i"></p>';

describe('headless engine', () => {
  it('round-trips the whole HTML vocabulary through the schema in Node', () => {
    const engine = createEngineSync({ html: VOCAB });
    assert.equal(engine.getHtml(), VOCAB);
  });

  it('is reached through loadRichTextEngine() from the root entry, which loads no ProseMirror itself', async () => {
    const mod = await loadRichTextEngine();
    assert.equal(mod.createEngineSync, createEngineSync);
  });

  it('sanitizes value in: scripts, handlers, javascript: URLs and unknown tags never reach the document', () => {
    const engine = createEngineSync({
      html: '<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="x" onerror="alert(1)"><iframe src="https://evil.example/x"></iframe><font color="red">t</font></p>',
    });
    const html = engine.getHtml();
    assert.doesNotMatch(html, /script|onclick|onerror|javascript|iframe|<font/);
    assert.equal(html, '<p>Hi bad<img src="x" alt=""><span style="color:red">t</span></p>');
  });

  it('keeps embeds only from embedHosts', () => {
    const src = '<iframe src="https://www.youtube-nocookie.com/embed/1" width="560" height="315"></iframe>';
    assert.equal(createEngineSync({ html: src }).getHtml(), '');
    assert.equal(createEngineSync({ html: src, embedHosts: ['www.youtube-nocookie.com'] }).getHtml(), '<iframe src="https://www.youtube-nocookie.com/embed/1" width="560" height="315" allowfullscreen></iframe>');
  });

  it('getHtml({ xhtml: true }) self-closes void tags and getText joins blocks', () => {
    const engine = createEngineSync({ html: '<p>a<br>b <img src="https://x.dev/i.png" alt="i"></p><hr><p><span data-type="mention" data-id="1" data-trigger="@">@Ann</span></p>' });
    assert.equal(engine.getHtml({ xhtml: true }), '<p>a<br />b <img src="https://x.dev/i.png" alt="i" /></p><hr /><p><span data-type="mention" data-id="1" data-trigger="@">@Ann</span></p>');
    assert.equal(engine.getText(), 'a\nb \n@Ann');
    assert.equal(createEngineSync({ html: '' }).getHtml(), '');
  });

  it('setHtml replaces the document without a history entry by default', () => {
    const engine = createEngineSync({ html: '<p>a</p>' });
    engine.setHtml('<p>b</p>');
    assert.equal(engine.getHtml(), '<p>b</p>');
    assert.equal(engine.commands.undo(), false);
    engine.setHtml('<p>c</p>', { addToHistory: true });
    assert.equal(engine.commands.undo(), true);
    assert.equal(engine.getHtml(), '<p>b</p>');
  });
});

describe('text formatting commands', () => {
  it('toggles every mark over a selection', () => {
    const engine = createEngineSync({ html: '<p>Hello world</p>' });
    engine.setSelection(1, 6);
    for (const name of ['bold', 'italic', 'underline', 'strike', 'superscript', 'code'] as const) assert.equal(engine.commands[name](), true);
    assert.equal(engine.getHtml(), '<p><strong><em><u><s><sup><code>Hello</code></sup></s></u></em></strong> world</p>');
    engine.commands.subscript();
    assert.match(engine.getHtml(), /<sub><code>Hello<\/code><\/sub>/);
    assert.doesNotMatch(engine.getHtml(), /<sup>/);
    engine.commands.bold();
    assert.doesNotMatch(engine.getHtml(), /strong/);
    assert.equal(toolbarState(engine).marks.italic, true);
    assert.equal(toolbarState(engine).marks.bold, false);
  });

  it('style marks, uppercase and lowercase', () => {
    const engine = createEngineSync({ html: '<p>Hello world</p>' });
    engine.setSelection(1, 6);
    engine.commands.color('#ff0000');
    engine.commands.backgroundColor('yellow');
    engine.commands.fontFamily('Georgia, serif');
    engine.commands.fontSize('14pt');
    assert.equal(toolbarState(engine).color, '#ff0000');
    assert.equal(toolbarState(engine).fontSize, '14pt');
    assert.equal(
      engine.getHtml(),
      '<p><span style="font-family:Georgia, serif"><span style="font-size:14pt"><span style="color:#ff0000"><span style="background-color:yellow">Hello</span></span></span></span> world</p>',
    );
    engine.commands.color(null);
    assert.doesNotMatch(engine.getHtml(), /color:#ff0000/);
    engine.setSelection(7, 12);
    engine.commands.uppercase();
    assert.match(engine.getHtml(), /WORLD<\/p>$/);
    engine.commands.lowercase();
    assert.match(engine.getHtml(), /world<\/p>$/);
  });

  it('the default key table binds the standard shortcuts', () => {
    assert.equal(DEFAULT_KEY_BINDINGS['Mod-b'], 'bold');
    assert.equal(DEFAULT_KEY_BINDINGS['Mod-i'], 'italic');
    assert.equal(DEFAULT_KEY_BINDINGS['Mod-u'], 'underline');
    assert.equal(DEFAULT_KEY_BINDINGS['Mod-z'], 'undo');
    assert.equal(DEFAULT_KEY_BINDINGS['Mod-y'], 'redo');
    assert.equal(DEFAULT_KEY_BINDINGS['Mod-Shift-z'], 'redo');
    assert.equal(DEFAULT_KEY_BINDINGS['Mod-k'], 'link');
    assert.ok(Object.isFrozen(DEFAULT_KEY_BINDINGS));
  });
});

describe('paragraph formatting commands', () => {
  it('headings, alignment, line height, indent, quote, rule and clear format', () => {
    const engine = createEngineSync({ html: '<p>One</p><p>Two</p>' });
    engine.setSelection(2);
    engine.commands.heading(2);
    engine.commands.textAlign('center');
    engine.commands.lineHeight('2');
    assert.equal(engine.getHtml(), '<h2 style="text-align:center;line-height:2">One</h2><p>Two</p>');
    assert.equal(toolbarState(engine).block, 'h2');
    engine.commands.heading(2);
    assert.equal(engine.getHtml(), '<p style="text-align:center;line-height:2">One</p><p>Two</p>');
    engine.setSelection(7);
    engine.commands.indent();
    engine.commands.indent();
    assert.match(engine.getHtml(), /<p data-indent="2">Two<\/p>$/);
    engine.commands.outdent();
    assert.match(engine.getHtml(), /<p data-indent="1">Two<\/p>$/);
    engine.commands.blockquote();
    assert.match(engine.getHtml(), /<blockquote><p data-indent="1">Two<\/p><\/blockquote>$/);
    assert.equal(toolbarState(engine).block, 'blockquote');
    engine.commands.blockquote();
    assert.doesNotMatch(engine.getHtml(), /blockquote/);
    engine.setSelection(0, engine.state.doc.content.size);
    engine.commands.clearFormat();
    assert.equal(engine.getHtml(), '<p>One</p><p>Two</p>');
    engine.setSelection(4);
    engine.commands.horizontalRule();
    assert.match(engine.getHtml(), /<hr>/);
  });

  it('bulleted, numbered and checklists with styles, nesting and switching', () => {
    const engine = createEngineSync({ html: '<p>a</p><p>b</p>' });
    engine.setSelection(1, 5);
    engine.commands.bulletList('square');
    assert.equal(engine.getHtml(), '<ul style="list-style-type:square"><li><p>a</p></li><li><p>b</p></li></ul>');
    assert.equal(toolbarState(engine).list, 'bullet');
    engine.commands.orderedList('upper-alpha');
    assert.equal(engine.getHtml(), '<ol style="list-style-type:upper-alpha"><li><p>a</p></li><li><p>b</p></li></ol>');
    engine.setSelection(8);
    engine.commands.indent();
    assert.equal(engine.getHtml(), '<ol style="list-style-type:upper-alpha"><li><p>a</p><ol><li><p>b</p></li></ol></li></ol>');
    engine.commands.outdent();
    engine.setSelection(1, 8);
    engine.commands.taskList();
    assert.equal(engine.getHtml(), '<ul data-type="checklist"><li data-checked="false"><p>a</p></li><li data-checked="false"><p>b</p></li></ul>');
    engine.setSelection(3);
    engine.commands.toggleTask();
    assert.match(engine.getHtml(), /^<ul data-type="checklist"><li data-checked="true"><p>a<\/p>/);
    engine.setSelection(1, 8);
    engine.commands.taskList();
    assert.equal(engine.getHtml(), '<p>a</p><p>b</p>');
  });
});

describe('links, images, media and tables', () => {
  it('sets, edits and removes links; unsafe URLs are refused', () => {
    const engine = createEngineSync({ html: '<p>Read the docs</p>' });
    engine.setSelection(10, 14);
    assert.equal(engine.commands.setLink({ href: 'javascript:alert(1)' }), false);
    assert.equal(engine.commands.setLink({ href: 'https://x.dev', target: '_blank', title: 'X' }), true);
    assert.equal(engine.getHtml(), '<p>Read the <a href="https://x.dev" title="X" target="_blank" rel="noopener noreferrer">docs</a></p>');
    engine.setSelection(12);
    assert.equal(toolbarState(engine).link, 'https://x.dev');
    engine.commands.setLink({ href: 'https://y.dev', text: 'guide' });
    assert.equal(engine.getHtml(), '<p>Read the <a href="https://y.dev">guide</a></p>');
    engine.setSelection(12);
    engine.commands.unsetLink();
    assert.equal(engine.getHtml(), '<p>Read the guide</p>');
    engine.setSelection(15);
    engine.commands.setLink({ href: 'mailto:a@b.c', text: ' mail' });
    assert.equal(engine.getHtml(), '<p>Read the guide<a href="mailto:a@b.c"> mail</a></p>');
  });

  it('inserts images (inline, or a figure with a caption), audio, video and updates image attributes', () => {
    const engine = createEngineSync({ html: '<p>x</p>' });
    engine.setSelection(2);
    engine.commands.insertImage({ src: 'https://x.dev/a.png', alt: 'A', width: 100 });
    assert.equal(engine.getHtml(), '<p>x<img src="https://x.dev/a.png" alt="A" width="100"></p>');
    engine.setSelection(2, 3);
    assert.equal(toolbarState(engine).node, null);
    engine.commands.insertImage({ src: 'https://x.dev/b.png', alt: 'B', caption: 'Figure 1' });
    assert.match(engine.getHtml(), /<figure><img src="https:\/\/x.dev\/b.png" alt="B"><figcaption>Figure 1<\/figcaption><\/figure>/);
    engine.commands.insertAudio({ src: 'https://x.dev/a.mp3' });
    engine.commands.insertVideo({ src: 'https://x.dev/v.mp4', width: 320, height: 180 });
    const html = engine.getHtml();
    assert.match(html, /<audio controls src="https:\/\/x.dev\/a.mp3"><\/audio>/);
    assert.match(html, /<video controls src="https:\/\/x.dev\/v.mp4" width="320" height="180"><\/video>/);
  });

  it('table insert, rows, columns, header, merge, split, style and delete', () => {
    const engine = createEngineSync({ html: '<p>x</p>' });
    engine.setSelection(2);
    engine.commands.insertTable({ rows: 2, cols: 2, headerRow: true });
    assert.equal(toolbarState(engine).inTable, true);
    assert.match(engine.getHtml(), /<table><tbody><tr><th><p><\/p><\/th><th><p><\/p><\/th><\/tr><tr><td><p><\/p><\/td><td><p><\/p><\/td><\/tr><\/tbody><\/table>/);
    engine.commands.insertText('H');
    engine.commands.addRowAfter();
    engine.commands.addColumnAfter();
    const rows = () => (engine.getHtml().match(/<tr>/g) ?? []).length;
    const cells = () => (engine.getHtml().match(/<t[dh]/g) ?? []).length;
    assert.equal(rows(), 3);
    assert.equal(cells(), 9);
    engine.commands.deleteRow();
    engine.commands.deleteColumn();
    assert.equal(cells(), 4);
    engine.commands.setTableStyle('striped');
    assert.match(engine.getHtml(), /<table class="salmon-rich-text-table--striped">/);
    const header = /<th>/.test(engine.getHtml());
    assert.equal(engine.commands.toggleHeaderRow(), true);
    assert.equal(/<th>/.test(engine.getHtml()), !header);
    assert.equal(engine.commands.deleteTable(), true);
    assert.doesNotMatch(engine.getHtml(), /table/);
  });

  it('code blocks keep text only and their language', () => {
    const engine = createEngineSync({ html: '<p>let <strong>x</strong></p>' });
    engine.setSelection(2);
    engine.commands.codeBlock('ts');
    assert.equal(engine.getHtml(), '<pre><code class="language-ts">let x</code></pre>');
    assert.equal(toolbarState(engine).block, 'code');
    engine.commands.setCodeLanguage('css');
    assert.equal(engine.getHtml(), '<pre><code class="language-css">let x</code></pre>');
    engine.commands.codeBlock();
    assert.equal(engine.getHtml(), '<p>let x</p>');
  });
});

describe('history, maxLength, find and replace, format painter', () => {
  it('undo and redo, undoLimit and clearHistory', () => {
    const engine = createEngineSync({ html: '<p>a</p>', undoLimit: 2, undoGroupDelay: 0 });
    for (const ch of ['b', 'c', 'd']) {
      engine.setSelection(engine.state.doc.content.size - 1);
      engine.commands.insertText(ch);
    }
    assert.equal(engine.getHtml(), '<p>abcd</p>');
    assert.equal(engine.commands.undo(), true);
    assert.equal(engine.commands.undo(), true);
    assert.equal(engine.commands.undo(), false);
    assert.equal(engine.getHtml(), '<p>ab</p>');
    engine.commands.redo();
    assert.equal(engine.getHtml(), '<p>abc</p>');
    assert.equal(toolbarState(engine).canUndo, true);
    engine.clearHistory();
    assert.equal(toolbarState(engine).canUndo, false);
    assert.equal(toolbarState(engine).canRedo, false);
    assert.equal(engine.commands.undo(), false);
  });

  it('maxLength blocks growing transactions; deleting and programmatic values still apply', () => {
    let max = 5;
    const engine = createEngineSync({ html: '<p>abc</p>', maxLength: () => max });
    engine.setSelection(4);
    engine.commands.insertText('de');
    assert.equal(engine.characterCount, 5);
    engine.commands.insertText('f');
    assert.equal(engine.getHtml(), '<p>abcde</p>');
    engine.setSelection(1, 3);
    engine.commands.insertText('X');
    assert.equal(engine.getHtml(), '<p>Xcde</p>');
    engine.setHtml('<p>longer than five</p>');
    assert.equal(engine.getHtml(), '<p>longer than five</p>');
    max = 100;
    engine.commands.insertText('!');
    assert.equal(engine.characterCount, 17);
  });

  it('find highlights matches, next and previous wrap, replace and replace all', () => {
    const engine = createEngineSync({ html: '<p>cat Cat cat</p><p>concat</p>' });
    assert.equal(engine.commands.find('cat'), 4);
    assert.deepEqual(engine.getSelection().text, 'cat');
    assert.equal(engine.commands.find('cat', { matchCase: true }), 3);
    assert.equal(engine.commands.find('cat', { wholeWord: true }), 3);
    assert.equal(toolbarState(engine).findCount, 3);
    engine.commands.findNext();
    assert.equal(toolbarState(engine).findIndex, 1);
    engine.commands.findPrevious();
    engine.commands.findPrevious();
    assert.equal(toolbarState(engine).findIndex, 2);
    engine.commands.replace('dog');
    assert.equal(engine.getHtml(), '<p>cat Cat dog</p><p>concat</p>');
    assert.equal(engine.commands.replaceAll('cow'), 2);
    assert.equal(engine.getHtml(), '<p>cow cow dog</p><p>concat</p>');
    engine.commands.clearFind();
    assert.equal(toolbarState(engine).findCount, 0);
  });

  it('format painter copies marks and the block format; sticky keeps applying until cancelled', () => {
    const engine = createEngineSync({ html: '<h3><em>styled</em></h3><p>one two</p>' });
    engine.setSelection(3);
    engine.commands.copyFormat();
    assert.equal(toolbarState(engine).painter, true);
    engine.setSelection(9, 12);
    engine.commands.applyFormat();
    assert.equal(engine.getHtml(), '<h3><em>styled</em></h3><h3><em>one</em> two</h3>');
    assert.equal(toolbarState(engine).painter, false);
    engine.setSelection(3);
    engine.commands.copyFormat(true);
    engine.setSelection(13, 16);
    engine.commands.applyFormat();
    assert.equal(toolbarState(engine).painter, true);
    engine.commands.cancelFormatPainter();
    assert.equal(toolbarState(engine).painter, false);
    assert.equal(engine.commands.applyFormat(), false);
  });
});

describe('run(), events and the extension API', () => {
  it('run() resolves aliases, routes unknown ids to UI actions and fires before/after events', () => {
    const before: string[] = [];
    const after: [string, boolean][] = [];
    const ui: string[] = [];
    const engine = createEngineSync({
      html: '<p>Hello</p>',
      onBeforeCommand: (command) => (before.push(command), command !== 'italic'),
      onCommand: (command, _args, applied) => after.push([command, applied]),
      onAction: (id) => (ui.push(id), true),
    });
    engine.setSelection(1, 6);
    assert.equal(engine.run('strikethrough'), true);
    assert.equal(engine.run('alignCenter'), true);
    assert.equal(engine.run('italic'), false);
    assert.equal(engine.run('link'), true);
    assert.equal(engine.getHtml(), '<p style="text-align:center"><s>Hello</s></p>');
    assert.deepEqual(before, ['strikethrough', 'alignCenter', 'italic']);
    assert.deepEqual(after, [['strikethrough', true], ['alignCenter', true]]);
    assert.deepEqual(ui, ['link']);
  });

  it('extensions add nodes, marks, commands, key bindings, input rules and awaited async plugins', async () => {
    const { Plugin, PluginKey } = await import('prosemirror-state');
    const { InputRule } = await import('prosemirror-inputrules');
    const key = new PluginKey<number>('count');
    let factoryState: unknown = null;
    const engine = await createEngine({
      html: '<p>x</p>',
      extensions: [
        {
          name: 'kbd',
          marks: { kbd: { parseDOM: [{ tag: 'kbd' }], toDOM: () => ['kbd', 0] } },
          nodes: { divider: { group: 'block', atom: true, parseDOM: [{ tag: 'hr[data-divider]' }], toDOM: () => ['hr', { 'data-divider': '' }] } },
          commands: { shout: (text: string) => (state, dispatch) => (dispatch?.(state.tr.insertText(text.toUpperCase())), true) },
          keyBindings: { 'Mod-Alt-k': 'shout' },
          inputRules: () => [new InputRule(/->$/, '→')],
          plugins: async (context) => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            factoryState = context.schema.marks['kbd'] ? 'schema-ok' : null;
            return [new Plugin({ key, state: { init: () => 0, apply: (tr, n: number) => (tr.docChanged ? n + 1 : n) } })];
          },
          toolbarItems: [{ id: 'shout', label: 'Shout', command: 'shout' }],
        },
      ],
    });
    assert.equal(factoryState, 'schema-ok');
    assert.ok(engine.schema.marks['kbd']);
    assert.ok(engine.schema.nodes['divider']);
    engine.setSelection(2);
    assert.equal(engine.run('shout', 'hey'), true);
    assert.equal(engine.getHtml(), '<p>xHEY</p>');
    assert.equal(key.getState(engine.state), 1);
    // Extension marks live in the schema; HTML out stays inside the sanitizer's vocabulary.
    engine.dispatch(engine.state.tr.addMark(1, 3, engine.schema.marks['kbd']!.create()));
    assert.equal(engine.state.doc.firstChild!.firstChild!.marks[0]!.type.name, 'kbd');
    assert.doesNotMatch(engine.getHtml(), /kbd/);
    // Input rules from extensions run on typed text (headless: through the plugin's handleTextInput).
    assert.ok(engine.state.plugins.some((p) => (p.spec as { isInputRules?: boolean }).isInputRules));
  });
});
