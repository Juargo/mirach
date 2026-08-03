import { Transaccion } from '../../../domain/value-objects/transaccion';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { aIngestaResponseDto } from '../../http/dto/ingesta-response.dto';
import type { ProcessIngestaResult } from '../../../application/use-cases/process-ingesta.use-case';
import {
  ingestaUploadRequestSchema,
  ingestaUploadResponseSchema,
} from './ingesta-upload.schema';

/**
 * `ingestaUploadRequestSchema` / `ingestaUploadResponseSchema` — Phase 10.2c
 * rollout of the openapi-contract-express change (POST /api/ingestas).
 *
 * REQUEST: multipart/form-data, one `file` field — no JSON body to
 * `.safeParse()` at the route (multer handles the file). This schema exists
 * only to document the shape in the OpenAPI doc, never mounted as runtime
 * validation.
 */
describe('ingestaUploadRequestSchema', () => {
  it('accepts a payload with a file field', () => {
    const result = ingestaUploadRequestSchema.safeParse({
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
  transacciones: ReadonlyArray<Transaccion>,
): ProcessIngestaResult {
  return {
    archivo: {
      originalName: 'cartola.xlsx',
      sizeInBytes: 1234,
      extension: '.xlsx',
    },
    banco: {
      banco: BancoConocido.BancoEstado,
      tipoCuenta: TipoCuentaConocido.CuentaRut,
      numeroCuenta: '****1234',
    },
    estructura: { filaEncabezados: 1, totalFilasDatos: transacciones.length },
    ingestaId: 'ing-1',
    total: transacciones.length,
    transacciones,
    duplicadosOmitidos: 0,
  };
}

/**
 * Sync guarantee (openapi-contract-express design, spec req #8): validated
 * against the REAL `aIngestaResponseDto()` mapper output, not a hand-built
 * fixture.
 */
describe('ingestaUploadResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for an empty transacciones list', () => {
    const dto = aIngestaResponseDto(unResultado([]));

    const parsed = ingestaUploadResponseSchema.parse(dto);
    expect(parsed.transacciones).toEqual([]);
    expect(parsed.duplicadosOmitidos).toBe(0);
  });

  it('parses the real DTO output for a transaccion with a BigInt beyond MAX_SAFE_INTEGER', () => {
    const big = 9_007_199_254_740_993n;
    const tx = unaTransaccion(big, 0n);
    const dto = aIngestaResponseDto(unResultado([tx]));

    const parsed = ingestaUploadResponseSchema.parse(dto);
    expect(parsed.transacciones[0]?.cargo).toBe('9007199254740993');
    expect(parsed.transacciones[0]?.abono).toBe('0');
  });

  it('rejects a payload where cargo is a JSON number (never a string)', () => {
    const invalid = {
      ingestaId: 'ing-1',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '****1234',
      archivo: { nombre: 'cartola.xlsx', extension: '.xlsx', tamanoBytes: 1 },
      totalTransacciones: 1,
      duplicadosOmitidos: 0,
      transacciones: [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'x',
          cargo: 100000, // must be string, not number
          abono: '0',
        },
      ],
    };

    expect(() => ingestaUploadResponseSchema.parse(invalid)).toThrow();
  });

  it('rejects a payload where totalTransacciones is a string (row count, plain number)', () => {
    const invalid = {
      ingestaId: 'ing-1',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '****1234',
      archivo: { nombre: 'cartola.xlsx', extension: '.xlsx', tamanoBytes: 1 },
      totalTransacciones: '1',
      duplicadosOmitidos: 0,
      transacciones: [],
    };

    expect(() => ingestaUploadResponseSchema.parse(invalid)).toThrow();
  });
});
