// Value policies of the sanitizer: inline style declarations with
// per-property value validation, URL schemes per use, and embed hosts.
// Server-safe; no DOM, no CSS or URL parser from the platform.

/** Parses a `style` attribute into lowercase property \u2192 trimmed value (first wins). */
export function parseStyle(style: string): Map<string, string> {
  const out = new Map<string, string>();
  let depth = 0;
  let quote = 0;
  let start = 0;
  const flush = (end: number): void => {
    const decl = style.slice(start, end);
    const colon = decl.indexOf(':');
    if (colon > 0) {
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim();
      if (prop && value && !out.has(prop)) out.set(prop, value);
    }
  };
  for (let i = 0; i < style.length; i++) {
    const c = style.charCodeAt(i);
    if (quote) {
      if (c === quote) quote = 0;
    } else if (c === 34 || c === 39) quote = c;
    else if (c === 40) depth++;
    else if (c === 41) depth = Math.max(0, depth - 1);
    else if (c === 59 && depth === 0) {
      flush(i);
      start = i + 1;
    }
  }
  flush(style.length);
  return out;
}

// Anything that can load a resource, run script or escape the declaration.
const DANGEROUS_VALUE = /[\\<>{}@;]|\/\*|url\s*\(|expression|javascript|vbscript|behavio(?:u)?r|-moz-binding|image-set|image\s*\(|element\s*\(|attr\s*\(|env\s*\(/i;
const IMPORTANT = /\s*!\s*important\s*$/i;

function base(value: string): string | null {
  const v = value.replace(IMPORTANT, '').trim().replace(/\s+/g, ' ');
  if (v === '' || v.length > 200 || DANGEROUS_VALUE.test(v)) return null;
  return v;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /^(?:rgba?|hsla?)\(\s*[-+0-9.%\s,/a-z]*\)$/i;
const NAMED = /^[a-z]{3,30}$/i;
const SALMON_VAR = /^var\(\s*--salmon-[a-z0-9-]+\s*\)$/i;
const LENGTH = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|pt|%)$/i;
const FONT_SIZE_KEYWORD = /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i;
const LINE_HEIGHT = /^(?:normal|(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|pt|%)?)$/i;
const FONT_FAMILY = /^[a-z0-9 _\-"',.]+$/i;
const FUNC_ARGS_UNITS = /^(?:rgba?|hsla?)\(\s*(?:[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:%|deg|turn|rad)?|none|[\s,/])*\)$/i;

/** Validates a CSS color: hex, rgb()/rgba()/hsl()/hsla(), named color or `var(--salmon-*)`. */
export function cleanColor(value: string): string | null {
  const v = base(value);
  if (v === null) return null;
  if (HEX.test(v) || NAMED.test(v) || SALMON_VAR.test(v)) return v;
  if (FUNC_COLOR.test(v) && FUNC_ARGS_UNITS.test(v)) return v;
  return null;
}

/** Validates a length in px, em, rem, pt or %. */
export function cleanLength(value: string): string | null {
  const v = base(value);
  return v !== null && (LENGTH.test(v) || v === '0') ? v : null;
}

/** Validates a `font-size`: a length or a size keyword. */
export function cleanFontSize(value: string): string | null {
  const v = base(value);
  if (v === null) return null;
  return LENGTH.test(v) || FONT_SIZE_KEYWORD.test(v) ? v : null;
}

/** Validates a `font-family` list (names only; quotes allowed, nothing else). */
export function cleanFontFamily(value: string): string | null {
  const v = base(value);
  if (v === null || !FONT_FAMILY.test(v)) return null;
  const parts = v.split(',').map((p) => p.trim());
  if (parts.some((p) => p === '' || /^["']?$/.test(p))) return null;
  // Balanced quotes per family.
  for (const p of parts) {
    const q = p.charAt(0);
    if ((q === '"' || q === "'") && !(p.length > 1 && p.endsWith(q) && p.slice(1, -1).indexOf(q) < 0)) return null;
    if (q !== '"' && q !== "'" && /["']/.test(p)) return null;
  }
  return parts.join(', ');
}

/** Validates a `line-height`: `normal`, a number, a length or a percentage. */
export function cleanLineHeight(value: string): string | null {
  const v = base(value);
  return v !== null && LINE_HEIGHT.test(v) ? v : null;
}

/** Validates a keyword against an allow-list (case-insensitive, returned lowercase). */
export function cleanKeyword(value: string, allowed: ReadonlySet<string>): string | null {
  const v = base(value);
  if (v === null) return null;
  const k = v.toLowerCase();
  return allowed.has(k) ? k : null;
}

/** Where a URL is used; each use has its own scheme allow-list. */
export type UrlUse = 'link' | 'image' | 'media' | 'embed';

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const IMAGE_SCHEMES = new Set(['http', 'https', 'blob']);
const MEDIA_SCHEMES = new Set(['http', 'https', 'blob']);
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif)(?:;[a-z0-9=._+-]+)*,[a-z0-9+/=%\s._-]*$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*$/i;

/**
 * Returns the URL to keep for `use`, or null when it is not allowed.
 * Leading and trailing whitespace and control characters are trimmed and
 * tabs and newlines removed, as browsers do, before the scheme is checked, so
 * `java&#x09;script:` or ` javascript:` are recognized and refused. Allowed:
 * http, https, mailto, tel and relative URLs (including `#` and `//`) for
 * links; http, https, blob, relative and `data:image/(png|jpeg|gif|webp|avif)`
 * for images; http, https, blob and relative for audio and video; embeds are
 * checked by {@link embedAllowed}.
 */
export function cleanUrl(raw: string, use: UrlUse): string | null {
  const v = raw.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  if (v.length > 100_000 && !v.startsWith('data:')) return null;
  if (CONTROL.test(v)) return null;
  const colon = v.indexOf(':');
  const sep = v.search(/[/?#]/);
  if (colon >= 0 && (sep < 0 || colon < sep)) {
    const scheme = v.slice(0, colon).toLowerCase();
    if (!SCHEME.test(scheme)) return null;
    if (use === 'link') return LINK_SCHEMES.has(scheme) ? v : null;
    if (use === 'image') {
      if (scheme === 'data') return DATA_IMAGE.test(v) ? v : null;
      return IMAGE_SCHEMES.has(scheme) ? v : null;
    }
    if (use === 'media') return MEDIA_SCHEMES.has(scheme) ? v : null;
    return scheme === 'https' || scheme === 'http' ? v : null;
  }
  if (use === 'embed') return null;
  // Relative URL. A backslash is a path separator in browsers; refuse `\\host`.
  if (/^\/\\|^\\/.test(v)) return null;
  return v;
}

/**
 * Whether an iframe `src` points at an allowed embed host. `embedHosts`
 * entries are exact hostnames (`www.youtube-nocookie.com`) or `*.example.com`
 * for any subdomain of `example.com`. Only http(s) URLs with no credentials
 * and no backslashes qualify.
 */
export function embedAllowed(src: string, embedHosts: readonly string[]): boolean {
  if (embedHosts.length === 0) return false;
  const m = /^https?:\/\/([^/?#]*)/i.exec(src);
  if (!m || src.indexOf('\\') >= 0) return false;
  const authority = m[1] as string;
  if (authority.indexOf('@') >= 0) return false;
  const host = authority.replace(/:\d+$/, '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  for (const entry of embedHosts) {
    const e = entry.toLowerCase();
    if (e.startsWith('*.')) {
      const suffix = e.slice(1);
      if (host.endsWith(suffix) && host.length > suffix.length) return true;
    } else if (host === e) return true;
  }
  return false;
}


// ---------------------------------------------------------------------------
// Extension allow-list: extensions may widen the vocabulary with
// their own elements and attributes, never with active content.
// ---------------------------------------------------------------------------

/**
 * Elements and attributes an editor extension adds to the vocabulary
 * (`RichTextExtension.html`). `attributes` maps a tag (an extension tag or a
 * vocabulary tag) to extra attribute names.
 */
export interface SanitizeAllow {
  readonly tags?: readonly string[];
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
}

/** Never allowed, whatever an extension declares: active content, embedding, forms, foreign markup. */
const NEVER_TAGS: ReadonlySet<string> = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'template', 'noscript', 'frame', 'frameset', 'link', 'meta', 'base',
  'svg', 'math', 'form', 'input', 'button', 'select', 'option', 'textarea', 'portal', 'noembed', 'noframes', 'xml', 'param',
  'head', 'title', 'html', 'body', 'canvas', 'source', 'track', 'xmp', 'plaintext', 'listing',
]);
/** Never allowed attributes (besides every `on*` handler): styles and URL carriers that skip {@link cleanUrl}. */
const NEVER_ATTRS: ReadonlySet<string> = new Set([
  'style', 'srcset', 'srcdoc', 'action', 'formaction', 'ping', 'background', 'data', 'codebase', 'xmlns', 'is', 'dynsrc', 'lowsrc',
  'manifest', 'nonce', 'autofocus', 'contenteditable',
]);
/** URL attributes an extension may allow; their values always go through {@link cleanUrl}. */
const URL_ATTRS: Readonly<Record<string, UrlUse>> = { href: 'link', cite: 'link', src: 'image', poster: 'image' };
const NAME = /^[a-z][a-z0-9-]{0,63}$/;

export interface CompiledAllow {
  readonly tags: ReadonlySet<string>;
  readonly attrs: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Whether an extension may allow this element name. */
export function allowableTag(tag: string): boolean {
  return NAME.test(tag) && !NEVER_TAGS.has(tag);
}

/** Whether an extension may allow this attribute name. */
export function allowableAttr(name: string): boolean {
  return NAME.test(name) && !name.startsWith('on') && !NEVER_ATTRS.has(name);
}

/** Validates and merges allow-lists; unsafe entries are dropped silently. */
export function compileAllow(allow: SanitizeAllow | readonly SanitizeAllow[] | undefined): CompiledAllow | null {
  const list = allow === undefined ? [] : Array.isArray(allow) ? (allow as readonly SanitizeAllow[]) : [allow as SanitizeAllow];
  const tags = new Set<string>();
  const attrs = new Map<string, Set<string>>();
  for (const entry of list) {
    for (const t of entry.tags ?? []) {
      const tag = t.toLowerCase();
      if (allowableTag(tag)) tags.add(tag);
    }
    for (const [t, names] of Object.entries(entry.attributes ?? {})) {
      const tag = t.toLowerCase();
      if (!allowableTag(tag)) continue;
      const set = attrs.get(tag) ?? new Set<string>();
      for (const n of names) {
        const name = n.toLowerCase();
        if (allowableAttr(name)) set.add(name);
      }
      attrs.set(tag, set);
    }
  }
  return tags.size || attrs.size ? { tags, attrs } : null;
}

/** The value of an extension-allowed attribute, or null (URLs are checked like the vocabulary's). */
export function cleanAllowedAttr(allow: CompiledAllow | null, tag: string, name: string, value: string): string | null {
  if (!allow?.attrs.get(tag)?.has(name)) return null;
  const use = URL_ATTRS[name];
  if (use) return cleanUrl(value, use);
  return value.length <= 2000 ? value : null;
}
