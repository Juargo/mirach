import { rangoFechas, marcarDuplicados } from './marcar-duplicados.helper';
import { TransaccionExistente } from '../ports/transaccion-existente-reader.port';
import { Transaccion } from '../../domain/value-objects/transaccion';

/** Construye una Transaccion de prueba con valores mínimos. */
function makeTx(overrides: {
  fecha?: Date;
  descripcion?: string;
  cargo?: bigint;
  abono?: bigint;
}): Transaccion {
  return Transaccion.crear({
    fecha: overrides.fecha ?? new Date('2024-01-15'),
    descripcion: overrides.descripcion ?? 'Supermercado',
    cargo: overrides.cargo ?? 1000n,
    abono: overrides.abono ?? 0n,
  }).getValue();
}

/** Construye una TransaccionExistente (ya persistida) de prueba. */
function makeExistente(overrides: {
  fecha?: Date;
  descripcion?: string;
  cargo?: bigint;
  abono?: bigint;
}): TransaccionExistente {
  return {
    fecha: overrides.fecha ?? new Date('2024-01-15'),
    descripcion: overrides.descripcion ?? 'Supermercado',
    cargo: overrides.cargo ?? 1000n,
    abono: overrides.abono ?? 0n,
  };
}

describe('rangoFechas', () => {
  it('retorna desde y hasta con una sola transacción', () => {
    const fecha = new Date('2024-01-15');
    const txs = [makeTx({ fecha })];

    const resultado = rangoFechas(txs);

    expect(resultado.desde).toEqual(fecha);
    expect(resultado.hasta).toEqual(fecha);
  });

  it('retorna la fecha mínima en desde y la máxima en hasta con múltiples transacciones', () => {
    const fechaMin = new Date('2024-01-01');
    const fechaMed = new Date('2024-01-15');
    const fechaMax = new Date('2024-01-31');
    const txs = [
      makeTx({ fecha: fechaMed }),
      makeTx({ fecha: fechaMin }),
      makeTx({ fecha: fechaMax }),
    ];

    const resultado = rangoFechas(txs);

    expect(resultado.desde).toEqual(fechaMin);
    expect(resultado.hasta).toEqual(fechaMax);
  });

  it('lanza cuando el arreglo está vacío (contrato: no llamar con arreglo vacío)', () => {
    // El caller debe verificar que hay transacciones antes de llamar a rangoFechas
    expect(() => rangoFechas([])).toThrow();
  });

  it('preserva el orden de las fechas independientemente del orden del input', () => {
    const txs = [
      makeTx({ fecha: new Date('2024-03-20') }),
      makeTx({ fecha: new Date('2024-01-05') }),
      makeTx({ fecha: new Date('2024-06-15') }),
      makeTx({ fecha: new Date('2024-02-28') }),
    ];

    const resultado = rangoFechas(txs);

    expect(resultado.desde).toEqual(new Date('2024-01-05'));
    expect(resultado.hasta).toEqual(new Date('2024-06-15'));
  });
});

describe('marcarDuplicados', () => {
  it('retorna todo false cuando existentes está vacío (no hay con qué comparar)', () => {
    const txs = [
      makeTx({
        fecha: new Date('2024-01-15'),
        descripcion: 'Super',
        cargo: 1000n,
        abono: 0n,
      }),
      makeTx({
        fecha: new Date('2024-01-16'),
        descripcion: 'Farmacia',
        cargo: 500n,
        abono: 0n,
      }),
    ];

    const resultado = marcarDuplicados([], txs);

    expect(resultado).toEqual([false, false]);
  });

  it('retorna arreglo vacío cuando transacciones está vacío', () => {
    const existentes = [makeExistente({})];

    const resultado = marcarDuplicados(existentes, []);

    expect(resultado).toEqual([]);
  });

  it('marca como true las transacciones que coinciden por clave natural (fecha+descripcion+cargo+abono)', () => {
    const fecha = new Date('2024-01-15');
    const existentes = [
      makeExistente({
        fecha,
        descripcion: 'Supermercado',
        cargo: 1000n,
        abono: 0n,
      }),
    ];
    const txs = [
      makeTx({ fecha, descripcion: 'Supermercado', cargo: 1000n, abono: 0n }),
      makeTx({ fecha, descripcion: 'Farmacia', cargo: 500n, abono: 0n }),
    ];

    const resultado = marcarDuplicados(existentes, txs);

    expect(resultado[0]).toBe(true);
    expect(resultado[1]).toBe(false);
  });

  it('preserva el orden del input (el índice corresponde a la posición original)', () => {
    const fecha = new Date('2024-01-15');
    const existentes = [
      makeExistente({ fecha, descripcion: 'B', cargo: 200n, abono: 0n }),
    ];
    const txs = [
      makeTx({ fecha, descripcion: 'A', cargo: 100n, abono: 0n }),
      makeTx({ fecha, descripcion: 'B', cargo: 200n, abono: 0n }),
      makeTx({ fecha, descripcion: 'C', cargo: 300n, abono: 0n }),
    ];

    const resultado = marcarDuplicados(existentes, txs);

    expect(resultado).toHaveLength(3);
    expect(resultado[0]).toBe(false);
    expect(resultado[1]).toBe(true);
    expect(resultado[2]).toBe(false);
  });

  it('usa construirClaveDuplicado: bigint cargo/abono de existente vs bigint de tx entrante coinciden', () => {
    const fecha = new Date('2024-01-20');
    // El existente tiene cargo en bigint (viene del lado persistido)
    const existentes = [
      makeExistente({
        fecha,
        descripcion: 'Cafetería',
        cargo: 2500n,
        abono: 0n,
      }),
    ];
    // La tx entrante también tiene cargo en bigint (normalizado)
    const txs = [
      makeTx({ fecha, descripcion: 'Cafetería', cargo: 2500n, abono: 0n }),
    ];

    const resultado = marcarDuplicados(existentes, txs);

    expect(resultado[0]).toBe(true);
  });

  it('trata dos entradas con arreglos vacíos (edge case simétrico)', () => {
    const resultado = marcarDuplicados([], []);

    expect(resultado).toEqual([]);
  });

  it('retorna arreglo de la misma longitud que transacciones', () => {
    const txs = [
      makeTx({
        fecha: new Date('2024-01-15'),
        descripcion: 'TxA',
        cargo: 100n,
        abono: 0n,
      }),
      makeTx({
        fecha: new Date('2024-01-15'),
        descripcion: 'TxB',
        cargo: 200n,
        abono: 0n,
      }),
      makeTx({
        fecha: new Date('2024-01-15'),
        descripcion: 'TxC',
        cargo: 300n,
        abono: 0n,
      }),
      makeTx({
        fecha: new Date('2024-01-15'),
        descripcion: 'TxD',
        cargo: 400n,
        abono: 0n,
      }),
      makeTx({
        fecha: new Date('2024-01-15'),
        descripcion: 'TxE',
        cargo: 500n,
        abono: 0n,
      }),
    ];

    const resultado = marcarDuplicados([], txs);

    expect(resultado).toHaveLength(5);
  });

  it('maneja múltiples duplicados en el mismo batch', () => {
    const fecha = new Date('2024-01-15');
    const existentes = [
      makeExistente({ fecha, descripcion: 'Super', cargo: 1000n, abono: 0n }),
      makeExistente({
        fecha,
        descripcion: 'Cafetería',
        cargo: 500n,
        abono: 0n,
      }),
    ];
    const txs = [
      makeTx({ fecha, descripcion: 'Super', cargo: 1000n, abono: 0n }), // dup
      makeTx({ fecha, descripcion: 'Farmacia', cargo: 300n, abono: 0n }), // nueva
      makeTx({ fecha, descripcion: 'Cafetería', cargo: 500n, abono: 0n }), // dup
    ];

    const resultado = marcarDuplicados(existentes, txs);

    expect(resultado).toEqual([true, false, true]);
  });
});
