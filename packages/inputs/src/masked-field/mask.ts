// Mask engine of MaskedField. Pure: no React, no DOM.
//
// A mask compiles to one slot per displayed character. Input slots hold at
// most one character; literal slots are fixed. Positions in the masked
// string equal slot indexes, so a selection in the input maps directly to
// slots. Syntax:
//
//   0 digit (required)          9 digit or space (optional)
//   # digit, space, + or -      L letter (required)       ? letter (optional)
//   & any non-space (required)  C any character (optional)
//   A letter or digit (req.)    a letter or digit (optional)
//   >  upper-case what follows  <  lower-case what follows  |  stop shifting
//   \x literal x                [abc] / [0-2] one character of the class
//   tokens: custom characters, a string of allowed characters or a RegExp

export interface MaskSlot {
  /** `null` for a literal. */
  readonly test: ((ch: string) => boolean) | null;
  /** The literal character, or `''` for an input slot. */
  readonly literal: string;
  readonly required: boolean;
  readonly shift: 'upper' | 'lower' | null;
}

export interface Mask {
  readonly slots: readonly MaskSlot[];
  /** True when every input slot accepts only digits (the input is then `dir="ltr"`). */
  readonly digitsOnly: boolean;
}

export type MaskTokens = Readonly<Record<string, string | RegExp>>;

const DIGIT = (c: string): boolean => c >= '0' && c <= '9';
const LETTER = (c: string): boolean => c.toLowerCase() !== c.toUpperCase();
const BUILT_IN: Readonly<Record<string, readonly [(c: string) => boolean, boolean]>> = {
  '0': [DIGIT, true],
  '9': [(c) => DIGIT(c) || c === ' ', false],
  '#': [(c) => DIGIT(c) || c === ' ' || c === '+' || c === '-', false],
  L: [LETTER, true],
  '?': [LETTER, false],
  '&': [(c) => c.trim() !== '', true],
  C: [() => true, false],
  A: [(c) => DIGIT(c) || LETTER(c), true],
  a: [(c) => DIGIT(c) || LETTER(c), false],
};

const cache = new Map<string, Mask>();

/** Compiles a mask; results are cached per mask string when no `tokens` are given. */
export function parseMask(mask: string, tokens?: MaskTokens): Mask {
  const cached = tokens ? undefined : cache.get(mask);
  if (cached) return cached;
  const slots: MaskSlot[] = [];
  let shift: MaskSlot['shift'] = null;
  let digitsOnly = true;
  let inputs = 0;
  for (let i = 0; i < mask.length; i++) {
    const c = mask[i] as string;
    const custom = tokens?.[c];
    if (custom !== undefined) {
      const test = typeof custom === 'string' ? (x: string) => custom.includes(x) : (x: string) => new RegExp(custom.source, custom.flags.replace(/[gy]/g, '')).test(x);
      slots.push({ test, literal: '', required: true, shift });
      digitsOnly = false;
      inputs++;
    } else if (c === '\\' && i + 1 < mask.length) {
      slots.push({ test: null, literal: mask[++i] as string, required: false, shift: null });
    } else if (c === '>' || c === '<' || c === '|') {
      shift = c === '>' ? 'upper' : c === '<' ? 'lower' : null;
    } else if (c === '[') {
      const end = mask.indexOf(']', i + 1);
      if (end < 0) {
        slots.push({ test: null, literal: c, required: false, shift: null });
        continue;
      }
      const re = new RegExp(`^${mask.slice(i, end + 1)}$`);
      slots.push({ test: (x) => re.test(x), literal: '', required: true, shift });
      if (!/^\[\^?[0-9-]+\]$/.test(mask.slice(i, end + 1))) digitsOnly = false;
      inputs++;
      i = end;
    } else if (BUILT_IN[c]) {
      const [test, required] = BUILT_IN[c] as readonly [(c: string) => boolean, boolean];
      slots.push({ test, literal: '', required, shift });
      if (c !== '0' && c !== '9') digitsOnly = false;
      inputs++;
    } else {
      slots.push({ test: null, literal: c, required: false, shift: null });
    }
  }
  const out: Mask = { slots, digitsOnly: digitsOnly && inputs > 0 };
  if (!tokens) {
    if (cache.size > 128) cache.clear();
    cache.set(mask, out);
  }
  return out;
}

/** Characters per slot: the literal, the entered character, or `''` for an empty input slot. */
export type MaskState = readonly string[];

const shifted = (slot: MaskSlot, c: string): string => (slot.shift === 'upper' ? c.toUpperCase() : slot.shift === 'lower' ? c.toLowerCase() : c);

/** The state of `raw` typed from the start (the raw value has no literals or prompts). */
export function apply(mask: Mask, raw: string): MaskState {
  return insert(mask, empty(mask), 0, raw).state;
}

export function empty(mask: Mask): MaskState {
  return mask.slots.map((s) => (s.test ? '' : s.literal));
}

/** Raw value: the entered characters in order. */
export function rawOf(mask: Mask, state: MaskState): string {
  let out = '';
  for (let i = 0; i < mask.slots.length; i++) if ((mask.slots[i] as MaskSlot).test) out += state[i] ?? '';
  return out;
}

/** Display text: literals, entered characters and `placeholderChar` for empty input slots. */
export function display(mask: Mask, state: MaskState, placeholderChar = '_'): string {
  let out = '';
  for (let i = 0; i < mask.slots.length; i++) {
    const v = state[i] ?? '';
    out += (mask.slots[i] as MaskSlot).test ? v || placeholderChar : v;
  }
  return out;
}

/** True when every required input slot is filled. */
export function isComplete(mask: Mask, state: MaskState): boolean {
  return mask.slots.every((s, i) => !s.test || !s.required || state[i] !== '');
}

/**
 * Types `text` at position `at`: each character goes to the next input slot
 * that accepts it (literals are skipped; typing a literal moves past it).
 * Characters no slot accepts are dropped. Returns the caret after the last
 * written character.
 */
export function insert(mask: Mask, state: MaskState, at: number, text: string): { state: MaskState; caret: number } {
  const next = state.slice();
  let pos = at;
  for (const ch of text) {
    let i = pos;
    while (i < mask.slots.length) {
      const slot = mask.slots[i] as MaskSlot;
      if (!slot.test) {
        if (slot.literal === ch) {
          i++;
          break;
        }
        i++;
        continue;
      }
      if (slot.test(ch)) {
        next[i] = shifted(slot, ch);
        i++;
        break;
      }
      // A rejected character stays rejected; do not search further.
      i = -1;
      break;
    }
    if (i < 0) continue;
    pos = i;
  }
  return { state: next, caret: caretFor(mask, pos) };
}

/** Clears the input slots in `[from, to)`; returns the caret at `from`. */
export function remove(mask: Mask, state: MaskState, from: number, to: number): { state: MaskState; caret: number } {
  const next = state.slice();
  for (let i = Math.max(0, from); i < Math.min(to, mask.slots.length); i++) if ((mask.slots[i] as MaskSlot).test) next[i] = '';
  return { state: next, caret: from };
}

/** Backspace at a collapsed caret: clears the previous input slot (skipping literals). */
export function removeBackward(mask: Mask, state: MaskState, caret: number): { state: MaskState; caret: number } {
  let i = caret - 1;
  while (i >= 0 && !(mask.slots[i] as MaskSlot).test) i--;
  if (i < 0) return { state, caret: 0 };
  return remove(mask, state, i, i + 1);
}

/** Delete at a collapsed caret: clears the next input slot. */
export function removeForward(mask: Mask, state: MaskState, caret: number): { state: MaskState; caret: number } {
  let i = caret;
  while (i < mask.slots.length && !(mask.slots[i] as MaskSlot).test) i++;
  if (i >= mask.slots.length) return { state, caret };
  return { state: remove(mask, state, i, i + 1).state, caret: i + 1 };
}

/** Moves a caret past literal slots so typing lands on an input slot. */
export function caretFor(mask: Mask, pos: number): number {
  let i = pos;
  while (i < mask.slots.length && !(mask.slots[i] as MaskSlot).test) i++;
  return i;
}

/** The masked text of a raw value. */
export function formatMasked(mask: string, raw: string, options: { readonly tokens?: MaskTokens; readonly placeholderChar?: string } = {}): string {
  const m = parseMask(mask, options.tokens);
  return display(m, apply(m, raw), options.placeholderChar ?? '_');
}
