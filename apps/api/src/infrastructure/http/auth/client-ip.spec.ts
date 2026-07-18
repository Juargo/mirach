import type { Request } from 'express';
import { obtenerIpCliente } from './client-ip';

function requestMock(opts: { xForwardedFor?: string; socketIp?: string }): Request {
  return {
    headers: { 'x-forwarded-for': opts.xForwardedFor },
    socket: { remoteAddress: opts.socketIp },
  } as unknown as Request;
}

describe('obtenerIpCliente', () => {
  it('retorna el hop más a la izquierda de x-forwarded-for', () => {
    const request = requestMock({ xForwardedFor: '203.0.113.1, 10.0.0.1, 10.0.0.2' });

    expect(obtenerIpCliente(request)).toBe('203.0.113.1');
  });

  it('recorta espacios alrededor del hop', () => {
    const request = requestMock({ xForwardedFor: '  203.0.113.1  , 10.0.0.1' });

    expect(obtenerIpCliente(request)).toBe('203.0.113.1');
  });

  it('cae a socket.remoteAddress cuando no hay x-forwarded-for', () => {
    const request = requestMock({ socketIp: '127.0.0.1' });

    expect(obtenerIpCliente(request)).toBe('127.0.0.1');
  });

  it('retorna "unknown" cuando ninguno está presente', () => {
    const request = requestMock({});

    expect(obtenerIpCliente(request)).toBe('unknown');
  });
});
