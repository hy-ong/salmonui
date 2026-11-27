// CSV input for the pivot engine: an RFC 4180 parser that
// turns a CSV string into raw rows for `data`. No CSV prop.
import type { PivotFieldType } from './types.js';

export interface ParseCsvOptions {
  /** Field separator (default `,`). */
  readonly delimiter?: string;
  /** First record holds the field names (default true); otherwise fields are named `0`, `1`, ... */
  readonly header?: boolean;
  /** Per-field conversion; fields not listed are inferred (all values numeric: number, else string). */
  readonly types?: Readonly<Record<string, PivotFieldType>>;
}

function records(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  const d = delimiter;
  for (; i < n; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++;
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (text.startsWith(d, i)) {
      row.push(cell);
      cell = '';
      i += d.length - 1;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) row.push(cell), out.push(row);
  return out;
}

const NUMERIC = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;

function convert(value: string, type: PivotFieldType): unknown {
  if (value === '') return null;
  if (type === 'number') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  if (type === 'boolean') return /^(true|1|yes)$/i.test(value.trim());
  if (type === 'date') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return value;
}

/** Parses CSV text into row objects keyed by the header (quoted fields, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string, options: ParseCsvOptions = {}): Record<string, unknown>[] {
  const all = records(text, options.delimiter ?? ',');
  if (!all.length) return [];
  const header = options.header !== false;
  const names = header ? all[0]!.map((s) => s.trim()) : all[0]!.map((_, i) => String(i));
  const body = header ? all.slice(1) : all;
  const types: PivotFieldType[] = names.map((name, c) => {
    const t = options.types?.[name];
    if (t) return t;
    let seen = false;
    for (const r of body) {
      const v = r[c];
      if (v === undefined || v === '') continue;
      if (!NUMERIC.test(v)) return 'string';
      seen = true;
    }
    return seen ? 'number' : 'string';
  });
  const rows: Record<string, unknown>[] = [];
  for (const r of body) {
    if (r.length === 1 && r[0] === '' && names.length > 1) continue;
    const o: Record<string, unknown> = {};
    for (let c = 0; c < names.length; c++) o[names[c]!] = convert(r[c] ?? '', types[c]!);
    rows.push(o);
  }
  return rows;
}
