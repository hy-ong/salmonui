// The site's only markdown renderer: docs
// pages, demo Notes and any static landing copy go
// through `renderMarkdown`. Server-only; it runs at build/render time.
//
// One shared `Marked` instance; per-call state (the heading slugger and the
// table of contents) lives in the tokens of that call, never on the instance
// or in module state.
import { Marked, Renderer, type Token, type Tokens } from 'marked';
import { highlight } from 'sugar-high';
import { siteRepoUrl } from './site-config';

export type TocEntry = { id: string; text: string; depth: 2 | 3 };
export type RenderedMarkdown = { html: string; toc: TocEntry[] };

/** Heading id function shared by every render of one page (and by the search index). */
export type Slugger = (text: string) => string;

export type RenderOptions = {
  /**
   * Repository-relative directory of the markdown source (for example
   * `docs/site/content` or `docs/data-grid`), used to resolve relative links.
   * Defaults to `docs/site/content`.
   */
  sourceDir?: string;
  /**
   * Slugger to share heading ids across several renders of one page (a docs
   * page is rendered in segments split at demo markers). Defaults to a new
   * one per call.
   */
  slugger?: Slugger;
};

/** Lower-case, runs of non-alphanumerics to `-`, trimmed. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'section' : slug;
}

/** A slugger that deduplicates repeated ids with `-2`, `-3`, ... */
export function createSlugger(): Slugger {
  const seen = new Map<string, number>();
  return (text) => {
    const base = slugify(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Fence languages highlighted at build time, mapped to `sugar-high` grammars. */
const HIGHLIGHT_LANGUAGES: Readonly<Record<string, 'typescript' | 'javascript' | 'json'>> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  javascript: 'javascript',
  json: 'json',
};

/**
 * `sugar-high` writes `style="color:var(--sh-*)"` on every token span; the
 * site colors tokens by class in `app/code.css` instead, so the inline
 * styles, empty spans and whitespace-only spans are dropped to keep the
 * HTML small.
 */
function highlightCode(code: string, lang: 'typescript' | 'javascript' | 'json'): string {
  return highlight(code, { lang })
    .replace(/ style="color:var\(--sh-[a-z-]+\)"/g, '')
    .replace(/<span class="sh__token--[a-z-]+"><\/span>/g, '')
    .replace(/<span class="sh__token--space">([^<]*)<\/span>/g, '$1');
}

/**
 * Code block hook: every fenced block in markdown and every demo Source panel
 * renders through this function. It returns the complete `<pre>` markup.
 * `ts`, `tsx`, `js`, `jsx` and `json` (and their aliases) are highlighted at
 * build time with `sugar-high` into `sh__line` / `sh__token--*` spans styled
 * by `app/code.css`; other languages render escaped and unhighlighted. No
 * client JavaScript is involved.
 */
export function renderCodeBlock(code: string, lang?: string): string {
  const language = lang?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const className = language === '' ? '' : ` class="language-${escapeHtml(language)}"`;
  const grammar = HIGHLIGHT_LANGUAGES[language];
  if (grammar === undefined) return `<pre class="code-block"><code${className}>${escapeHtml(code)}</code></pre>\n`;
  return `<pre class="code-block code-block--highlighted"><code${className}>${highlightCode(code, grammar)}</code></pre>\n`;
}

// --- Link rewriting ---------------------------------------------------------

const CONTENT_DIR = 'docs/site/content';

/** Posix-normalizes `dir/relative`; returns undefined when the path leaves the repository. */
function resolveRepoPath(dir: string, relative: string): string | undefined {
  const parts = relative.startsWith('/') ? [] : dir.split('/').filter(Boolean);
  for (const part of relative.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

type LinkTarget = { href: string } | { plain: true };

/**
 * Maps a markdown link to a site URL: docs content files to `/docs/<slug>`,
 * other repository files to `SITE_REPO_URL` blobs (or plain text when it is unset). Absolute
 * URLs, site paths and `#anchor` links are kept.
 */
export function rewriteLink(href: string, sourceDir: string = CONTENT_DIR): LinkTarget {
  if (href === '' || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return { href };
  const hashAt = href.indexOf('#');
  const path = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const hash = hashAt >= 0 ? href.slice(hashAt) : '';
  // Root-relative site paths (`/docs/x`, `/demos/y`) are already site URLs.
  if (path.startsWith('/') && !path.endsWith('.md')) return { href };
  const repoPath = resolveRepoPath(sourceDir, path);
  if (repoPath === undefined) return { plain: true };
  const content = new RegExp(`^${CONTENT_DIR}/([a-z0-9-]+)\\.md$`).exec(repoPath);
  if (content) return { href: `/docs/data-grid/${content[1]}${hash}` };
  return siteRepoUrl ? { href: `${siteRepoUrl}/blob/main/${repoPath}${hash}` } : { plain: true };
}

// --- Renderer ---------------------------------------------------------------

type HeadingToken = Tokens.Heading & { salmonId?: string };
type LinkToken = Tokens.Link & { salmonPlain?: boolean };

const stripTags = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    heading(token) {
      const { salmonId } = token as HeadingToken;
      const inner = this.parser.parseInline(token.tokens);
      if (salmonId === undefined) return `<h${token.depth}>${inner}</h${token.depth}>\n`;
      return `<h${token.depth} id="${salmonId}"><a class="heading-anchor" href="#${salmonId}">${inner}</a></h${token.depth}>\n`;
    },
    link(token) {
      if ((token as LinkToken).salmonPlain) return this.parser.parseInline(token.tokens);
      return false;
    },
    code(token) {
      return renderCodeBlock(token.text.replace(/\n$/, ''), token.lang);
    },
    // Wide tables scroll inside their own box so a narrow viewport never
    // scrolls the whole page sideways.
    table(token) {
      return `<div class="table-scroll">${Renderer.prototype.table.call(this, token)}</div>\n`;
    },
  },
});

/** Renders markdown to HTML with h2/h3 ids and anchor links, rewritten links and a TOC. */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): RenderedMarkdown {
  const slugger = options.slugger ?? createSlugger();
  const sourceDir = options.sourceDir ?? CONTENT_DIR;
  const tokens = marked.lexer(markdown);
  const toc: TocEntry[] = [];
  marked.walkTokens(tokens, (token: Token) => {
    if (token.type === 'heading' && (token.depth === 2 || token.depth === 3)) {
      const heading = token as HeadingToken;
      const text = stripTags(marked.parseInline(heading.text) as string);
      heading.salmonId = slugger(text);
      toc.push({ id: heading.salmonId, text, depth: heading.depth as 2 | 3 });
    } else if (token.type === 'link') {
      const link = token as LinkToken;
      const target = rewriteLink(link.href, sourceDir);
      if ('plain' in target) link.salmonPlain = true;
      else link.href = target.href;
    }
  });
  return { html: marked.parser(tokens) as string, toc };
}
