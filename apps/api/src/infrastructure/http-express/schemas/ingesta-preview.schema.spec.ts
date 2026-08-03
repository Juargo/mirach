import { Transaccion } from '../../../domain/value-objects/transaccion';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { aPreviewIngestaDto } from '../../http/dto/preview-ingesta.dto';
import type { PreviewIngestaResult } from '../../../application/use-cases/preview-ingesta.use-case';
import {
  previewIngestaRequestSchema,
  previewIngestaResponseSchema,
} from './ingesta-preview.schema';

/**
 * `previewIngestaRequestSchema` / `previewIngestaResponseSchema` — Phase
 * 10.2c rollout of the openapi-contract-express change
 * (POST /api/ingestas/preview).
 *
 * REQUEST: multipart/form-data, one `file` field — same shape as
 * `POST /api/ingestas` but kept as its own small schema (D7-style: trivial
 * duplication is preferable to coupling two independent features).
 */
describe('previewIngestaRequestSchema', () => {
  it('accepts a payload with a file field', () => {
    const result = previewIngestaRequestSchema.safeParse({
      file: new File(['contenido'], 'cartola.xlsx'),
    });
    expect(result.success).toBe(true);
  });
});

function unaTransaccion(cargo: bigint, abono: bigint): Transaccion {
  const r = Transaccion.crear({
    fecha: new Date('2026-07-15T00:00:00.000Z'),
    descripcion: 'Compra supermercado',
    cargo,
    abono,
  });
  return r.getValue();
}

function unResultado(
  muestra: ReadonlyArray<Transaccion>,
): PreviewIngestaResult {
  return {
    banco: {
      banco: BancoConocido.BCI,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: '****5678',
    },
    estructura: { totalFilasDatos: muestra.length },
    muestra,
  };
}

/**
 * Sync guarantee (openapi-contract-express design, spec req #8): validated
 * against the REAL `aPreviewIngestaDto()` mapper output, not a hand-built
 * fixture. `muestra` carries money (cargo/abono) — MUST stay decimal string.
 */
describe('previewIngestaResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for an empty muestra', () => {
    const dto = aPreviewIngestaDto(unResultado([]));

    const parsed = previewIngestaResponseSchema.parse(dto);
    expect(parsed.muestra).toEqual([]);
    expect(parsed.estructura.totalFilasDatos).toBe(0);
  });

  it('parses the real DTO output for a muestra row with a BigInt beyond MAX_SAFE_INTEGER', () => {
    const big = 9_007_199_254_740_993n;
    const tx = unaTransaccion(0n, big);
    const dto = aPreviewIngestaDto(unResultado([tx]));

    const parsed = previewIngestaResponseSchema.parse(dto);
    expect(parsed.muestra[0]?.abono).toBe('9007199254740993');
    expect(parsed.muestra[0]?.cargo).toBe('0');
  });

  it('rejects a payload where abono is a JSON number (never a string)', () => {
    const invalid = {
      banco: 'BCI',
      tipoCuenta: 'Corriente',
      numeroCuenta: '****5678',
      estructura: { totalFilasDatos: 1 },
      muestra: [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'x',
          cargo: '0',
          abono: 100000, // must be string, not number
        },
      ],
    };

    expect(() => previewIngestaResponseSchema.parse(invalid)).toThrow();
  });
});
