import type { APIRoute } from 'astro';
import { buildInfo } from '../lib/build-info';

// Emitted as a static /version.json file at build time.
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildInfo, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
