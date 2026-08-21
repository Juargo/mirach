import { Transaccion } from '../../../domain/value-objects/transaccion';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { Bucket } from '../../../domain/value-objects/bucket';
import { aPreviewIngestaDto } from '../../http/dto/preview-ingesta.dto';
import type {
  PreviewIngestaResult,
  PreviewFila,
} from '../../../application/use-cases/preview-ingesta.use-case';
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
 *
 * US-057 PR2: response shape updated from { banco, estructura, muestra } to
 * { banco, resumen, filas } with per-row dedup status and classification
 * suggestion. Full openapi.json formalisation is PR4/5.
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

function unaFila(tx: Transaccion, rowIndex = 0): PreviewFila {
  return {
    rowIndex,
    transaccion: tx,
    esDuplicado: false,
    sugerido: null,
  };
}

function unResultado(filas: ReadonlyArray<PreviewFila>): PreviewIngestaResult {
  return {
    banco: {
      banco: BancoConocido.BCI,
      tipoCuenta: TipoCuentaConocido.CuentaCorriente,
      numeroCuenta: '****5678',
    },
    resumen: {
      totalFilas: filas.length,
      duplicadosDetectados: 0,
      nuevas: filas.length,
    },
    filas,
  };
}

/**
 * Sync guarantee (openapi-contract-express design, spec req #8): validated
 * against the REAL `aPreviewIngestaDto()` mapper output, not a hand-built
 * fixture. `filas` carries money (cargo/abono) — MUST stay decimal string.
 */
describe('previewIngestaResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for an empty filas array', () => {
    const dto = aPreviewIngestaDto(unResultado([]));

    const parsed = previewIngestaResponseSchema.parse(dto);
    expect(parsed.filas).toEqual([]);
    expect(parsed.resumen.totalFilas).toBe(0);
  });

  it('parses the real DTO output for a filas row with a BigInt beyond MAX_SAFE_INTEGER', () => {
    const big = 9_007_199_254_740_993n;
    const tx = unaTransaccion(0n, big);
    const dto = aPreviewIngestaDto(unResultado([unaFila(tx)]));

    const parsed = previewIngestaResponseSchema.parse(dto);
    expect(parsed.filas[0]?.abono).toBe('9007199254740993');
    expect(parsed.filas[0]?.cargo).toBe('0');
  });

  it('parses esDuplicado and sugerido fields correctly', () => {
    const tx = unaTransaccion(1000n, 0n);
    const filaConSugerido: PreviewFila = {
      rowIndex: 0,
      transaccion: tx,
      esDuplicado: true,
      sugerido: { bucket: Bucket.Necesidades, categoriaId: 'cat-x' },
    };
    const dto = aPreviewIngestaDto(unResultado([filaConSugerido]));

    const parsed = previewIngestaResponseSchema.parse(dto);
    expect(parsed.filas[0]?.esDuplicado).toBe(true);
    expect(parsed.filas[0]?.sugerido).toEqual({
      bucket: 'Necesidades',
      categoriaId: 'cat-x',
    });
  });

  it('rejects a payload where abono is a JSON number (never a string)', () => {
    const invalid = {
      banco: 'BCI',
      tipoCuenta: 'Corriente',
      numeroCuenta: '****5678',
      resumen: { totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 },
      filas: [
        {
          rowIndex: 0,
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'x',
          cargo: '0',
          abono: 100000, // must be string, not number
          esDuplicado: false,
          sugerido: null,
        },
      ],
    };

    expect(() => previewIngestaResponseSchema.parse(invalid)).toThrow();
  });
});
