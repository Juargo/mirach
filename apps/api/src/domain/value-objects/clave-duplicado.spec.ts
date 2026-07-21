import { construirClaveDuplicado, ClaveDuplicadoInput } from './clave-duplicado';

function makeInput(overrides: Partial<ClaveDuplicadoInput> = {}): ClaveDuplicadoInput {
  return {
    fecha: new Date('2026-07-01T00:00:00.000Z'),
    descripcion: 'COMPRA LIDER',
    cargo: '5000',
    abono: '0',
    ...overrides,
  };
}

describe('construirClaveDuplicado — identidad', () => {
  it('tuplas idénticas producen la misma clave', () => {
    const a = construirClaveDuplicado(makeInput());
    const b = construirClaveDuplicado(makeInput());
    expect(a).toBe(b);
  });
});

describe('construirClaveDuplicado — cada campo distingue la clave', () => {
  it('fecha distinta → clave distinta', () => {
    const a = construirClaveDuplicado(makeInput());
    const b = construirClaveDuplicado(makeInput({ fecha: new Date('2026-07-02T00:00:00.000Z') }));
    expect(a).not.toBe(b);
  });

  it('descripcion distinta → clave distinta', () => {
    const a = construirClaveDuplicado(makeInput());
    const b = construirClaveDuplicado(makeInput({ descripcion: 'COMPRA JUMBO' }));
    expect(a).not.toBe(b);
  });

  it('cargo distinto → clave distinta', () => {
    const a = construirClaveDuplicado(makeInput());
    const b = construirClaveDuplicado(makeInput({ cargo: '5001' }));
    expect(a).not.toBe(b);
  });

  it('abono distinto → clave distinta', () => {
    const a = construirClaveDuplicado(makeInput({ cargo: '0', abono: '1000' }));
    const b = construirClaveDuplicado(makeInput({ cargo: '0', abono: '1001' }));
    expect(a).not.toBe(b);
  });
});

describe('construirClaveDuplicado — exactitud BigInt del dinero', () => {
  it('String(number) y bigint.toString() producen la misma clave para montos iguales', () => {
    const desdeNumber = construirClaveDuplicado(makeInput({ cargo: String(5000), abono: String(0) }));
    const desdeBigint = construirClaveDuplicado(makeInput({ cargo: (5000n).toString(), abono: (0n).toString() }));
    expect(desdeNumber).toBe(desdeBigint);
  });

  it('montos cercanos a Number.MAX_SAFE_INTEGER siguen matcheando exactamente', () => {
    const monto = Number.MAX_SAFE_INTEGER - 1;
    const desdeNumber = construirClaveDuplicado(makeInput({ cargo: String(monto), abono: '0' }));
    const desdeBigint = construirClaveDuplicado(
      makeInput({ cargo: BigInt(monto).toString(), abono: '0' }),
    );
    expect(desdeNumber).toBe(desdeBigint);
  });

  it('diferencia de 1 unidad monetaria produce clave distinta (nunca redondeo float)', () => {
    const a = construirClaveDuplicado(makeInput({ cargo: '5000' }));
    const b = construirClaveDuplicado(makeInput({ cargo: '5001' }));
    expect(a).not.toBe(b);
  });
});

describe('construirClaveDuplicado — seguridad del delimitador', () => {
  it('descripcion con "|" no crea colisión falsa con una tupla numérica distinta', () => {
    // Si el delimitador no estuviera protegido, una descripcion con "|" podría
    // "correr" el límite de un campo previo y colisionar con otra tupla.
    const conDelimitador = construirClaveDuplicado(
      makeInput({ descripcion: '5001|0|RESTO', cargo: '5000', abono: '0' }),
    );
    const otraTupla = construirClaveDuplicado(makeInput({ cargo: '5001', abono: '0', descripcion: '0|RESTO' }));
    expect(conDelimitador).not.toBe(otraTupla);
  });
});

describe('construirClaveDuplicado — coincidencia exacta, sin normalización', () => {
  it('diferencias de mayúsculas/espacios en la descripcion NO son iguales', () => {
    const a = construirClaveDuplicado(makeInput({ descripcion: 'COMPRA LIDER' }));
    const b = construirClaveDuplicado(makeInput({ descripcion: 'compra lider' }));
    expect(a).not.toBe(b);

    const c = construirClaveDuplicado(makeInput({ descripcion: '  COMPRA LIDER  ' }));
    expect(a).not.toBe(c);
  });
});
