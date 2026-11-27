// Okapi BM25 keyword search over small in-memory corpora (docs sections,
// demos). Built once per server from the index; no dependencies.

const STOPWORDS = new Set(
  'a an and are as at be by can do does for from has have how i if in into is it its of on or that the this to use used using what when where which with you your'.split(' '),
);

/** Folds a plural or `-ing` / `-ed` form to a shared stem (a light, predictable stemmer). */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Lower-case word stems of a text. Identifiers also yield their camelCase and
 * kebab-case parts (`onValueChange` -> `onvaluechange`, `on`, `value`, `change`).
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/g)) {
    const word = match[0];
    const whole = word.toLowerCase();
    const parts = word.split(/[-_]|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter(Boolean);
    if (parts.length > 1) {
      out.push(stem(whole.replace(/[-_]/g, '')));
      for (const part of parts) {
        const lower = part.toLowerCase();
        if (!STOPWORDS.has(lower)) out.push(stem(lower));
      }
    } else if (!STOPWORDS.has(whole)) {
      out.push(stem(whole));
    }
  }
  return out;
}

/** Query-side expansions of common abbreviations (stems of `tokenize`). */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  ssr: ['server', 'render', 'hydration'],
  rtl: ['right', 'left', 'direction'],
  a11y: ['accessibility', 'aria'],
  i18n: ['locale', 'localization'],
  l10n: ['locale', 'localization'],
  dnd: ['drag', 'drop'],
};

/** Query terms: `tokenize` plus the expansions of known abbreviations. */
export function queryTerms(query: string): string[] {
  const terms = tokenize(query);
  return [...new Set(terms.flatMap((t) => [t, ...(SYNONYMS[t] ?? [])]))];
}

export interface SearchField {
  readonly text: string;
  /** Term-frequency multiplier (title fields weigh more than body text). */
  readonly weight: number;
}

export interface SearchHit {
  readonly ref: number;
  readonly score: number;
}

/** A BM25 index over documents made of weighted fields. */
export class Bm25 {
  readonly #k1 = 1.2;
  readonly #b = 0.75;
  readonly #postings = new Map<string, Map<number, number>>();
  readonly #lengths: number[] = [];
  #avgLength = 0;

  constructor(documents: readonly (readonly SearchField[])[]) {
    let total = 0;
    documents.forEach((fields, ref) => {
      let length = 0;
      for (const field of fields) {
        for (const term of tokenize(field.text)) {
          length += 1;
          let posting = this.#postings.get(term);
          if (!posting) this.#postings.set(term, (posting = new Map()));
          posting.set(ref, (posting.get(ref) ?? 0) + field.weight);
        }
      }
      this.#lengths[ref] = length;
      total += length;
    });
    this.#avgLength = documents.length > 0 ? total / documents.length : 0;
  }

  get size(): number {
    return this.#lengths.length;
  }

  /** Documents matching any query term, best first. */
  search(query: string): SearchHit[] {
    const terms = queryTerms(query);
    const n = this.#lengths.length;
    const scores = new Map<number, number>();
    for (const term of terms) {
      const posting = this.#postings.get(term);
      if (!posting) continue;
      const idf = Math.log(1 + (n - posting.size + 0.5) / (posting.size + 0.5));
      for (const [ref, tf] of posting) {
        const norm = 1 - this.#b + (this.#b * (this.#lengths[ref] ?? 0)) / (this.#avgLength || 1);
        const score = (idf * tf * (this.#k1 + 1)) / (tf + this.#k1 * norm);
        scores.set(ref, (scores.get(ref) ?? 0) + score);
      }
    }
    return [...scores].map(([ref, score]) => ({ ref, score })).sort((a, b) => b.score - a.score || a.ref - b.ref);
  }
}
