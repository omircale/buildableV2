import { handleApi } from './api';
import type { Env } from './db';

/**
 * The Worker in front of the site: /api/* is the app's server, everything else is the built app.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch {
        // Never a stack trace to the browser.
        return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
