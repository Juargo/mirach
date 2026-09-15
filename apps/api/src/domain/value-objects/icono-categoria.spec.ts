import { describe, it, expect } from 'vitest';
import { ICONOS_CATEGORIA, esIconoCategoria } from './icono-categoria';

describe('ICONOS_CATEGORIA', () => {
  it('tiene exactamente 24 nombres únicos (CATICO-01)', () => {
    expect(ICONOS_CATEGORIA).toHaveLength(24);
    expect(new Set(ICONOS_CATEGORIA).size).toBe(24);
  });

  it('cada nombre es un identificador lucide kebab-case (minúsculas, dígitos, guiones)', () => {
    for (const nombre of ICONOS_CATEGORIA) {
      expect(nombre).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('esIconoCategoria', () => {
  it('true para un nombre presente en la allowlist', () => {
    expect(esIconoCategoria('shopping-cart')).toBe(true);
    expect(esIconoCategoria('piggy-bank')).toBe(true);
  });

  it('false para un nombre lucide real pero ausente de la allowlist (CATICO-01)', () => {
    // 'home' es un export real de lucide (alias deprecado) pero no está
    // en la allowlist curada — debe rechazarse igual que cualquier string.
    expect(esIconoCategoria('home')).toBe(false);
  });

  it('false para un string arbitrario que no es un icono lucide', () => {
    expect(esIconoCategoria('not-a-real-icon')).toBe(false);
  });

  it('false para valores no-string (undefined, null, number)', () => {
    expect(esIconoCategoria(undefined)).toBe(false);
    expect(esIconoCategoria(null)).toBe(false);
    expect(esIconoCategoria(42)).toBe(false);
  });
});
