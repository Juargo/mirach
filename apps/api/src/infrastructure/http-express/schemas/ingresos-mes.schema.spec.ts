import type { ObtenerIngresosMesResult } from '../../../application/use-cases/obtener-ingresos-mes.use-case';
import type { TransaccionIngresoMes } from '../../../application/use-cases/obtener-ingresos-mes.use-case';
import { aIngresosMesDto } from '../../http/dto/ingresos-mes.dto';
import {
  ingresosMesQuerySchema,
  ingresosMesResponseSchema,
} from './ingresos-mes.schema';

// ──────────────────────────────────────────────────────────────────────────────
// US-052 PR2: `ingresosMesResponseSchema`/`ingresosMesQuerySchema` — sync
// guarantee (per `bucket-detalle-mes.schema.spec.ts` precedent): validado
// contra la salida REAL del mapper `aIngresosMesDto()`, no un fixture a mano
// que pueda desviarse del contrato wire. El fixture se duplica desde
// `ingresos-mes.dto.spec.ts` a propósito (kiss.md: duplicación pequeña
// tolerada — mismo patrón makeDetalle en semaforo/bucket dto-schema specs).
// El `.strict()` (leaf y top-level) ES la garantía wire de MID-03/MID-06:
// additionalProperties: false en el OpenAPI generado.
// ──────────────────────────────────────────────────────────────────────────────

/** Fila fuente con PII de cuenta — nunca llega al wire (MID-06). */
interface FilaFuente {
  readonly id: string;
  readonly fecha: Date;
  readonly descripcion: string;
  readonly abono: bigint;
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
}

function recortar(fila: FilaFuente): TransaccionIngresoMes {
  return {
    id: fila.id,
    fecha: fila.fecha,
    descripcion: fila.descripcion,
    origen: fila.banco,
    monto: fila.abono,
  };
}

const PII: ReadonlyArray<FilaFuente> = [
  {
    id: 'tx-a',
    fecha: new Date('2026-07-03T00:00:00.000Z'),
    descripcion: 'Sueldo',
    abono: 1500000n,
    banco: 'BCI',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '11112222',
  },
  {
    id: 'tx-b',
    fecha: new Date('2026-07-15T00:00:00.000Z'),
    descripcion: 'Freelance',
    abono: 900000n,
    banco: 'BancoEstado',
    tipoCuenta: 'Cuenta Vista',
    numeroCuenta: '33334444',
  },
];

function makeResult(): ObtenerIngresosMesResult {
  return {
    total: 2400000n,
    conteo: 2,
    transacciones: PII.map(recortar),
  };
}

describe('ingresosMes schemas (sync guarantee)', () => {
  it('parsea la salida REAL de aIngresosMesDto() y la query acepta periodo opcional (transport-shape, MID-04/D-05)', () => {
    const dto = aIngresosMesDto(makeResult());

    const parsed = ingresosMesResponseSchema.parse(dto);
    expect(parsed).toEqual(dto);

    // Query shape: cualquier string pasa — YYYY-MM lo valida el dominio (PeriodoMes).
    expect(ingresosMesQuerySchema.parse({})).toEqual({});
    expect(ingresosMesQuerySchema.parse({ periodo: '2026-07' })).toEqual({
      periodo: '2026-07',
    });
    expect(ingresosMesQuerySchema.parse({ periodo: 'not-a-date' })).toEqual({
      periodo: 'not-a-date',
    });
  });

  it('MID-03/MID-06: el leaf transacción es .strict() — rechaza un key extra (p.ej. tipoCuenta)', () => {
    const dto = aIngresosMesDto(makeResult());
    const invalid = {
      ...dto,
      transacciones: dto.transacciones.map((tx) => ({
        ...tx,
        tipoCuenta: 'Cuenta Corriente',
      })),
    };

    expect(() => ingresosMesResponseSchema.parse(invalid)).toThrow();
  });

  it('el schema RESPONSE es .strict() top-level: rechaza un key extra (p.ej. meta) y monto como JSON number (MID-03/MID-05)', () => {
    const dto = aIngresosMesDto(makeResult());

    const conMetaExtra = { ...dto, meta: { ahorro: '1' } };
    expect(() => ingresosMesResponseSchema.parse(conMetaExtra)).toThrow();

    const montoNumber = {
      ...dto,
      transacciones: dto.transacciones.map((tx) => ({
        ...tx,
        monto: 12.5,
      })),
    };
    expect(() => ingresosMesResponseSchema.parse(montoNumber)).toThrow();
  });
});
