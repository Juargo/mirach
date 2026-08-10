import { ListarIngestasUseCase } from './listar-ingestas.use-case';
import {
  IListarIngestasReader,
  IngestaResumen,
} from '../ports/listar-ingestas.port';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

function makeReader(rows: IngestaResumen[]): IListarIngestasReader {
  return {
    listarPorUsuario: vi.fn().mockResolvedValue(rows),
  };
}

describe('ListarIngestasUseCase', () => {
  it('T1.4c: delega en el reader con el userId y retorna el arreglo directamente (D4, no Result)', async () => {
    const rows: IngestaResumen[] = [
      {
        id: 'ing-1',
        banco: 'BCI',
        nombreArchivo: 'movimientos.xlsx',
        estado: 'PROCESADA',
        motivoFallo: null,
        fecha: new Date('2026-07-15T00:00:00.000Z'),
        totalTransacciones: 10,
      },
    ];
    const reader = makeReader(rows);
    const useCase = new ListarIngestasUseCase(reader, new NoOpLogger());

    const result = await useCase.execute('user-a');

    expect(result).toEqual(rows);
    expect(reader.listarPorUsuario).toHaveBeenCalledWith('user-a');
  });

  it('T1.4d: lista vacía es un resultado válido — retorna [] directamente', async () => {
    const reader = makeReader([]);
    const useCase = new ListarIngestasUseCase(reader, new NoOpLogger());

    const result = await useCase.execute('user-a');

    expect(result).toEqual([]);
  });

  describe('debug logging (ADR-033 slice B — redaction contract, ADR-013)', () => {
    it('loguea solo el CONTEO, nunca nombreArchivo/motivoFallo de las ingestas listadas', async () => {
      const rows: IngestaResumen[] = [
        {
          id: 'ing-1',
          banco: 'BCI',
          nombreArchivo: 'cartola-secreta.xlsx',
          estado: 'PROCESADA',
          motivoFallo: null,
          fecha: new Date('2026-07-15T00:00:00.000Z'),
          totalTransacciones: 10,
        },
        {
          id: 'ing-2',
          banco: null,
          nombreArchivo: 'cartola-fallida.xlsx',
          estado: 'FALLIDA',
          motivoFallo: 'estructura inválida: falta columna X',
          fecha: new Date('2026-07-16T00:00:00.000Z'),
          totalTransacciones: 0,
        },
      ];
      const reader = makeReader(rows);
      const logger = new FakeLogger();
      const useCase = new ListarIngestasUseCase(reader, logger);

      await useCase.execute('user-a');

      const debugCalls = logger.calls.filter((c) => c.level === 'debug');
      expect(debugCalls).toEqual([
        {
          level: 'debug',
          message: 'listar-ingestas: ingestas listed',
          context: { total: 2 },
        },
      ]);
      const serializedContexts = JSON.stringify(
        debugCalls.map((c) => c.context),
      );
      expect(serializedContexts).not.toContain('cartola-secreta');
      expect(serializedContexts).not.toContain('estructura inválida');
    });
  });
});
