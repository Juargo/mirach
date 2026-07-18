import type { Request } from 'express';
import { obtenerIpCliente } from './client-ip';

/**
 * Pure helper — no session/guard involved. `request.ip` is what Express
 * computes once `app.set('trust proxy', 1)` is set (main.ts) — it already
 * resolves the real client IP behind exactly one trusted proxy hop, so this
 * helper trusts it instead of re-parsing `x-forwarded-for` by hand (that
 * hand-rolled parse ignored `trust proxy` entirely and trusted whatever the
 * client claimed as the leftmost hop — trivially spoofable).
 */
function requestMock(opts: { ip?: string; socketIp?: string }): Request {
  return {
    ip: opts.ip,
    socket: { remoteAddress: opts.socketIp },
  } as unknown as Request;
}

describe('obtenerIpCliente', () => {
  it('retorna request.ip cuando está presente (ya resuelto por Express vía trust proxy)', () => {
    const request = requestMock({ ip: '203.0.113.1' });

    expect(obtenerIpCliente(request)).toBe('203.0.113.1');
  });

  it('cae a socket.remoteAddress cuando request.ip no está presente', () => {
    const request = requestMock({ socketIp: '127.0.0.1' });

    expect(obtenerIpCliente(request)).toBe('127.0.0.1');
  });

  it('retorna "unknown" cuando ninguno está presente', () => {
    const request = requestMock({});

    expect(obtenerIpCliente(request)).toBe('unknown');
  });
});
