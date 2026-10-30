import { describe, expect, it } from 'vitest';
import { DiaCorte, MesFinanciero } from './mes-financiero';
import { DiaCorteInvalidoError } from '../errors/dia-corte-invalido.error';
import { IngresoDeclaradoInvalidoError } from '../errors/ingreso-declarado-invalido.error';

describe('DiaCorte (#111, PER-08)', () => {
  it.each([1, 15, 25, 28])('accepts day %i', (dia) => {
    const resultado = DiaCorte.crear(dia);
    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue().valor).toBe(dia);
  });

  it.each([0, 29, 31, -1, 1.5, Number.NaN])('rejects day %s', (dia) => {
    const resultado = DiaCorte.crear(dia);
    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(DiaCorteInvalidoError);
  });

  it('defaults to the calendar month (day 1)', () => {
    expect(DiaCorte.CALENDARIO.valor).toBe(1);
    expect(DiaCorte.CALENDARIO.esCalendario).toBe(true);
    expect(DiaCorte.crear(25).getValue().esCalendario).toBe(false);
  });
});

describe('MesFinanciero (#111, PER-02, PER-08)', () => {
  it('defaults to day 1 and no declared income', () => {
    const mes = MesFinanciero.porDefecto();
    expect(mes.diaCorte.valor).toBe(1);
    expect(mes.ingresoDeclarado).toBeNull();
  });

  it('keeps a cut-off day and a positive declared income', () => {
    const resultado = MesFinanciero.crear(25, 1_500_000n);
    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue().diaCorte.valor).toBe(25);
    expect(resultado.getValue().ingresoDeclarado).toBe(1_500_000n);
  });

  it('accepts no declared income', () => {
    const resultado = MesFinanciero.crear(1, null);
    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue().ingresoDeclarado).toBeNull();
  });

  it.each([0n, -1n])('rejects a declared income of %s', (monto) => {
    const resultado = MesFinanciero.crear(1, monto);
    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(IngresoDeclaradoInvalidoError);
  });

  it('rejects an invalid cut-off day', () => {
    const resultado = MesFinanciero.crear(29, null);
    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(DiaCorteInvalidoError);
  });
});
