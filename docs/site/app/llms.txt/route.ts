import { llmsTxt, TEXT_CONTENT_TYPE } from '../../lib/ai-docs';

// `/llms.txt`: a static file in export mode,
// a cached route in `next dev` and `next start`.
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(llmsTxt(), { headers: { 'content-type': TEXT_CONTENT_TYPE } });
}
