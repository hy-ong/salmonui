// Pure mention logic: trigger detection at the caret and the text of an
// insertion. No React, no DOM globals, unit tested in Node. Filtering,
// folding and match ranges come from internal/collection/.

/** A trigger as the detector sees it (the component's `MentionTrigger` minus its data). */
export interface MentionTriggerSpec {
  readonly char: string;
}

export interface MentionDetectOptions {
  /** The trigger must be at the start of the text or after whitespace (default `true`). */
  readonly requireLeadingSpace: boolean;
  /** The search text may contain spaces (never a line break). */
  readonly multiWord: boolean;
}

/** An active mention: the trigger at `start`, the search text from `start + char.length` to the caret. */
export interface MentionMatch {
  readonly trigger: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const isSpace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ' ' || ch === '　';
const isBreak = (ch: string): boolean => ch === '\n' || ch === '\r';

/** Longest search text the detector scans back over (a guard for very long lines). */
const MAX_SCAN = 200;

/**
 * Finds the mention that ends at `caret`, or null. Scans back from the caret
 * to the nearest trigger character; without `multiWord` whitespace ends the
 * scan, with it only a line break does. The search text never starts with
 * whitespace. Among triggers that share a prefix the longest wins.
 */
export function findMention(value: string, caret: number, triggers: readonly MentionTriggerSpec[], options: MentionDetectOptions): MentionMatch | null {
  if (caret < 0 || caret > value.length || triggers.length === 0) return null;
  const floor = Math.max(0, caret - MAX_SCAN);
  for (let i = caret - 1; i >= floor; i--) {
    const ch = value[i]!;
    if (isBreak(ch) || (!options.multiWord && isSpace(ch))) return null;
    let best = -1;
    let bestLength = 0;
    for (let t = 0; t < triggers.length; t++) {
      const char = triggers[t]!.char;
      if (char.length === 0 || char.length <= bestLength) continue;
      const start = i - char.length + 1;
      if (start < 0 || value.slice(start, i + 1) !== char) continue;
      best = t;
      bestLength = char.length;
    }
    if (best < 0) continue;
    const start = i - bestLength + 1;
    const before = start > 0 ? value[start - 1]! : '';
    if (options.requireLeadingSpace && before !== '' && !isSpace(before)) {
      // `name@host`: not a mention. A trigger char inside a word still ends the scan.
      return null;
    }
    const text = value.slice(i + 1, caret);
    if (text.length > 0 && isSpace(text[0]!)) return null;
    return { trigger: best, start, end: caret, text };
  }
  return null;
}

/** The text that replaces the trigger and search text: optional trigger char, the item text, the suffix. */
export function insertionText(char: string, keepChar: boolean, text: string, suffix: string): string {
  return `${keepChar ? char : ''}${text}${suffix}`;
}
