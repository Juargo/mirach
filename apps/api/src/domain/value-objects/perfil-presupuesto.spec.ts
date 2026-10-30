import { describe, expect, it } from 'vitest';
import { Bucket } from './bucket';
import {
  METAS_POR_DEFECTO,
  PERFILES_PREDEFINIDOS,
  PerfilPresupuesto,
} from './perfil-presupuesto';
import { MesFinanciero } from './mes-financiero';
import { PerfilNoSuma100Error } from '../errors/perfil-no-suma-100.error';
import { MetaPresupuestoInvalidaError } from '../errors/meta-presupuesto-invalida.error';

const metas = (necesidades: bigint, deseos: bigint, ahorro: bigint) => ({
  [Bucket.Necesidades]: necesidades,
  [Bucket.Deseos]: deseos,
  [Bucket.Ahorro]: ahorro,
});

describe('PerfilPresupuesto (#110, PER-03..PER-05)', () => {
  it.each([
    ['50_30_20', metas(5000n, 3000n, 2000n)],
    ['60_20_20', metas(6000n, 2000n, 2000n)],
    ['70_15_15', metas(7000n, 1500n, 1500n)],
    ['80_10_10', metas(8000n, 1000n, 1000n)],
  ] as const)(
    'predefined profile %s has its goals in basis points',
    (id, esperadas) => {
      const perfil = PerfilPresupuesto.predefinido(id);
      expect(perfil.perfil).toBe(id);
      expect(perfil.metas).toEqual(esperadas);
    },
  );

  it('offers exactly the four predefined profiles (PER-04: no fifth profile)', () => {
    expect(Object.keys(PERFILES_PREDEFINIDOS)).toEqual([
      '50_30_20',
      '60_20_20',
      '70_15_15',
      '80_10_10',
    ]);
  });

  it('every predefined profile sums 10000', () => {
    for (const m of Object.values(PERFILES_PREDEFINIDOS)) {
      expect(m[Bucket.Necesidades] + m[Bucket.Deseos] + m[Bucket.Ahorro]).toBe(
        10000n,
      );
    }
  });

  it('the default profile is 50/30/20', () => {
    expect(PerfilPresupuesto.porDefecto().perfil).toBe('50_30_20');
    expect(METAS_POR_DEFECTO).toEqual(metas(5000n, 3000n, 2000n));
  });

  it('a custom profile that sums 10000 is accepted', () => {
    const r = PerfilPresupuesto.personalizado(metas(5500n, 2500n, 2000n));
    expect(r.isOk()).toBe(true);
    expect(r.getValue().perfil).toBe('personalizado');
    expect(r.getValue().metas).toEqual(metas(5500n, 2500n, 2000n));
  });

  it('a custom profile 60/30/20 fails with PerfilNoSuma100Error', () => {
    const r = PerfilPresupuesto.personalizado(metas(6000n, 3000n, 2000n));
    expect(r.isFail()).toBe(true);
    expect(r.getError()).toBeInstanceOf(PerfilNoSuma100Error);
  });

  it('a custom profile below 100% also fails with PerfilNoSuma100Error', () => {
    const r = PerfilPresupuesto.personalizado(metas(5000n, 3000n, 1999n));
    expect(r.getError()).toBeInstanceOf(PerfilNoSuma100Error);
  });

  it('a negative goal fails with MetaPresupuestoInvalidaError even if the sum is 10000', () => {
    const r = PerfilPresupuesto.personalizado(metas(11000n, -1000n, 0n));
    expect(r.getError()).toBeInstanceOf(MetaPresupuestoInvalidaError);
  });

  it('a goal of 0 is allowed', () => {
    const r = PerfilPresupuesto.personalizado(metas(10000n, 0n, 0n));
    expect(r.isOk()).toBe(true);
  });

  it('desdePersistencia rebuilds a predefined profile', () => {
    const r = PerfilPresupuesto.desdePersistencia(
      '80_10_10',
      metas(8000n, 1000n, 1000n),
    );
    expect(r.getValue().perfil).toBe('80_10_10');
  });

  it('desdePersistencia rejects predefined ids whose stored goals do not match', () => {
    const r = PerfilPresupuesto.desdePersistencia(
      '80_10_10',
      metas(5000n, 3000n, 2000n),
    );
    expect(r.isFail()).toBe(true);
  });

  it('desdePersistencia rejects an unknown profile id', () => {
    const r = PerfilPresupuesto.desdePersistencia(
      '90_5_5',
      metas(9000n, 500n, 500n),
    );
    expect(r.isFail()).toBe(true);
  });

  describe('financial month (#111)', () => {
    it('defaults to the calendar month with no declared income', () => {
      const perfil = PerfilPresupuesto.porDefecto();
      expect(perfil.mesFinanciero.diaCorte.valor).toBe(1);
      expect(perfil.mesFinanciero.ingresoDeclarado).toBeNull();
    });

    it('conMesFinanciero keeps the goals and replaces the financial month', () => {
      const mes = MesFinanciero.crear(25, 900_000n).getValue();
      const perfil =
        PerfilPresupuesto.predefinido('60_20_20').conMesFinanciero(mes);
      expect(perfil.perfil).toBe('60_20_20');
      expect(perfil.metas).toEqual(PERFILES_PREDEFINIDOS['60_20_20']);
      expect(perfil.mesFinanciero).toBe(mes);
    });
  });
});
