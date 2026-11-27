// Text folding shared by the collection search index, highlight ranges and
// the Data Grid column chooser. Framework-agnostic: no React, no DOM.

const MARKS = /\p{M}/gu;

/**
 * Search text folding: lowercase unless `matchCase`; with
 * `ignoreAccents`, NFD with combining marks removed.
 */
export function foldText(text: string, ignoreAccents: boolean, matchCase = false): string {
  const t = matchCase ? text : text.toLowerCase();
  return ignoreAccents ? t.normalize('NFD').replace(MARKS, '') : t;
}

/**
 * Folds `text` one code point at a time and records, for every
 * folded code unit, the index of the source code unit it came from, so a
 * match in folded text maps back to a range of the original label.
 */
export function foldWithMap(text: string, ignoreAccents: boolean, matchCase: boolean): { folded: string; origin: Int32Array } {
  let folded = '';
  const origin: number[] = [];
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i) as number;
    const width = code > 0xffff ? 2 : 1;
    const piece = foldText(text.slice(i, i + width), ignoreAccents, matchCase);
    for (let k = 0; k < piece.length; k++) origin.push(i);
    folded += piece;
    i += width;
  }
  origin.push(text.length);
  return { folded, origin: Int32Array.from(origin) };
}
