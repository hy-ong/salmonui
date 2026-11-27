import { handleDemoApi } from '../../../lib/demo-api';

// Thin wrapper: the handler bodies live in lib/demo-api.ts, which the static
// export runs in the browser instead.
const handle = async (request: Request): Promise<Response> => (await handleDemoApi(request)) ?? new Response(null, { status: 404 });

export const GET = handle;
export const POST = handle;
