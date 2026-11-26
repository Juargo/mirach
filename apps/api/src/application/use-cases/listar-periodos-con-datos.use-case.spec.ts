import { ListarPeriodosConDatosUseCase } from './listar-periodos-con-datos.use-case';
import type { IPeriodosConDatosReader } from '../ports/periodos-con-datos.port';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';
import { ventanaPlanGratisDoble } from '../../../test/support/ventana-plan-gratis.double';
import { perfilReaderConCorte } from '../../../test/support/perfil-presupuesto-reader.double';

function periodo(valor: string): PeriodoMes {
  return PeriodoMes.crear(valor).getValue();
}

function fakeReader(valores: string[]): IPeriodosConDatosReader {
  return {
    periodosConDatos: vi.fn().mockResolvedValue(valores.map(periodo)),
  };
}

const valores = (periodos: ReadonlyArray<PeriodoMes>): string[] =>
  periodos.map((p) => p.valor);

describe('ListarPeriodosConDatosUseCase', () => {
  it('usuario sin movimientos → lista vacía', async () => {
    const useCase = new ListarPeriodosConDatosUseCase(
      fakeReader([]),
      perfilReaderConCorte(),
      ventanaPlanGratisDoble(),
    );

    expect(await useCase.execute({ userId: 'u1' })).toEqual([]);
  });

  it('ordena del más reciente al más antiguo, cruzando años', async () => {
    const useCase = new ListarPeriodosConDatosUseCase(
      fakeReader(['2025-12', '2026-03', '2026-01', '2025-02']),
      perfilReaderConCorte(),
      ventanaPlanGratisDoble(),
    );

    expect(valores(await useCase.execute({ userId: 'u1' }))).toEqual([
      '2026-03',
      '2026-01',
      '2025-12',
      '2025-02',
    ]);
  });

  it('elimina duplicados aunque el reader los devuelva repetidos', async () => {
    const useCase = new ListarPeriodosConDatosUseCase(
      fakeReader(['2026-03', '2026-01', '2026-03', '2026-01', '2026-03']),
      perfilReaderConCorte(),
      ventanaPlanGratisDoble(),
    );

    expect(valores(await useCase.execute({ userId: 'u1' }))).toEqual([
      '2026-03',
      '2026-01',
    ]);
  });

  it('consulta al reader con el userId recibido (aislamiento)', async () => {
    const reader = fakeReader(['2026-03']);
    const perfilReader = perfilReaderConCorte();
    const useCase = new ListarPeriodosConDatosUseCase(
      reader,
      perfilReader,
      ventanaPlanGratisDoble(),
    );

    await useCase.execute({ userId: 'user-de-sesion' });

    expect(reader.periodosConDatos).toHaveBeenCalledWith(
      'user-de-sesion',
      DiaCorte.CALENDARIO,
    );
    expect(perfilReader.obtener).toHaveBeenCalledWith('user-de-sesion');
  });

  it('el día de corte del perfil llega al reader (mes financiero, #111)', async () => {
    const reader = fakeReader(['2026-03']);
    const useCase = new ListarPeriodosConDatosUseCase(
      reader,
      perfilReaderConCorte(25),
      ventanaPlanGratisDoble(),
    );

    await useCase.execute({ userId: 'u1' });

    const [, diaCorte] = vi.mocked(reader.periodosConDatos).mock.calls[0];
    expect(diaCorte.valor).toBe(25);
  });

  describe('ventana del plan gratis (S14)', () => {
    const MESES = ['2026-09', '2026-08', '2026-07', '2026-06', '2025-12'];

    it('con Plus devuelve todos los meses con datos', async () => {
      const useCase = new ListarPeriodosConDatosUseCase(
        fakeReader(MESES),
        perfilReaderConCorte(),
        ventanaPlanGratisDoble({ plus: true, ancla: '2026-09' }),
      );

      expect(valores(await useCase.execute({ userId: 'u1' }))).toEqual(MESES);
    });

    it('en el plan gratis solo devuelve los meses dentro de la ventana', async () => {
      const useCase = new ListarPeriodosConDatosUseCase(
        fakeReader(MESES),
        perfilReaderConCorte(),
        ventanaPlanGratisDoble({ plus: false, ancla: '2026-09' }),
      );

      expect(valores(await useCase.execute({ userId: 'u1' }))).toEqual([
        '2026-09',
        '2026-08',
        '2026-07',
      ]);
    });

    it('la ventana cuenta meses sin datos: un hueco no trae meses más viejos', async () => {
      const useCase = new ListarPeriodosConDatosUseCase(
        fakeReader(['2026-09', '2026-06']),
        perfilReaderConCorte(),
        ventanaPlanGratisDoble({ plus: false, ancla: '2026-09' }),
      );

      expect(valores(await useCase.execute({ userId: 'u1' }))).toEqual([
        '2026-09',
      ]);
    });

    it('sin movimientos la lista sigue vacía', async () => {
      const useCase = new ListarPeriodosConDatosUseCase(
        fakeReader([]),
        perfilReaderConCorte(),
        ventanaPlanGratisDoble({ plus: false }),
      );

      expect(await useCase.execute({ userId: 'u1' })).toEqual([]);
    });
  });
});
