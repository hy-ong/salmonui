// Undoable text replacement in a <textarea> or <input>.
// `document.execCommand('insertText')` keeps the
// change on the browser's native undo stack together with typing; where it
// is missing or does not apply, `setRangeText` plus a bubbling `input` event
// is the fallback (React's onChange still fires). Extracted from Mention for MarkdownEditor toolbar commands. Called from event
// handlers only, never during render.

export type TextField = HTMLTextAreaElement | HTMLInputElement;

/** The smallest replacement turning `before` into `after`: common prefix and suffix are kept. */
export function textDiff(before: string, after: string): { readonly start: number; readonly end: number; readonly text: string } {
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let tail = 0;
  while (tail < max - start && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
  return { start, end: before.length - tail, text: after.slice(start, after.length - tail) };
}

/**
 * Replaces `start..end` of `field` with `text` and returns true when the
 * native path (undoable with Ctrl+Z) applied it. Focuses the field first;
 * leaves the caret after the inserted text.
 */
export function replaceText(field: TextField, start: number, end: number, text: string): boolean {
  const doc = field.ownerDocument;
  if (doc.activeElement !== field) field.focus();
  field.setSelectionRange(start, end);
  const expected = field.value.slice(0, start) + text + field.value.slice(end);
  let native = false;
  try {
    // An empty insertion is a deletion; `insertText` with '' is a no-op in some engines.
    native = (text === '' ? start === end || doc.execCommand('delete', false) : doc.execCommand('insertText', false, text)) && field.value === expected;
  } catch {
    native = false;
  }
  if (!native) {
    if (field.value !== expected) field.setRangeText(text, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const caret = start + text.length;
  field.setSelectionRange(caret, caret);
  return native;
}
