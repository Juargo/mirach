import type { Request } from 'express';
import { esDemoDeSesion } from './es-demo-de-sesion';

function reqCon(esDemo: boolean | undefined): Request {
  return { esDemo } as unknown as Request;
}

describe('esDemoDeSesion — fail-closed default (issue #507)', () => {
  it('retorna true cuando req.esDemo es undefined (no se puede probar que NO es demo)', () => {
    expect(esDemoDeSesion(reqCon(undefined))).toBe(true);
  });

  it('retorna false cuando sessionMiddleware puso esDemo: false (sesión real, no-demo)', () => {
    expect(esDemoDeSesion(reqCon(false))).toBe(false);
  });

  it('retorna true cuando sessionMiddleware puso esDemo: true (sesión demo real)', () => {
    expect(esDemoDeSesion(reqCon(true))).toBe(true);
  });
});
