import { aIngestaListItemDto } from '../../http/dto/ingesta-list.dto';
import { ingestasResponseSchema } from './ingestas.schema';

/**
 * `ingestasResponseSchema` — Phase 10 rollout of the openapi-contract-express
 * change (GET /api/ingestas). No query/path params — a plain list, so this
 * schema only needs the response side.
 */
describe('ingestasResponseSchema (sync guarantee)', () => {
  it('parses the real DTO output for an empty list', () => {
    const parsed = ingestasResponseSchema.parse({ ingestas: [] });
    expect(parsed.ingestas).toEqual([]);
  });

  it('parses the real DTO output for a PROCESADA item with a resolved banco', () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const item = aIngestaListItemDto({
      id: 'ing-1',
      banco: 'BCI',
      nombreArchivo: 'movimientos.xlsx',
      estado: 'PROCESADA',
      motivoFallo: null,
      fecha,
      totalTransacciones: 10,
    });

    const parsed = ingestasResponseSchema.parse({ ingestas: [item] });
    expect(parsed.ingestas[0]).toEqual({
      id: 'ing-1',
      banco: 'BCI',
      nombreArchivo: 'movimientos.xlsx',
      estado: 'PROCESADA',
      motivoFallo: null,
      fecha: fecha.toISOString(),
      totalTransacciones: 10,
    });
  });

  it('parses the real DTO output for a FALLIDA item with banco=null and a motivoFallo', () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const item = aIngestaListItemDto({
      id: 'ing-2',
      banco: null,
      nombreArchivo: 'cartola.pdf',
      estado: 'FALLIDA',
      motivoFallo: 'Banco no reconocido',
      fecha,
      totalTransacciones: 0,
    });

    const parsed = ingestasResponseSchema.parse({ ingestas: [item] });
    expect(parsed.ingestas[0]?.banco).toBeNull();
    expect(parsed.ingestas[0]?.estado).toBe('FALLIDA');
    expect(parsed.ingestas[0]?.motivoFallo).toBe('Banco no reconocido');
  });

  it('rejects an estado outside the PROCESADA|FALLIDA union', () => {
    const invalid = {
      ingestas: [
        {
          id: 'ing-1',
          banco: 'BCI',
          nombreArchivo: 'x.xlsx',
          estado: 'PENDIENTE', // not a valid wire value
          motivoFallo: null,
          fecha: '2026-07-15T00:00:00.000Z',
          totalTransacciones: 0,
        },
      ],
    };

    expect(() => ingestasResponseSchema.parse(invalid)).toThrow();
  });

  it('rejects totalTransacciones as a string (must be a JSON number, it is a row count not money)', () => {
    const invalid = {
      ingestas: [
        {
          id: 'ing-1',
          banco: 'BCI',
          nombreArchivo: 'x.xlsx',
          estado: 'PROCESADA',
          motivoFallo: null,
          fecha: '2026-07-15T00:00:00.000Z',
          totalTransacciones: '10',
        },
      ],
    };

    expect(() => ingestasResponseSchema.parse(invalid)).toThrow();
  });
});
