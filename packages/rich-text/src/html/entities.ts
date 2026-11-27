// HTML character references: numeric
// references with the HTML replacement rules, and the named references that
// editors, Word and Google Docs actually write (they emit other characters
// as UTF-8). The table is deliberately short: an unknown name stays literal
// text, which is always safe, because the serializer re-escapes every `&`
// and a URL with a literal `&colon;` has no scheme.

const NAMED: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', AMP: '&', LT: '<', GT: '>', QUOT: '"',
  Tab: '\t', NewLine: '\n', colon: ':', lpar: '(', rpar: ')', sol: '/',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013',
  lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201a', ldquo: '\u201c', rdquo: '\u201d', bdquo: '\u201e',
  laquo: '\u00ab', raquo: '\u00bb', bull: '\u2022', middot: '\u00b7', deg: '\u00b0', plusmn: '\u00b1',
  times: '\u00d7', divide: '\u00f7', para: '\u00b6', sect: '\u00a7', euro: '\u20ac', pound: '\u00a3',
  yen: '\u00a5', cent: '\u00a2', iexcl: '\u00a1', iquest: '\u00bf', shy: '\u00ad', ensp: '\u2002',
  emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d', lrm: '\u200e', rlm: '\u200f',
  frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be', rarr: '\u2192', larr: '\u2190',
};

// Legacy references the HTML tokenizer also accepts without the semicolon.
const LEGACY = new Set(['amp', 'lt', 'gt', 'quot', 'nbsp', 'copy', 'reg', 'AMP', 'LT', 'GT', 'QUOT']);

// Windows-1252 remapping of numeric references 0x80..0x9F (HTML spec).
const C1: Readonly<Record<number, number>> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function fromCodePoint(code: number): string {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\ufffd';
  const mapped = C1[code];
  return String.fromCodePoint(mapped ?? code);
}

const REF = /&(?:#[xX]([0-9a-fA-F]{1,8});?|#([0-9]{1,8});?|([A-Za-z][A-Za-z0-9]{0,31});?)/g;

/**
 * Decodes HTML character references. `inAttribute` applies the attribute
 * rule: a legacy reference without `;` followed by `=` or an alphanumeric is
 * left literal (`?a=1&copy=2` keeps `&copy`).
 */
export function decodeEntities(text: string, inAttribute = false): string {
  if (text.indexOf('&') < 0) return text;
  return text.replace(REF, (match: string, hex: string | undefined, dec: string | undefined, name: string | undefined, offset: number) => {
    if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16));
    if (dec !== undefined) return fromCodePoint(Number.parseInt(dec, 10));
    const terminated = match.endsWith(';');
    const n = name as string;
    if (terminated) {
      const value = NAMED[n];
      if (value !== undefined) return value;
      // Longest legacy prefix (`&notit;` is `\u00acit;` in browsers): only for legacy names.
    }
    // Without `;` (or unknown with `;`): try the longest legacy prefix.
    for (let len = Math.min(n.length, 4); len >= 2; len--) {
      const prefix = n.slice(0, len);
      if (!LEGACY.has(prefix)) continue;
      const rest = match.slice(1 + len);
      if (inAttribute && (rest.length > 0 && /^[=A-Za-z0-9]/.test(rest) || (rest.length === 0 && /^[=A-Za-z0-9]/.test(text.charAt(offset + match.length))))) return match;
      return (NAMED[prefix] as string) + rest;
    }
    return match;
  });
}
