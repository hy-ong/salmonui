import { buildSearchFiles } from '../../../lib/search-index';

// Build-time search index: `/search/manifest.json`
// and one `/search/<shard>.json` per shard. Static files in export mode, a
// cached route in `next dev` and `next start`.
export const dynamic = 'force-static';
export const dynamicParams = false;

type Params = { file: string };

// `next dev` serves this route per request, and the dialog asks for every
// shard at once on a query with no early match: one build serves the burst
// (a few seconds), so twenty shard requests do not rebuild the index twenty
// times; edits to the docs show up on the next burst.
const FRESH_MS = 5_000;
let cached: { files: ReturnType<typeof buildSearchFiles>; at: number } | null = null;
const files = (): ReturnType<typeof buildSearchFiles> => {
  const now = Date.now();
  if (!cached || now - cached.at > FRESH_MS) cached = { files: buildSearchFiles(), at: now };
  return cached.files;
};

export function generateStaticParams(): Params[] {
  const { shards } = files();
  return [{ file: 'manifest.json' }, ...shards.map((shard) => ({ file: `${shard.id}.json` }))];
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }): Promise<Response> {
  const { file } = await params;
  const built = files();
  if (file === 'manifest.json') return Response.json(built.manifest);
  const shard = built.shards.find((candidate) => `${candidate.id}.json` === file);
  if (!shard) return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return Response.json(shard);
}
