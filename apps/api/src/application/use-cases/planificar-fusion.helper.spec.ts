import {
  clasificarMovimientosUnidos,
  planificarCategorias,
  planificarPatrones,
  unirCuentas,
  type CuentaParaFusion,
  type MovimientoParaFusion,
} from './planificar-fusion.helper';
import { marcarCopiasPorClave } from './marcar-duplicados.helper';

function cuenta(
  id: string,
  over: Partial<CuentaParaFusion> = {},
): CuentaParaFusion {
  return {
    id,
    banco: 'BCI',
    tipoCuenta: 'corriente',
    numeroCuentaBlindIndex: 'bi-1',
    ...over,
  };
}

function mov(
  id: string,
  over: Partial<MovimientoParaFusion> = {},
): MovimientoParaFusion {
  return {
    id,
    fecha: new Date('2026-10-12'),
    descripcion: 'COPEC',
    cargo: 3500n,
    abono: 0n,
    ...over,
  };
}

describe('unirCuentas (S3a)', () => {
  it('une las cuentas con el mismo (banco, tipoCuenta, blind index) y mueve las demás', () => {
    const plan = unirCuentas(
      [
        cuenta('o1'),
        cuenta('o2', { banco: 'Santander' }),
        cuenta('o3', { tipoCuenta: 'vista' }),
        cuenta('o4', { numeroCuentaBlindIndex: 'bi-2' }),
      ],
      [cuenta('d1')],
    );

    expect(plan.unidas).toEqual([{ origenId: 'o1', destinoId: 'd1' }]);
    expect(plan.movidas).toEqual(['o2', 'o3', 'o4']);
  });

  it('un blind index nulo nunca coincide, ni con otro nulo', () => {
    const plan = unirCuentas(
      [cuenta('o1', { numeroCuentaBlindIndex: null })],
      [cuenta('d1', { numeroCuentaBlindIndex: null })],
    );

    expect(plan.unidas).toEqual([]);
    expect(plan.movidas).toEqual(['o1']);
  });

  it('la cuenta de movimientos manuales sigue la misma regla', () => {
    const manual = { banco: 'Manual', tipoCuenta: 'Manual' };
    const plan = unirCuentas(
      [cuenta('o1', manual)],
      [cuenta('d1', manual), cuenta('d2')],
    );

    expect(plan.unidas).toEqual([{ origenId: 'o1', destinoId: 'd1' }]);
    expect(plan.movidas).toEqual([]);
  });

  it('sin cuentas de origen no hay nada que unir ni mover', () => {
    expect(unirCuentas([], [cuenta('d1')])).toEqual({
      unidas: [],
      movidas: [],
    });
  });
});

describe('clasificarMovimientosUnidos (S3b)', () => {
  it('descarta lo que ya existe en el destino y mueve el resto', () => {
    const resultado = clasificarMovimientosUnidos(
      [mov('d1')],
      [mov('o1'), mov('o2', { descripcion: 'LIDER' })],
    );

    expect(resultado.duplicadosIds).toEqual(['o1']);
    expect(resultado.movidosIds).toEqual(['o2']);
  });

  it('cuenta copias: dos movimientos idénticos son dos movimientos', () => {
    const resultado = clasificarMovimientosUnidos(
      [mov('d1')],
      [mov('o1'), mov('o2'), mov('o3')],
    );

    expect(resultado.duplicadosIds).toEqual(['o1']);
    expect(resultado.movidosIds).toEqual(['o2', 'o3']);
  });

  it('la misma clave que la ingesta: fecha, cargo, abono y descripción', () => {
    const resultado = clasificarMovimientosUnidos(
      [mov('d1')],
      [
        mov('o1', { fecha: new Date('2026-10-13') }),
        mov('o2', { cargo: 3501n }),
        mov('o3', { cargo: 0n, abono: 3500n }),
        mov('o4', { descripcion: 'copec' }),
      ],
    );

    expect(resultado.duplicadosIds).toEqual([]);
    expect(resultado.movidosIds).toEqual(['o1', 'o2', 'o3', 'o4']);
  });

  it('sin movimientos en el destino todo se mueve', () => {
    const resultado = clasificarMovimientosUnidos([], [mov('o1')]);

    expect(resultado.duplicadosIds).toEqual([]);
    expect(resultado.movidosIds).toEqual(['o1']);
  });
});

describe('planificarCategorias (S3d)', () => {
  it('reemplaza por (bucketId, nombre) y mueve las demás', () => {
    const plan = planificarCategorias(
      [
        { id: 'oc1', bucketId: 'b-nec', nombre: 'Supermercado' },
        { id: 'oc2', bucketId: 'b-des', nombre: 'Supermercado' },
        { id: 'oc3', bucketId: 'b-nec', nombre: 'Mascotas' },
      ],
      [{ id: 'dc1', bucketId: 'b-nec', nombre: 'Supermercado' }],
    );

    expect(plan.reemplazos).toEqual([{ origenId: 'oc1', destinoId: 'dc1' }]);
    expect(plan.movidasIds).toEqual(['oc2', 'oc3']);
  });
});

describe('planificarPatrones (S3e)', () => {
  const destino = [{ id: 'dp1', patron: 'Café', categoriaId: 'dc1' }];

  it('descarta el patrón cuyo texto ya existe, con el mismo plegado de la creación', () => {
    const plan = planificarPatrones(
      [
        { id: 'op1', patron: '  CAFE ', categoriaId: 'oc1' },
        { id: 'op2', patron: 'farmacia', categoriaId: 'oc1' },
      ],
      destino,
    );

    expect(plan.descartadosIds).toEqual(['op1']);
    expect(plan.movidosIds).toEqual(['op2']);
  });

  it('sin patrones en el destino todos se mueven', () => {
    const plan = planificarPatrones(
      [{ id: 'op1', patron: 'cafe', categoriaId: 'oc1' }],
      [],
    );

    expect(plan.descartadosIds).toEqual([]);
    expect(plan.movidosIds).toEqual(['op1']);
  });
});

describe('marcarCopiasPorClave', () => {
  it('consume las copias guardadas en el orden de las claves entrantes', () => {
    expect(marcarCopiasPorClave(['a', 'a', 'b'], ['a', 'a', 'a', 'c'])).toEqual(
      [true, true, false, false],
    );
  });
});
