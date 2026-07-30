import { ListarIngestasUseCase } from './listar-ingestas.use-case';
import {
  IListarIngestasReader,
  IngestaResumen,
} from '../ports/listar-ingestas.port';

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
        fecha: new Date('2026-07-15T00:00:00.000Z'),
        totalTransacciones: 10,
      },
    ];
    const reader = makeReader(rows);
    const useCase = new ListarIngestasUseCase(reader);

    const result = await useCase.execute('user-a');

    expect(result).toEqual(rows);
    expect(reader.listarPorUsuario).toHaveBeenCalledWith('user-a');
  });

  it('T1.4d: lista vacía es un resultado válido — retorna [] directamente', async () => {
    const reader = makeReader([]);
    const useCase = new ListarIngestasUseCase(reader);

    const result = await useCase.execute('user-a');

    expect(result).toEqual([]);
  });
});
