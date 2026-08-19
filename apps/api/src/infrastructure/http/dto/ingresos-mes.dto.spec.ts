import type { ObtenerIngresosMesResult } from '../../../application/use-cases/obtener-ingresos-mes.use-case';
import type { TransaccionIngresoMes } from '../../../application/use-cases/obtener-ingresos-mes.use-case';
import { aIngresosMesDto, type IngresosMesDto } from './ingresos-mes.dto';

// ──────────────────────────────────────────────────────────────────────────────
// US-052 PR2: `aIngresosMesDto` — mapper spec (design §4 ledger, D-04).
// Mirrors `detalle-bucket-mes.dto.spec.ts`'s BigInt-safety discipline: money as
// decimal strings never floats (CA-05/MID-05), fecha via toISOString() (locked
// UTC convention), `origen` verbatim (CA-02). La PII de la cuenta ya NO existe
// en el TIPO de entrada (recortada en el borde de aplicación — gate PR1,
// D-02): este spec reconstruye la proyección desde filas fuente CON PII y
// prueba que el DTO tampoco la re-materializa en el wire (MID-06), ni replica
// meta/porcentaje/estado (MID-03).
// ──────────────────────────────────────────────────────────────────────────────

/** Fila fuente con PII de cuenta — lo que el reader entregaba antes del trim. */
interface FilaFuente {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly abono: bigint;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
}

/** Símil del recorte del borde de aplicación (D-02): monto = abono positivo, PII descartada. */
function recortar(fila: FilaFuente): TransaccionIngresoMes {
  return {
    id: fila.id,
    fecha: fila.fecha,
    descripcion: fila.descripcion,
    origen: fila.banco,
    monto: fila.abono,
  };
}

/** Filas fuente > MAX_SAFE_INTEGER: 4503599627370497 + 4503599627370496 + 600000 = 9007199254740993 (> 2^53-1). */
const PII: ReadonlyArray<FilaFuente> = [
  {
    id: 'tx-a',
    fecha: new Date('2026-07-03T00:00:00.000Z'),
    descripcion: 'Sueldo',
    abono: 4503599627370497n,
    banco: 'BCI',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '11112222',
  },
  {
    id: 'tx-b',
    fecha: new Date('2026-07-15T00:00:00.000Z'),
    descripcion: 'Freelance',
    abono: 4503599627370496n,
    banco: 'BancoEstado',
    tipoCuenta: 'Cuenta Vista',
    numeroCuenta: '33334444',
  },
  {
    id: 'tx-c',
    fecha: new Date('2026-07-21T00:00:00.000Z'),
    descripcion: 'Transferencia',
    abono: 600000n,
    banco: 'Santander',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '55556666',
  },
];

/** TOTAL > MAX_SAFE_INTEGER (9007199254740991): 4503599627370497 + 4503599627370496 + 600000 = 9007199255340993. */
const TOTAL = PII.reduce((acc, fila) => acc + fila.abono, 0n);

function makeResult(
  overrides: Partial<Omit<ObtenerIngresosMesResult, 'transacciones'>> = {},
): ObtenerIngresosMesResult {
  return {
    total: TOTAL,
    conteo: 3,
    transacciones: PII.map(recortar),
    ...overrides,
  };
}

/**
 * Assert de IGUALDAD TIPO-A-TIPO (MID-03/MID-06, gate PR2): el DTO wire debe
 * tener EXACTAMENTE estas teclas — si mañana alguien agrega `tipoCuenta`/
 * `numeroCuenta`/`meta`/`periodo` al tipo, `Equal` resuelve a `false` y esta
 * constante deja de compilar (mismo helper que el spec del use case, PR1).
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type EsperadoTransaccionWire = {
  readonly id: string;
  readonly fecha: string;
  readonly descripcion: string;
  readonly origen: string;
  readonly monto: string;
};

type EsperadoDto = {
  readonly total: string;
  readonly conteo: number;
  readonly transacciones: ReadonlyArray<EsperadoTransaccionWire>;
};

const _assertDtoSinPII: Equal<IngresosMesDto, EsperadoDto> extends true
  ? true
  : never = true;

describe('aIngresosMesDto', () => {
  it('serializa total y monto como strings decimales exactos (BigInt → string, incl. > MAX_SAFE_INTEGER)', () => {
    const dto = aIngresosMesDto(makeResult());

    expect(dto.total).toBe('9007199255340993');
    expect(typeof dto.total).toBe('string');
    expect(dto.transacciones[0].monto).toBe('4503599627370497');
    expect(typeof dto.transacciones[0].monto).toBe('string');
    expect(dto.transacciones[1].monto).toBe('4503599627370496');
    expect(dto.transacciones[2].monto).toBe('600000');
  });

  it('monto = String(abono) positivo, nunca negativo (CA-05), y origen viaja verbatim (MID-02)', () => {
    const dto = aIngresosMesDto(makeResult());

    dto.transacciones.forEach((tx, i) => {
      expect(tx.monto).toBe(String(PII[i].abono));
      expect(tx.monto.startsWith('-')).toBe(false);
      expect(tx.origen).toBe(PII[i].banco);
    });
  });

  it('fecha via ISO-8601 UTC toISOString() (convención bloqueada, ver detalle-bucket-mes.dto.ts)', () => {
    const dto = aIngresosMesDto(makeResult());

    expect(dto.transacciones[0].fecha).toBe('2026-07-03T00:00:00.000Z');
    expect(typeof dto.transacciones[0].fecha).toBe('string');
  });

  it('output EXACTAMENTE {total, conteo, transacciones} — sin meta/porcentaje/estado (MID-03) ni PII de cuenta (MID-06) en el wire', () => {
    const dto = aIngresosMesDto(makeResult());

    // Claves exactas del DTO y de cada transacción wire.
    expect(Object.keys(dto)).toEqual(['total', 'conteo', 'transacciones']);
    expect(Object.keys(dto.transacciones[0])).toEqual([
      'id',
      'fecha',
      'descripcion',
      'origen',
      'monto',
    ]);
    // Ni las claves ni los VALORES PII/50-30-20 de las filas fuente sobreviven.
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain('meta');
    expect(serialized).not.toContain('porcentaje');
    expect(serialized).not.toContain('estado');
    expect(serialized).not.toContain('tipoCuenta');
    expect(serialized).not.toContain('numeroCuenta');
    expect(serialized).not.toContain('Cuenta Corriente');
    expect(serialized).not.toContain('11112222');
  });
});
