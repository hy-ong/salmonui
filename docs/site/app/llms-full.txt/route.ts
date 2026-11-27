import { llmsFullTxt, TEXT_CONTENT_TYPE } from '../../lib/ai-docs';

// `/llms-full.txt`: every guide of every
// component as one Markdown text file.
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(llmsFullTxt(), { headers: { 'content-type': TEXT_CONTENT_TYPE } });
}
