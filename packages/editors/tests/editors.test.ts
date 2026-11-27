// Editors logic in Node: the
// pure Markdown text commands, the shortcut map, the undoable-replacement
// diff and the InlineEdit validation runner. DOM behavior is in
// tests/browser/inline-edit.spec.ts and tests/browser/markdown-editor.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCommand,
  continueList,
  DEFAULT_MARKDOWN_SYNTAX,
  imageMarkdown,
  indentLines,
  insertBlock,
  insertSnippet,
  linkMarkdown,
  tableMarkdown,
  toggleInline,
  type TextState,
} from '../dist/markdown-editor/commands.js';
import { shortcutCommand } from '../dist/markdown-editor/MarkdownEditor.js';
import { MARKDOWN_DEFAULT_TOOLBAR } from '../dist/markdown-editor/items.js';
import { textDiff } from '../../core/dist/internal/text-edit.js';
import { compileInlineValidation, runValidation } from '../dist/inline-edit/validate.js';
import { INLINE_EDIT_DEFAULT_LOCALE_TEXT } from '../dist/inline-edit/InlineEdit.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

/** `[` and `]` mark the selection; `|` marks a caret. */
function st(marked: string): TextState {
  const caret = marked.indexOf('|');
  if (caret >= 0) return { text: marked.replace('|', ''), start: caret, end: caret };
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  return { text: marked.replace('[', '').replace(']', ''), start, end };
}
function show(s: TextState): string {
  if (s.start === s.end) return `${s.text.slice(0, s.start)}|${s.text.slice(s.start)}`;
  return `${s.text.slice(0, s.start)}[${s.text.slice(s.start, s.end)}]${s.text.slice(s.end)}`;
}
const run = (id: Parameters<typeof applyCommand>[0], marked: string, syntax = DEFAULT_MARKDOWN_SYNTAX, locale?: string): string => show(applyCommand(id, st(marked), syntax, locale));

describe('MarkdownEditor inline commands', () => {
  it('bold, italic and strikethrough wrap the selection and toggle back', () => {
    assert.equal(run('bold', 'a [word] b'), 'a **[word]** b');
    assert.equal(run('bold', 'a **[word]** b'), 'a [word] b');
    assert.equal(run('bold', 'a [**word**] b'), 'a [word] b');
    assert.equal(run('italic', 'a [word] b'), 'a *[word]* b');
    assert.equal(run('italic', 'a *[word]* b'), 'a [word] b');
    assert.equal(run('strikethrough', '[x]'), '~~[x]~~');
  });

  it('italic inside bold is not mistaken for an existing italic marker', () => {
    assert.equal(run('italic', '**[word]**'), '***[word]***');
    assert.equal(run('italic', '***[word]***'), '**[word]**');
  });

  it('a caret inserts empty markers with the caret between them', () => {
    assert.equal(run('bold', 'a |b'), 'a **|**b');
    assert.equal(run('code', '|'), '`|`');
  });

  it('superscript and subscript use <sup> / <sub> markup', () => {
    assert.equal(run('superscript', 'x[2]'), 'x<sup>[2]</sup>');
    assert.equal(run('subscript', 'H[2]O'), 'H<sub>[2]</sub>O');
    assert.equal(run('subscript', 'H<sub>[2]</sub>O'), 'H[2]O');
  });

  it('uppercase and lowercase follow the editor locale', () => {
    assert.equal(run('uppercase', 'a [straße] b'), 'a [STRASSE] b');
    assert.equal(run('uppercase', '[istanbul]', DEFAULT_MARKDOWN_SYNTAX, 'tr'), '[İSTANBUL]');
    assert.equal(run('lowercase', '[ABC]'), '[abc]');
    assert.equal(run('lowercase', 'A|BC'), 'A|BC');
  });
});

describe('MarkdownEditor block commands', () => {
  it('headings set, change and toggle the level of the touched lines', () => {
    assert.equal(run('heading2', 'Ti|tle'), '## Ti|tle');
    assert.equal(run('heading1', '## Ti|tle'), '# Ti|tle');
    assert.equal(run('heading2', '## Ti|tle'), 'Ti|tle');
    assert.equal(run('paragraph', '### [Title]'), '[Title]');
    assert.equal(run('heading3', '[a\nb]'), '[### a\n### b]');
  });

  it('blockquote prefixes every line and removes the prefix when all lines have it', () => {
    assert.equal(run('blockquote', '[a\nb]\nc'), '[> a\n> b]\nc');
    assert.equal(run('blockquote', '[> a\n> b]'), '[a\nb]');
  });

  it('lists number, switch markers and toggle off', () => {
    assert.equal(run('orderedList', '[a\nb\nc]'), '[1. a\n2. b\n3. c]');
    assert.equal(run('unorderedList', '[1. a\n2. b]'), '[- a\n- b]');
    assert.equal(run('unorderedList', '[- a\n- b]'), '[a\nb]');
    assert.equal(run('orderedList', 'it|em'), '1. it|em');
  });

  it('a code block fences the lines and unfences them again', () => {
    assert.equal(run('codeBlock', 'x\n[let a = 1]\ny'), 'x\n```\n[let a = 1]\n```\ny');
    assert.equal(run('codeBlock', 'x\n```\n[let a = 1]\n```\ny'), 'x\n[let a = 1]\ny');
    assert.equal(run('codeBlock', '|'), '```\n|\n```');
  });

  it('Enter continues list markers and ends the list on an empty item', () => {
    assert.equal(show(continueList(st('- one|'))!), '- one\n- |');
    assert.equal(show(continueList(st('9. nine|'))!), '9. nine\n10. |');
    assert.equal(show(continueList(st('  * [x] done|'))!), '  * [x] done\n  * [ ] |');
    assert.equal(show(continueList(st('a\n- |'))!), 'a\n|');
    assert.equal(continueList(st('plain|')), null);
    assert.equal(continueList(st('- [a]')), null);
  });

  it('Tab indentation inserts a tab at a caret and indents or outdents lines ( tabIndents)', () => {
    assert.equal(show(indentLines(st('a|b'), false)), 'a\t|b');
    assert.equal(show(indentLines(st('[a\nb]'), false)), '[\ta\n\tb]');
    assert.equal(show(indentLines(st('[\ta\n    b]'), true)), '[a\nb]');
  });
});

describe('MarkdownEditor snippets', () => {
  it('builds link, image and GFM table markup', () => {
    assert.equal(linkMarkdown('Salmon', 'https://example.com'), '[Salmon](https://example.com)');
    assert.equal(linkMarkdown('', 'https://example.com'), '[https://example.com](https://example.com)');
    assert.equal(imageMarkdown('logo', '/logo.png'), '![logo](/logo.png)');
    assert.equal(tableMarkdown(1, 2), '| Header 1 | Header 2 |\n| --- | --- |\n|     |     |');
  });

  it('inserts a block on lines of its own, and a snippet in place', () => {
    assert.equal(show(insertBlock(st('ab|cd'), 'T')), 'ab\nT|\ncd');
    assert.equal(show(insertBlock(st('|'), 'T')), 'T|');
    assert.equal(show(insertSnippet(st('a[b]c'), 'XY')), 'aXY|c');
    assert.equal(show(toggleInline(st('a[b]c'), '<<', '>>')), 'a<<[b]>>c');
  });

  it('syntax overrides the markers per command', () => {
    const syntax = { ...DEFAULT_MARKDOWN_SYNTAX, bold: ['__', '__'] as const, unorderedList: '* ', orderedList: ')' };
    assert.equal(run('bold', '[a]', syntax), '__[a]__');
    assert.equal(run('unorderedList', '[a\nb]', syntax), '[* a\n* b]');
    assert.equal(run('orderedList', '[a\nb]', syntax), '[1) a\n2) b]');
  });

  it('a command on a 1 MB document stays within the 4 ms budget @perf', () => {
    const big = 'lorem ipsum dolor sit amet\n'.repeat(40_000);
    const state = { text: big, start: 500_000, end: 500_010 };
    applyCommand('bold', state);
    // Best of 15 runs: the budget is the command's cost, not scheduler noise of a busy test host.
    let best = Infinity;
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      const next = applyCommand('bold', state);
      textDiff(state.text, next.text);
      best = Math.min(best, performance.now() - t0);
    }
    assertBudget(best, 4, 'markdown command plus diff on 1 MB best', { strict: true });
  });
});

describe('MarkdownEditor shortcuts and toolbar', () => {
  const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}, code = k.length === 1 ? `Key${k.toUpperCase()}` : k) => ({ key: k, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
  it('maps the Markdown toolbar shortcuts', () => {
    assert.equal(shortcutCommand(key('b', { ctrlKey: true })), 'bold');
    assert.equal(shortcutCommand(key('i', { metaKey: true })), 'italic');
    assert.equal(shortcutCommand(key('S', { ctrlKey: true, shiftKey: true })), 'strikethrough');
    assert.equal(shortcutCommand(key('=', { ctrlKey: true }, 'Equal')), 'subscript');
    assert.equal(shortcutCommand(key('+', { ctrlKey: true, shiftKey: true }, 'Equal')), 'superscript');
    assert.equal(shortcutCommand(key('U', { ctrlKey: true, shiftKey: true })), 'uppercase');
    assert.equal(shortcutCommand(key('L', { ctrlKey: true, shiftKey: true })), 'lowercase');
    assert.equal(shortcutCommand(key('O', { ctrlKey: true, shiftKey: true })), 'orderedList');
    assert.equal(shortcutCommand(key('ø', { ctrlKey: true, altKey: true }, 'KeyO')), 'unorderedList');
    assert.equal(shortcutCommand(key('k', { ctrlKey: true })), 'link');
    assert.equal(shortcutCommand(key('I', { ctrlKey: true, shiftKey: true })), 'image');
    assert.equal(shortcutCommand(key('E', { ctrlKey: true, shiftKey: true })), 'table');
    assert.equal(shortcutCommand(key('F', { ctrlKey: true, shiftKey: true })), 'fullscreen');
    assert.equal(shortcutCommand(key('z', { ctrlKey: true })), null, 'undo stays native');
    assert.equal(shortcutCommand(key('b')), null);
  });

  it('the default toolbar lists the documented items', () => {
    assert.deepEqual([...MARKDOWN_DEFAULT_TOOLBAR], ['bold', 'italic', 'strikethrough', '|', 'heading', 'blockquote', 'code', 'orderedList', 'unorderedList', '|', 'link', 'image', 'table', '|', 'undo', 'redo', 'preview', 'fullscreen']);
    assert.ok(Object.isFrozen(MARKDOWN_DEFAULT_TOOLBAR));
  });
});

describe('textDiff (internal/text-edit.ts)', () => {
  it('returns the smallest replacement', () => {
    assert.deepEqual(textDiff('abc', 'a**b**c'), { start: 1, end: 2, text: '**b**' });
    assert.deepEqual(textDiff('a**b**c', 'abc'), { start: 1, end: 6, text: 'b' });
    assert.deepEqual(textDiff('ab', 'a**b'), { start: 1, end: 1, text: '**' });
    assert.deepEqual(textDiff('same', 'same'), { start: 4, end: 4, text: '' });
    assert.deepEqual(textDiff('aaa', 'aaaa'), { start: 3, end: 3, text: 'a' });
  });
});

describe('InlineEdit validation', () => {
  it('uses the Data Grid rule vocabulary and messages', () => {
    const v = compileInlineValidation({ required: true, maxLength: [5, 'At most 5'] });
    assert.deepEqual(runValidation(v, ''), ['This field is required.']);
    assert.deepEqual(runValidation(v, 'toolong'), ['At most 5']);
    assert.deepEqual(runValidation(v, 'ok'), []);
    const n = compileInlineValidation({ range: [1, 10], number: true });
    assert.deepEqual(runValidation(n, 'x'), ['Please enter a valid number.']);
    assert.deepEqual(runValidation(n, 11), ['Please enter a value between 1 and 10.']);
    assert.deepEqual(runValidation(compileInlineValidation({ email: true }), 'a@b.co'), []);
  });

  it('custom validators take the value and may be async', async () => {
    const sync = compileInlineValidation({ validate: (value: string) => (value === 'taken' ? 'Already taken' : null) } as never);
    assert.deepEqual(runValidation(sync, 'taken'), ['Already taken']);
    const result = runValidation(compileInlineValidation({ validate: async (value: unknown) => (value === 'x' ? 'No x' : true) } as never), 'x');
    assert.ok(result instanceof Promise);
    assert.deepEqual(await result, ['No x']);
    assert.deepEqual(runValidation(null, ''), []);
  });

  it('exports frozen locale defaults', () => {
    assert.equal(INLINE_EDIT_DEFAULT_LOCALE_TEXT.save, 'Save');
    assert.equal(INLINE_EDIT_DEFAULT_LOCALE_TEXT.empty, 'Empty');
    assert.ok(Object.isFrozen(INLINE_EDIT_DEFAULT_LOCALE_TEXT));
  });
});
