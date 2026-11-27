// Spreadsheet formula injection guard, shared by every CSV writer and the
// XLSX `quotePrefix` style; on by default. Importers that trim make ` =1+1` live, so the
// operators also count after leading whitespace.

const FORMULA = /^[\t\r]|^\s*[=+\-@]/;
// A formatted number: sign, optional bare currency, digits, optional unit.
// No letter may precede the digits: `-US$1` reads as a cell reference.
const NUMERIC = /^\s*[-+]?\p{Sc}?\s?\p{Nd}[\p{Nd}.,'\s]*(?:e[-+]?\d+)?\s?[\p{Sc}%‰]?\s?\p{L}{0,3}$/iu;

/** Whether a spreadsheet could read this text as a formula. */
export const isFormulaText = (text: string): boolean => FORMULA.test(text);

/** Prefixes `'` to formula-like text; a numeric `value` whose text reads as a number stays as is. */
export function escapeCsvFormula(text: string, value?: unknown): string {
  if (!FORMULA.test(text)) return text;
  return (typeof value === 'number' || typeof value === 'bigint') && NUMERIC.test(text) ? text : `'${text}`;
}
