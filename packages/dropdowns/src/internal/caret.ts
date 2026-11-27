// Caret coordinates in a <textarea> or <input> through a mirror element:
// a hidden <div> copies the field's
// box and text styles, holds the text up to the index, and a marker <span>
// at the index gives the offset. Called from event handlers and layout
// effects only, never during render or on the server.

/** Styles that affect where text wraps and where a character lands. */
const COPIED = [
  'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily', 'fontFeatureSettings', 'fontKerning',
  'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize',
  'whiteSpace', 'wordBreak', 'overflowWrap',
] as const;

/** Offset of the character at `index` from the field's border box, before scrolling; `height` is one line. */
export interface CaretOffset {
  readonly left: number;
  readonly top: number;
  readonly height: number;
  /** Right edge of the text after `index` on the marker's line; the caret's inline position in right-to-left text. */
  readonly right?: number;
}

export type MentionField = HTMLTextAreaElement | HTMLInputElement;

export function caretOffset(field: MentionField, index: number): CaretOffset {
  const doc = field.ownerDocument;
  const view = doc.defaultView!;
  const isInput = field.nodeName === 'INPUT';
  const computed = view.getComputedStyle(field);
  const mirror = doc.createElement('div');
  const style = mirror.style as unknown as Record<string, string>;
  const source = computed as unknown as Record<string, string>;
  for (const prop of COPIED) style[prop] = source[prop] ?? '';
  style['position'] = 'absolute';
  style['visibility'] = 'hidden';
  style['top'] = '0';
  style['left'] = '-9999px';
  if (isInput) {
    // An <input> never wraps; only the inline offset matters.
    style['whiteSpace'] = 'pre';
  } else {
    style['whiteSpace'] = 'pre-wrap';
    style['overflowWrap'] = 'break-word';
  }
  const value = field.value;
  mirror.textContent = value.slice(0, index);
  const marker = doc.createElement('span');
  // The rest of the text keeps the wrapping of the line the marker is on.
  marker.textContent = value.slice(index) || '.';
  mirror.appendChild(marker);
  doc.body.appendChild(mirror);
  const lineHeight = Number.parseFloat(computed.lineHeight);
  const fontSize = Number.parseFloat(computed.fontSize) || 16;
  const left = marker.offsetLeft + Number.parseFloat(computed.borderLeftWidth || '0');
  const right = left + marker.offsetWidth;
  // An <input> anchors to its whole box: the popup opens below the field.
  const offset: CaretOffset = isInput
    ? { left, right, top: 0, height: field.offsetHeight }
    : {
        left,
        right,
        top: marker.offsetTop + Number.parseFloat(computed.borderTopWidth || '0'),
        height: Number.isFinite(lineHeight) ? lineHeight : Math.round(fontSize * 1.2),
      };
  mirror.remove();
  return offset;
}

/** Viewport rectangle of a measured caret offset, after the field's current position and scroll. */
export function caretRect(field: MentionField, offset: CaretOffset): { left: number; top: number; width: number; height: number } {
  const box = field.getBoundingClientRect();
  const isInput = field.nodeName === 'INPUT';
  // Clamped to the field: a trigger scrolled out of view anchors at the field's edge.
  const left = Math.min(Math.max(box.left + offset.left - field.scrollLeft, box.left), box.right);
  return {
    left,
    top: isInput ? box.top : Math.min(Math.max(box.top + offset.top - field.scrollTop, box.top), box.bottom - offset.height),
    width: 0,
    height: offset.height,
  };
}
