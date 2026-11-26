import { ProcesarEventoSuscripcionUseCase } from './procesar-evento-suscripcion.use-case';
import type {
  IDerechosPlusWriter,
  ResultadoCambioDerechos,
} from '../ports/derechos-plus-writer.port';
import type { CambioDerechosPlus } from '../../domain/value-objects/cambio-derechos-plus';
import { FakeLogger } from '../../../test/support/logger.double';

const FUNDADOR: CambioDerechosPlus = {
  tipo: 'fundador_otorgado',
  usuarios: ['user-1'],
  ocurridoEn: new Date('2026-12-10T12:00:00.000Z'),
  sandbox: false,
};

function crear(resultado: ResultadoCambioDerechos = 'aplicado') {
  const writer: IDerechosPlusWriter = {
    aplicar: vi.fn().mockResolvedValue(resultado),
  };
  const logger = new FakeLogger();
  const useCase = new ProcesarEventoSuscripcionUseCase(writer, logger);
  return { writer, logger, useCase };
}

describe('ProcesarEventoSuscripcionUseCase', () => {
  it('aplica el cambio con el id del evento y devuelve el resultado', async () => {
    const { writer, useCase } = crear('aplicado');

    const resultado = await useCase.execute({
      eventoId: 'evt-1',
      tipoEvento: 'NON_RENEWING_PURCHASE',
      cambio: FUNDADOR,
    });

    expect(resultado).toBe('aplicado');
    expect(writer.aplicar).toHaveBeenCalledExactlyOnceWith('evt-1', FUNDADOR);
  });

  it('un evento ignorado no toca los derechos', async () => {
    const { writer, useCase } = crear();

    const resultado = await useCase.execute({
      eventoId: 'evt-2',
      tipoEvento: 'TEST',
      cambio: { tipo: 'ignorado', motivo: 'tipo de evento sin efecto' },
    });

    expect(resultado).toBe('ignorado');
    expect(writer.aplicar).not.toHaveBeenCalled();
  });

  it.each(['aplicado', 'duplicado', 'obsoleto'] as const)(
    'registra %s como información, sin identificar al usuario',
    async (esperado) => {
      const { logger, useCase } = crear(esperado);

      await useCase.execute({
        eventoId: 'evt-1',
        tipoEvento: 'RENEWAL',
        cambio: FUNDADOR,
      });

      expect(logger.calls).toEqual([
        {
          level: 'info',
          message: 'Evento de suscripción procesado',
          context: {
            eventoId: 'evt-1',
            tipoEvento: 'RENEWAL',
            cambio: 'fundador_otorgado',
            resultado: esperado,
          },
        },
      ]);
    },
  );

  it('avisa cuando ningún usuario del evento existe', async () => {
    const { logger, useCase } = crear('usuario_desconocido');

    await useCase.execute({
      eventoId: 'evt-1',
      tipoEvento: 'RENEWAL',
      cambio: FUNDADOR,
    });

    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]).toMatchObject({
      level: 'warn',
      context: { resultado: 'usuario_desconocido' },
    });
  });

  it('registra el motivo de un evento ignorado', async () => {
    const { logger, useCase } = crear();

    await useCase.execute({
      eventoId: 'evt-2',
      tipoEvento: 'TEST',
      cambio: { tipo: 'ignorado', motivo: 'tipo de evento sin efecto' },
    });

    expect(logger.calls).toEqual([
      {
        level: 'info',
        message: 'Evento de suscripción procesado',
        context: {
          eventoId: 'evt-2',
          tipoEvento: 'TEST',
          cambio: 'ignorado',
          resultado: 'ignorado',
          motivo: 'tipo de evento sin efecto',
        },
      },
    ]);
  });

  it('un fallo al escribir sale sin atrapar, para que el proveedor reintente', async () => {
    const { writer, useCase } = crear();
    vi.mocked(writer.aplicar).mockRejectedValueOnce(new Error('BD caída'));

    await expect(
      useCase.execute({
        eventoId: 'evt-1',
        tipoEvento: 'RENEWAL',
        cambio: FUNDADOR,
      }),
    ).rejects.toThrow('BD caída');
  });
});
