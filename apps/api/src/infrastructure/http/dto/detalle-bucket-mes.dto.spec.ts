import { Bucket } from '../../../domain/value-objects/bucket';
import type { ObtenerDetalleBucketMesResult } from '../../../application/use-cases/obtener-detalle-bucket-mes.use-case';
import type { TransaccionDetalleBucketMes } from '../../../application/services/agrupar-detalle-por-categoria';
import { aDetalleBucketMesDto } from './detalle-bucket-mes.dto';

// ──────────────────────────────────────────────────────────────────────────────
// US-051 PR2: `aDetalleBucketMesDto` — mapper spec (design §4 ledger, D-06).
// Mirrors `semaforo-detalle.dto.spec.ts`'s BigInt-safety discipline: money as
// decimal strings (CA-05/MBD-05), bp/meta as JS numbers (≤ 10000 ≪ 2^53), fecha
// via toISOString(). La PII de la cuenta ya NO existe en el TIPO de entrada
// (recortada en el borde de aplicación — gate PR1, MBD-08): este spec
// reconstruye esa proyección desde filas fuente CON PII y prueba que el DTO
// tampoco la re-materializa en el wire.
// ──────────────────────────────────────────────────────────────────────────────

/** Fila fuente con PII de cuenta — lo que el reader entregaba antes del trim. */
interface FilaFuente {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly cargo: bigint;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
}

/** Símil del recorte del borde de aplicación: monto = cargo, origen = banco
 *  verbatim (D-02), PII de cuenta (tipoCuenta/numeroCuenta) descartada. */
function recortar(fila: FilaFuente): TransaccionDetalleBucketMes {
  return {
    id: fila.id,
    fecha: fila.fecha,
    descripcion: fila.descripcion,
    origen: fila.banco || 'Manual',
    monto: fila.cargo,
  };
}

const PII: ReadonlyArray<FilaFuente> = [
  {
    id: 'tx-1',
    fecha: new Date('2026-07-03T00:00:00.000Z'),
    descripcion: 'Jumbo',
    cargo: 90000n,
    banco: 'BCI',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '12345678',
  },
  {
    id: 'tx-2',
    fecha: new Date('2026-07-15T00:00:00.000Z'),
    descripcion: 'Santa Isabel',
    cargo: 60000n,
    banco: 'BCI',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '12345678',
  },
  {
    id: 'tx-4',
    fecha: new Date('2026-07-10T00:00:00.000Z'),
    descripcion: 'Giro',
    cargo: 40000n,
    banco: 'BCI',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '12345678',
  },
];

function makeResult(
  overrides: Partial<Omit<ObtenerDetalleBucketMesResult, 'grupos'>> = {},
): ObtenerDetalleBucketMesResult {
  return {
    periodo: '2026-07',
    bucket: Bucket.Necesidades,
    total: 150000n,
    totalTransacciones: 2,
    totalCategorias: 1,
    porcentajeBp: 1667n,
    metaBp: 5000n,
    grupos: [
      {
        categoriaId: 'cat-comida',
        nombre: 'Comida',
        subtotal: 150000n,
        conteo: 2,
        transacciones: [recortar(PII[0]), recortar(PII[1])],
      },
      {
        categoriaId: null,
        nombre: 'Sin categoría',
        subtotal: 40000n,
        conteo: 1,
        transacciones: [recortar(PII[2])],
      },
    ],
    ...overrides,
  };
}

describe('aDetalleBucketMesDto', () => {
  it('serializa total/subtotal/monto como strings decimales (BigInt → string, MBD-05)', () => {
    const dto = aDetalleBucketMesDto(makeResult());

    expect(dto.total).toBe('150000');
    expect(typeof dto.total).toBe('string');
    expect(dto.grupos[0].subtotal).toBe('150000');
    expect(typeof dto.grupos[0].subtotal).toBe('string');
    expect(dto.grupos[0].transacciones[0].monto).toBe('90000');
    expect(typeof dto.grupos[0].transacciones[0].monto).toBe('string');
  });

  it('serializa porcentajeBp/metaBp como number, y preserva null (SinCategoria → ambos null, D-05)', () => {
    const dto = aDetalleBucketMesDto(makeResult());

    expect(dto.porcentajeBp).toBe(1667);
    expect(typeof dto.porcentajeBp).toBe('number');
    expect(dto.metaBp).toBe(5000);
    expect(typeof dto.metaBp).toBe('number');

    const sinMeta = aDetalleBucketMesDto(
      makeResult({ porcentajeBp: null, metaBp: null }),
    );
    expect(sinMeta.porcentajeBp).toBeNull();
    expect(sinMeta.metaBp).toBeNull();
  });

  it('monto === String(cargo) de la fila que lo produjo (MBD-02: monto = monto del cargo)', () => {
    const dto = aDetalleBucketMesDto(makeResult());

    expect(dto.grupos[0].transacciones[0].monto).toBe(String(PII[0].cargo));
    expect(dto.grupos[0].transacciones[1].monto).toBe(String(PII[1].cargo));
    expect(dto.grupos[1].transacciones[0].monto).toBe(String(PII[2].cargo));
  });

  it('MBD-08: la PII de CUENTA (tipoCuenta/numeroCuenta) está AUSENTE del DTO aunque las filas fuente la traían', () => {
    const dto = aDetalleBucketMesDto(makeResult());

    // Claves exactas de la transacción wire: {id, fecha, descripcion, origen, monto}.
    expect(Object.keys(dto.grupos[0].transacciones[0])).toEqual([
      'id',
      'fecha',
      'descripcion',
      'origen',
      'monto',
    ]);
    // La PII de cuenta (tipoCuenta/numeroCuenta) no sobrevive al JSON. `BCI`
    // SÍ sobrevive, pero solo como el valor de `origen` (D-02) — es la señal
    // esManual/nombre-de-banco que WEB-DEL-01 necesita, no PII.
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain('tipoCuenta');
    expect(serialized).not.toContain('numeroCuenta');
    expect(serialized).not.toContain('Cuenta Corriente');
    expect(serialized).not.toContain('12345678');
  });

  it('D-02: origen viaja verbatim = String(fila.banco) — mismo mirror que TransaccionIngresoMes.origen', () => {
    const dto = aDetalleBucketMesDto(makeResult());

    expect(dto.grupos[0].transacciones[0].origen).toBe('BCI');
  });

  it('fecha via ISO-8601 UTC toISOString() (convención bloqueada, ver movimiento-mes.dto.ts)', () => {
    const dto = aDetalleBucketMesDto(makeResult());

    expect(dto.grupos[0].transacciones[0].fecha).toBe(
      '2026-07-03T00:00:00.000Z',
    );
    expect(typeof dto.grupos[0].transacciones[0].fecha).toBe('string');
  });
});
