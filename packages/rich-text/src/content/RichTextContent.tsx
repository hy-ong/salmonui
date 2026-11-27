// RichTextContent: renders
// stored HTML (or BlockEditor blocks) read-only. The markup is computed by the
// pure, DOM-free sanitizer, so server and client render the same string and
// hydration never differs. No ProseMirror is loaded.

import { useMemo, type CSSProperties, type HTMLAttributes, type Ref } from 'react';
import { sanitizeHtml, type SanitizeHook } from '../html/sanitize.js';
import { blocksToHtml } from '../blocks/to-html.js';
import type { Block } from '../blocks/types.js';

export interface RichTextContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> {
  /** Stored HTML (for example a RichTextEditor value). Sanitized before rendering. */
  value?: string;
  /** BlockEditor blocks; rendered through `blocksToHtml` when `value` is not given. */
  blocks?: readonly Block[];
  /** Hostnames whose iframe embeds are kept (see `SanitizeHtmlOptions.embedHosts`). */
  embedHosts?: readonly string[];
  /** Further sanitizer restriction (see `SanitizeHook`); keep it stable (module scope or memoized). */
  sanitize?: SanitizeHook;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

/** Read-only rendering of rich text content; root class `salmon-rich-text-content`. */
export function RichTextContent(props: RichTextContentProps) {
  const { value, blocks, embedHosts, sanitize, className, ref, ...rest } = props;
  const hostsKey = embedHosts ? embedHosts.join('\n') : '';
  const html = useMemo(() => {
    const source = value ?? (blocks ? blocksToHtml(blocks) : '');
    const hosts = hostsKey ? hostsKey.split('\n') : [];
    return sanitizeHtml(source, { embedHosts: hosts, ...(sanitize ? { sanitize } : {}) });
  }, [value, blocks, hostsKey, sanitize]);
  return (
    <div
      {...rest}
      ref={ref}
      className={className ? `salmon-rich-text-content ${className}` : 'salmon-rich-text-content'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
