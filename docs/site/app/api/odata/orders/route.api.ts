import { handleDemoApi } from '../../../../lib/demo-api';

// Thin wrapper: the handler body lives in lib/demo-api.ts, which the static
// export runs in the browser instead.
export const GET = async (request: Request): Promise<Response> => (await handleDemoApi(request)) ?? new Response(null, { status: 404 });
