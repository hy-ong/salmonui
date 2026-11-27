// Mention target for a plain `contenteditable` element: inserted mentions are non-editable chips,
// the caret is restored after the chip, and the text block before the caret
// is read with a chip counted as one U+FFFC character. No ProseMirror: the
// editors of this package provide their own target over the engine. It lives
// here, not in @salmonui/dropdowns/mention, so the Mention bundle stays in budget
// for textarea and input users.
// Called from effects and event handlers only, never during render.

import type { MentionEditorInsertion, MentionEditorTarget } from '@salmonui/dropdowns/mention';

export interface ContentEditableMentionOptions {
  /** Class of the inserted chip (default `'salmon-mention-chip'`). */
  readonly chipClassName?: string;
  /**
   * Text placed after a chip when the trigger has no `suffix`, so the caret has a
   * place to sit (default a no-break space).
   */
  readonly spacer?: string;
  /** Builds the chip; the default is a `<span contenteditable="false">` with `data-mention-*` attributes. */
  readonly createChip?: (insertion: MentionEditorInsertion, doc: Document) => HTMLElement;
}

const ATOM = '￼';
const BLOCKS = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH|DD|DT|FIGCAPTION|SECTION|ARTICLE)$/;

const isAtom = (node: Node): boolean => node.nodeType === 1 && (node as HTMLElement).getAttribute('contenteditable') === 'false';

/** The block that holds `node` inside `root` (the root itself when there is none). */
function blockOf(root: HTMLElement, node: Node): HTMLElement {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (n.nodeType === 1 && BLOCKS.test((n as Element).nodeName)) return n as HTMLElement;
  }
  return root;
}

/** Calls `visit` for each text node and atom of `block` in document order; stops when it returns true. */
function walk(block: Node, visit: (node: Node, length: number) => boolean): void {
  const step = (node: Node): boolean => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        if (visit(child, (child as Text).data.length)) return true;
      } else if (child.nodeType === 1) {
        if (isAtom(child) || child.nodeName === 'BR') {
          if (visit(child, 1)) return true;
        } else if (!BLOCKS.test(child.nodeName) && step(child)) return true;
      }
    }
    return false;
  };
  step(block);
}

/** DOM position of text offset `offset` of `block`. */
function positionAt(block: Node, offset: number): { node: Node; offset: number } {
  let rest = offset;
  let found: { node: Node; offset: number } | null = null;
  walk(block, (node, length) => {
    if (node.nodeType === 3 && rest <= length) {
      found = { node, offset: rest };
      return true;
    }
    if (node.nodeType !== 3 && rest === 0) {
      const parent = node.parentNode!;
      found = { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, node) };
      return true;
    }
    rest -= length;
    return false;
  });
  if (found) return found;
  return { node: block, offset: block.childNodes.length };
}

/** A `MentionEditorTarget` over a `contenteditable` element. */
export function createContentEditableMentionTarget(element: HTMLElement, options: ContentEditableMentionOptions = {}): MentionEditorTarget {
  const doc = element.ownerDocument;
  const caret = (): { node: Node; offset: number } | null => {
    const sel = doc.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !element.isContentEditable) return null;
    const node = sel.anchorNode;
    if (!node || !element.contains(node)) return null;
    return { node, offset: sel.anchorOffset };
  };
  const textBefore = (block: HTMLElement, node: Node, offset: number): string => {
    const range = doc.createRange();
    range.setStart(block, 0);
    range.setEnd(node, offset);
    // The cloned fragment holds exactly the content before the caret.
    let text = '';
    walk(range.cloneContents(), (n) => {
      text += n.nodeType === 3 ? (n as Text).data : n.nodeName === 'BR' ? '\n' : ATOM;
      return false;
    });
    return text;
  };
  const chip = (insertion: MentionEditorInsertion): HTMLElement => {
    if (options.createChip) return options.createChip(insertion, doc);
    const span = doc.createElement('span');
    span.className = options.chipClassName ?? 'salmon-mention-chip';
    span.setAttribute('contenteditable', 'false');
    span.setAttribute('data-mention-value', String(insertion.value));
    span.setAttribute('data-mention-trigger', insertion.trigger);
    span.textContent = insertion.suffix && insertion.text.endsWith(insertion.suffix) ? insertion.text.slice(0, insertion.text.length - insertion.suffix.length) : insertion.text;
    return span;
  };
  return {
    element,
    getTextBeforeCaret() {
      const at = caret();
      if (!at) return null;
      return textBefore(blockOf(element, at.node), at.node, at.offset);
    },
    getCaretRect(offset) {
      const at = caret();
      if (!at) return null;
      const block = blockOf(element, at.node);
      const pos = positionAt(block, offset);
      const range = doc.createRange();
      range.setStart(pos.node, pos.offset);
      if (pos.node.nodeType === 3 && pos.offset < (pos.node as Text).data.length) range.setEnd(pos.node, pos.offset + 1);
      else range.collapse(true);
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) return { left: rect.left, top: rect.top, bottom: rect.bottom };
      const box = (pos.node.nodeType === 1 ? (pos.node as Element) : pos.node.parentElement ?? element).getBoundingClientRect();
      return { left: box.left, top: box.top, bottom: box.bottom };
    },
    insertMention(insertion) {
      const at = caret();
      if (!at) return;
      const block = blockOf(element, at.node);
      const from = positionAt(block, insertion.start);
      const to = positionAt(block, insertion.end);
      const range = doc.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      range.deleteContents();
      const node = chip(insertion);
      const after = doc.createTextNode(insertion.suffix || (options.spacer ?? ' '));
      range.insertNode(after);
      range.insertNode(node);
      // Selection restore: the caret sits after the chip and its suffix.
      const sel = doc.getSelection();
      if (sel) {
        const caretRange = doc.createRange();
        caretRange.setStart(after, after.data.length);
        caretRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(caretRange);
      }
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    },
    subscribe(listener) {
      const onSelection = (): void => {
        const sel = doc.getSelection();
        if (sel?.anchorNode && element.contains(sel.anchorNode)) listener();
      };
      const onInput = (event: Event): void => {
        if (!(event as InputEvent).isComposing) listener();
      };
      element.addEventListener('input', onInput);
      doc.addEventListener('selectionchange', onSelection);
      return () => {
        element.removeEventListener('input', onInput);
        doc.removeEventListener('selectionchange', onSelection);
      };
    },
  };
}
