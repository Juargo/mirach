import { VentanaPlanGratis } from './ventana-plan-gratis';
import type { IVerificadorPlus } from '../ports/verificador-plus.port';
import type { IUltimoPeriodoConDatosReader } from '../ports/ultimo-periodo-con-datos.port';
import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';
import { PeriodoMes } from '../../domain/value-objects/periodo-mes';
import { perfilReaderConCorte } from '../../../test/support/perfil-presupuesto-reader.double';

// The anchor is the latest month with data; the window is the anchor plus the
// N-1 months before it (S14). Plus has no window.

const AHORA = new Date('2026-11-26T12:00:00.000Z');

function crear(
  opciones: {
    plus?: boolean;
    ultimo?: string | null;
    diaCorte?: number;
    mesesVisibles?: number;
  } = {},
) {
  const { plus = false, ultimo = '2026-09', diaCorte = 1 } = opciones;
  const verificador: IVerificadorPlus = {
    tienePlus: vi.fn().mockResolvedValue(plus),
  };
  const perfilReader = perfilReaderConCorte(diaCorte);
  const ultimoReader: IUltimoPeriodoConDatosReader = {
    ultimoPeriodoConDatos: vi
      .fn()
      .mockResolvedValue(
        ultimo === null
          ? null
          : PeriodoMes.crear(
              ultimo,
              DiaCorte.crear(diaCorte).getValue(),
            ).getValue(),
      ),
  };
  const ventana = new VentanaPlanGratis(
    verificador,
    perfilReader,
    ultimoReader,
    { ahora: () => AHORA },
    opciones.mesesVisibles ?? 3,
  );
  return { ventana, verificador, perfilReader, ultimoReader };
}

describe('VentanaPlanGratis', () => {
  describe('verificarPeriodo', () => {
    it('un período ausente pasa sin leer nada', async () => {
      const { ventana, verificador, ultimoReader } = crear();

      const result = await ventana.verificarPeriodo('u1', undefined);

      expect(result.isOk()).toBe(true);
      expect(verificador.tienePlus).not.toHaveBeenCalled();
      expect(ultimoReader.ultimoPeriodoConDatos).not.toHaveBeenCalled();
    });

    it.each(['2026-09', '2026-08', '2026-07', '2026-10', '2027-05'])(
      'el mes %s (ancla 2026-09, ventana 2026-07..2026-09 o después) pasa',
      async (periodo) => {
        const { ventana } = crear();

        expect((await ventana.verificarPeriodo('u1', periodo)).isOk()).toBe(
          true,
        );
      },
    );

    it.each(['2026-06', '2025-12', '2000-01'])(
      'el mes %s, anterior a la ventana, es PlanPlusRequeridoError',
      async (periodo) => {
        const { ventana } = crear();

        const result = await ventana.verificarPeriodo('u1', periodo);

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(PlanPlusRequeridoError);
      },
    );

    it('la ventana cruza el cambio de año', async () => {
      const { ventana } = crear({ ultimo: '2026-02' });

      expect((await ventana.verificarPeriodo('u1', '2025-12')).isOk()).toBe(
        true,
      );
      expect((await ventana.verificarPeriodo('u1', '2025-11')).isFail()).toBe(
        true,
      );
    });

    it('cuenta los meses sin movimientos entre el ancla y el borde', async () => {
      const { ventana } = crear({ ultimo: '2026-09', mesesVisibles: 1 });

      expect((await ventana.verificarPeriodo('u1', '2026-09')).isOk()).toBe(
        true,
      );
      expect((await ventana.verificarPeriodo('u1', '2026-08')).isFail()).toBe(
        true,
      );
    });

    it('sin movimientos el ancla es el mes financiero en curso', async () => {
      // 26 Nov 2026, cut-off 25 → the current period is 2026-11.
      const { ventana } = crear({ ultimo: null, diaCorte: 25 });

      expect((await ventana.verificarPeriodo('u1', '2026-09')).isOk()).toBe(
        true,
      );
      expect((await ventana.verificarPeriodo('u1', '2026-08')).isFail()).toBe(
        true,
      );
    });

    it('con día de corte 25 el mes se calcula con ese corte', async () => {
      // 24 Nov with cut-off 25 is still period 2026-10.
      const { ventana, ultimoReader } = crear({
        ultimo: '2026-10',
        diaCorte: 25,
      });

      expect((await ventana.verificarPeriodo('u1', '2026-08')).isOk()).toBe(
        true,
      );
      expect((await ventana.verificarPeriodo('u1', '2026-07')).isFail()).toBe(
        true,
      );
      expect(ultimoReader.ultimoPeriodoConDatos).toHaveBeenCalledWith(
        'u1',
        DiaCorte.crear(25).getValue(),
      );
    });

    it('un período con formato inválido pasa: el caso de uso lo responde con 400', async () => {
      const { ventana, verificador } = crear();

      for (const invalido of ['', 'abc', '2026-13', '2026-9']) {
        expect((await ventana.verificarPeriodo('u1', invalido)).isOk()).toBe(
          true,
        );
      }
      expect(verificador.tienePlus).not.toHaveBeenCalled();
    });

    it('con Plus nada se limita y solo se lee el plan', async () => {
      const { ventana, verificador, perfilReader, ultimoReader } = crear({
        plus: true,
      });

      const result = await ventana.verificarPeriodo('u1', '2000-01');

      expect(result.isOk()).toBe(true);
      expect(verificador.tienePlus).toHaveBeenCalledWith('u1');
      expect(perfilReader.obtener).not.toHaveBeenCalled();
      expect(ultimoReader.ultimoPeriodoConDatos).not.toHaveBeenCalled();
    });

    it('lee el ancla y el perfil de la cuenta pedida (aislamiento)', async () => {
      const { ventana, perfilReader, ultimoReader } = crear();

      await ventana.verificarPeriodo('u-otra', '2026-01');

      expect(perfilReader.obtener).toHaveBeenCalledWith('u-otra');
      expect(ultimoReader.ultimoPeriodoConDatos).toHaveBeenCalledWith(
        'u-otra',
        expect.anything(),
      );
    });
  });

  describe('verificarFecha', () => {
    it('una fecha dentro de la ventana pasa y una anterior es PlanPlusRequeridoError', async () => {
      const { ventana } = crear();

      expect(
        (
          await ventana.verificarFecha('u1', new Date('2026-07-01T00:00:00Z'))
        ).isOk(),
      ).toBe(true);
      const result = await ventana.verificarFecha(
        'u1',
        new Date('2026-06-30T00:00:00Z'),
      );
      expect(result.getError()).toBeInstanceOf(PlanPlusRequeridoError);
    });

    it('la fecha se ubica en el mes financiero de la cuenta', async () => {
      // Cut-off 25, anchor 2026-10: the window starts at period 2026-08,
      // which begins on 25 Aug.
      const { ventana } = crear({ ultimo: '2026-10', diaCorte: 25 });

      expect(
        (
          await ventana.verificarFecha('u1', new Date('2026-08-25T00:00:00Z'))
        ).isOk(),
      ).toBe(true);
      expect(
        (
          await ventana.verificarFecha('u1', new Date('2026-08-24T00:00:00Z'))
        ).isFail(),
      ).toBe(true);
    });

    it('una fecha futura pasa', async () => {
      const { ventana } = crear();

      expect(
        (
          await ventana.verificarFecha('u1', new Date('2027-03-01T00:00:00Z'))
        ).isOk(),
      ).toBe(true);
    });

    it('una fecha inválida pasa: el caso de uso la responde', async () => {
      const { ventana } = crear();

      expect(
        (await ventana.verificarFecha('u1', new Date('no es fecha'))).isOk(),
      ).toBe(true);
    });

    it('con Plus nada se limita', async () => {
      const { ventana, ultimoReader } = crear({ plus: true });

      expect(
        (
          await ventana.verificarFecha('u1', new Date('2001-01-01T00:00:00Z'))
        ).isOk(),
      ).toBe(true);
      expect(ultimoReader.ultimoPeriodoConDatos).not.toHaveBeenCalled();
    });
  });

  describe('primerMesVisible', () => {
    it('con Plus no hay ventana: null', async () => {
      const { ventana } = crear({ plus: true });

      expect(
        await ventana.primerMesVisible('u1', DiaCorte.CALENDARIO),
      ).toBeNull();
    });

    it('en el plan gratis es el ancla menos N-1 meses', async () => {
      const { ventana } = crear({ mesesVisibles: 3 });

      const primero = await ventana.primerMesVisible('u1', DiaCorte.CALENDARIO);

      expect(primero?.valor).toBe('2026-07');
    });
  });
});
