// HTML in and out of the editor without ProseMirror (server and client share
// it, so SSR markup and getHtml agree): the always-on sanitizer with the
// extensions' allow-lists and paragraphs written as <div> for
// `enterKey: 'div'`.
import { parseHtml, sanitizeHtml, serializeHtml, type HtmlNode, type SanitizeAllow, type SanitizeHook } from '../html/index.js';
import type { RichTextExtension } from './types.js';

export interface HtmlPolicy {
  readonly embedHosts?: readonly string[] | undefined;
  readonly sanitize?: SanitizeHook | undefined;
  readonly extensions?: readonly RichTextExtension[] | undefined;
}

export function extensionAllow(extensions: readonly RichTextExtension[] | undefined): SanitizeAllow[] {
  return (extensions ?? []).flatMap((e) => (e.html ? [e.html] : []));
}

export function sanitizeFor(html: string, policy: HtmlPolicy): string {
  const allow = extensionAllow(policy.extensions);
  return sanitizeHtml(html, {
    ...(policy.embedHosts ? { embedHosts: policy.embedHosts } : {}),
    ...(policy.sanitize ? { sanitize: policy.sanitize } : {}),
    ...(allow.length ? { allow } : {}),
  });
}

function rename(nodes: HtmlNode[]): HtmlNode[] {
  return nodes.map((n) => (n.type === 'element' ? { ...n, tag: n.tag === 'p' ? 'div' : n.tag, children: rename(n.children) } : n));
}

/** Writes every paragraph as `<div>` (sanitized input; the sanitizer reads such divs back as paragraphs). */
export function paragraphsAsDiv(html: string): string {
  return html.includes('<p') ? serializeHtml(rename(parseHtml(html))) : html;
}
