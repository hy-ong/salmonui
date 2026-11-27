// Deterministic text widths: no `measureText`, so server and client layouts agree
// byte for byte. Advances are the metrics of the fixed system sans stack
// (Arial / Helvetica class metrics, which bound
// system-ui closely), in 1/1000 em for printable ASCII, a full em for CJK and
// other wide characters, and a 5 % safety margin. Labels that exceed their
// box are truncated with an ellipsis instead of being re-measured.

/** The three fixed font sizes of the system (px). */
export const FONT_SIZE = { sm: 12, md: 14, lg: 16 } as const;
export type FontSize = keyof typeof FONT_SIZE | number;

// Advances for code points 32..126.
const ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const SAFETY = 1.05;
/** Average advance for Latin-1 and other narrow scripts. */
const OTHER = 600;
const WIDE = 1000;

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function advance(cp: number): number {
  if (cp >= 32 && cp <= 126) return ASCII[cp - 32] as number;
  if (cp < 32 || (cp >= 0x300 && cp <= 0x36f) || cp === 0x200b || cp === 0x200d) return 0;
  return isWide(cp) ? WIDE : OTHER;
}

const px = (size: FontSize): number => (typeof size === 'number' ? size : FONT_SIZE[size]);

/** Estimated rendered width of `text` in px at `size` (`'sm'` | `'md'` | `'lg'` or px), bold adds 7 %. */
export function textWidth(text: string, size: FontSize = 'sm', bold = false): number {
  let units = 0;
  for (const ch of text) units += advance(ch.codePointAt(0) as number);
  const w = (units / 1000) * px(size) * SAFETY * (bold ? 1.07 : 1);
  return Math.ceil(w * 100) / 100;
}

/** Line height used by layout (1.25 of the font size, theme `--salmon-line-height-tight`). */
export function lineHeight(size: FontSize = 'sm'): number {
  return Math.ceil(px(size) * 1.25);
}

/** Truncates `text` to fit `maxWidth` with a trailing ellipsis (whole code points). */
export function truncateText(text: string, maxWidth: number, size: FontSize = 'sm'): string {
  if (textWidth(text, size) <= maxWidth) return text;
  const ell = textWidth('…', size);
  if (ell > maxWidth) return '';
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(chars.slice(0, mid).join(''), size) + ell <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`;
}

/** Greedy word wrap into at most `maxLines` lines; the last line is truncated. */
export function wrapText(text: string, maxWidth: number, size: FontSize = 'sm', maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size) <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) {
      line = words.slice(i).join(' ');
      break;
    }
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === lines.length - 1 || textWidth(l, size) > maxWidth ? truncateText(l, maxWidth, size) : l));
}

/** Width and height of the bounding box of a label rotated by `angle` degrees. */
export function rotatedBox(width: number, height: number, angle: number): { width: number; height: number } {
  const a = (Math.abs(angle) % 180) * (Math.PI / 180);
  const s = Math.abs(Math.sin(a));
  const c = Math.abs(Math.cos(a));
  return { width: width * c + height * s, height: width * s + height * c };
}
