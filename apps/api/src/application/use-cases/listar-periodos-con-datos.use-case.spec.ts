import { ListarPeriodosConDatosUseCase } from './listar-periodos-con-datos.use-case';
import type { IPeriodosConDatosReader } from '../ports/periodos-con-datos.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';

function periodo(valor: string): PeriodoMes {
  return PeriodoMes.crear(valor).getValue();
}

function fakeReader(valores: string[]): IPeriodosConDatosReader {
  return {
    periodosConDatos: vi.fn().mockResolvedValue(valores.map(periodo)),
  };
}

describe('ListarPeriodosConDatosUseCase', () => {
  it('usuario sin movimientos → lista vacía', async () => {
    const useCase = new ListarPeriodosConDatosUseCase(fakeReader([]));

    expect(await useCase.execute({ userId: 'u1' })).toEqual([]);
  });

  it('ordena del más reciente al más antiguo, cruzando años', async () => {
    const useCase = new ListarPeriodosConDatosUseCase(
      fakeReader(['2025-12', '2026-03', '2026-01', '2025-02']),
    );

    expect(await useCase.execute({ userId: 'u1' })).toEqual([
      '2026-03',
      '2026-01',
      '2025-12',
      '2025-02',
    ]);
  });

  it('elimina duplicados aunque el reader los devuelva repetidos', async () => {
    const useCase = new ListarPeriodosConDatosUseCase(
      fakeReader(['2026-03', '2026-01', '2026-03', '2026-01', '2026-03']),
    );

    expect(await useCase.execute({ userId: 'u1' })).toEqual([
      '2026-03',
      '2026-01',
    ]);
  });

  it('consulta al reader con el userId recibido (aislamiento)', async () => {
    const reader = fakeReader(['2026-03']);
    const useCase = new ListarPeriodosConDatosUseCase(reader);

    await useCase.execute({ userId: 'user-de-sesion' });

    expect(reader.periodosConDatos).toHaveBeenCalledWith('user-de-sesion');
  });
});
