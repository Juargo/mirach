import request from 'supertest';
import { createApp } from './app';
import type { Container } from '../../composition/container';
import { buildTestEnv } from '../../../test/support/env.fixture';
import { getClientIp } from '../http/auth/client-ip';

/**
 * createApp — trust proxy (production hotfix).
 *
 * MoneyDiary's API sits behind exactly one reverse proxy hop (Render — see
 * CLAUDE.md: api.moneydiary.cl CNAME → Render, no Cloudflare/multi-proxy in
 * front). Without `app.set('trust proxy', 1)`, Express ignores
 * `X-Forwarded-For` entirely and resolves `request.ip` to the socket address
 * of the proxy itself — collapsing every IP-based rate limiter
 * (`login:ip:`, the demo limiter, `google:ip:`) toward a shared bucket
 * instead of the real client IP.
 *
 * This spec proves the app-level contract with a route appended to the
 * already-built app (no production route changes needed) so it stays a
 * hermetic supertest — no DB.
 */
describe('createApp — trust proxy', () => {
  const fakeContainer = {
    shutdown: async () => {},
  } as unknown as Container;

  it('resolves request.ip (and getClientIp) from X-Forwarded-For behind the Render reverse proxy', async () => {
    const app = createApp(fakeContainer, buildTestEnv());

    // Debug-only route observing how Express resolved request.ip — appended
    // after the app is built, so it never touches production routing.
    app.get('/__test-client-ip', (req, res) => {
      res.status(200).json({ ip: req.ip, viaHelper: getClientIp(req) });
    });

    const res = await request(app)
      .get('/__test-client-ip')
      .set('X-Forwarded-For', '203.0.113.7');

    expect(res.status).toBe(200);
    expect(res.body.ip).toBe('203.0.113.7');
    expect(res.body.viaHelper).toBe('203.0.113.7');
  });
});
