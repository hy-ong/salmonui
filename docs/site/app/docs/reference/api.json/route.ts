import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The generated API reference, verbatim: `generated/api.json` at a stable URL. `next dev`,
// `next build` and `next start` run with the site directory as cwd;
// predev / prebuild write the file.
export const dynamic = 'force-static';

export function GET(): Response {
  const body = readFileSync(join(process.cwd(), 'generated', 'api.json'));
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
