import { EstadoIngesta } from '@prisma/client';

/**
 * W2 — guarda anti-drift del enum EstadoIngesta.
 *
 * La capa de aplicación NO importa `@prisma/client`; sus tests modelan el
 * estado con literales de string ('PENDIENTE'|'PROCESADA'|'FALLIDA'). Este
 * test de contrato (capa infra) falla si el enum Prisma deja de coincidir con
 * esos literales, protegiendo contra un drift silencioso entre capas.
 */
describe('EstadoIngesta enum contract (drift guard)', () => {
  it('coincide exactamente con los literales usados por la capa de aplicación', () => {
    expect(EstadoIngesta.PENDIENTE).toBe('PENDIENTE');
    expect(EstadoIngesta.PROCESADA).toBe('PROCESADA');
    expect(EstadoIngesta.FALLIDA).toBe('FALLIDA');
  });

  it('no expone estados adicionales inesperados', () => {
    expect(Object.values(EstadoIngesta).sort()).toEqual([
      'FALLIDA',
      'PENDIENTE',
      'PROCESADA',
    ]);
  });
});
