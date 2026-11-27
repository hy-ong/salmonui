import { getMarkdownPages, MARKDOWN_CONTENT_TYPE } from '../../../lib/ai-docs';

// The Markdown version of every `/docs` page.
// The public URL is the page URL plus `.md`: in `next dev` / `next start` a
// `beforeFiles` rewrite (next.config.mjs) maps `/<page>.md` here, and in the
// static export `build-export.mjs` moves `out/markdown/<page>.md` to
// `out/<page>.md`. A route handler cannot live beside the HTML page's
// dynamic segment, hence the separate `/markdown` tree.
export const dynamic = 'force-static';
export const dynamicParams = false;

type Params = { path: string[] };

export function generateStaticParams(): Params[] {
  return getMarkdownPages().map((page) => ({ path: page.markdown.slice(1).split('/') }));
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }): Promise<Response> {
  const wanted = `/${(await params).path.join('/')}`;
  const page = getMarkdownPages().find((candidate) => candidate.markdown === wanted);
  if (!page) return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(page.render(), { headers: { 'content-type': MARKDOWN_CONTENT_TYPE } });
}
