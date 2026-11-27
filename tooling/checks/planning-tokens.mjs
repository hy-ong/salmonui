// Planning tokens: text that belongs to internal project tracking and must
// not reach a published package or the website. Shared by
// no-planning-tokens.mjs (package tarballs), tooling/site/check-out.mjs (the
// static export) and the site and MCP index tests.
//
// - Tracking IDs: an upper-case prefix of two to six characters, `-` and two
//   or three digits as a whole word (`ABC-12`). Standards and sample values
//   that look the same are listed in ID_ALLOWLIST.
// - Work-package labels: `WP3`, `ABC-WP3`.
// - Names of other UI component vendors and their packages.
// - Paths of internal design documents.

/** Candidate tracking IDs. */
export const ID_PATTERN = /(?<![A-Za-z0-9_-])[A-Z][A-Z0-9]{1,5}-\d{2,3}(?![A-Za-z0-9_])/g;

/** Look-alikes of tracking IDs that are standards or sample data. */
export const ID_ALLOWLIST = [
  // Encodings, checksums, hashes, standards
  /^(?:UTF|UCS)-\d+$/,
  /^CRC-\d+$/,
  /^SHA-\d+$/,
  /^ISO-\d+$/,
  /^RFC-\d+$/,
  /^ES-\d+$/,
  // Barcode symbologies
  /^(?:GS1|EAN|UPC|ITF|MSI)-\d+$/,
  // Sample values in docs, demos and tests
  /^SALMON-\d+$/,
  /^(?:ABC|AB|LL|TEA|COF|MUG|KOP|BRW|BEA|LOT|ORD|INV|SKU)-\d+$/,
];

export const WORK_PACKAGE_PATTERN = /(?<![A-Za-z0-9_-])(?:[A-Z]{2,6}-)?WP\d+(?![A-Za-z0-9_])/g;

/**
 * Other UI component vendors. Dependency guards (deps.mjs, examples.mjs)
 * keep the package names they reject in their own deny-lists.
 */
export const VENDOR_PATTERN = /\b(?:syncfusion|ej2|essential js|ag[- ]grid|ant[- ]design|antd|kendo|telerik|devextreme|material[- ]ui|mui|tanstack|primereact|handsontable|wijmo|dhtmlx|jqwidgets)\b/gi;

/** Paths and names of internal design documents. */
export const DOC_PATTERN = /docs\/architecture\/|parity-checklist|direction\.md\b|release-criteria\.md\b/g;

export const PATTERNS = Object.freeze({ id: ID_PATTERN, 'work package': WORK_PACKAGE_PATTERN, vendor: VENDOR_PATTERN, document: DOC_PATTERN });

export const isAllowedId = (token) => ID_ALLOWLIST.some((re) => re.test(token));

/**
 * Planning-token hits of one text: `{ kind, match, line, context }`, at most
 * `limit` hits (then one summary entry with the remaining count).
 */
export function planningTokenHits(text, { limit = 5, kinds = Object.keys(PATTERNS) } = {}) {
  const source = String(text ?? '');
  const hits = [];
  let total = 0;
  for (const kind of kinds) {
    for (const match of source.matchAll(PATTERNS[kind])) {
      if (kind === 'id' && isAllowedId(match[0])) continue;
      total++;
      if (hits.length >= limit) continue;
      const start = Math.max(0, match.index - 40);
      const end = Math.min(source.length, match.index + match[0].length + 40);
      const line = source.slice(0, match.index).split('\n').length;
      hits.push({ kind, match: match[0], line, context: source.slice(start, end).replace(/\s+/g, ' ') });
    }
  }
  if (total > hits.length) hits.push({ kind: 'more', match: `${total - hits.length} more`, line: hits.at(-1).line, context: 'further hits in this text' });
  return hits;
}
