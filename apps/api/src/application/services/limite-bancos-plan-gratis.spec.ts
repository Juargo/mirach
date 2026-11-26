import { LimiteBancosPlanGratis } from './limite-bancos-plan-gratis';
import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import type { IExclusionPorUsuario } from '../ports/exclusion-por-usuario.port';

function crear(opciones: {
  plus?: boolean;
  bancos?: string[];
  maximo?: number;
}) {
  const verificador = {
    tienePlus: vi.fn().mockResolvedValue(opciones.plus ?? false),
  };
  const reader = {
    bancosEnOrdenDeImportacion: vi
      .fn()
      .mockResolvedValue(opciones.bancos ?? []),
  };
  const exclusion = {
    enExclusiva: vi.fn(
      (_userId: string, accion: () => Promise<unknown>): Promise<unknown> =>
        accion(),
    ),
  };
  const limite = new LimiteBancosPlanGratis(
    verificador,
    reader,
    opciones.maximo ?? 2,
    exclusion as unknown as IExclusionPorUsuario,
  );
  return { verificador, reader, exclusion, limite };
}

describe('LimiteBancosPlanGratis (IMP-24)', () => {
  it('con Plus cualquier banco pasa, sin consultar las cuentas', async () => {
    const { reader, limite } = crear({
      plus: true,
      bancos: ['BCI', 'Santander', 'BancoEstado'],
    });

    expect((await limite.verificar('user-1', 'Banco de Chile')).isOk()).toBe(
      true,
    );
    expect(reader.bancosEnOrdenDeImportacion).not.toHaveBeenCalled();
  });

  it.each([
    ['sin ningún banco todavía', []],
    ['con un banco, y este es el segundo', ['BCI']],
  ])('en el plan gratis, %s, un banco nuevo pasa', async (_caso, bancos) => {
    const { limite } = crear({ bancos });

    expect((await limite.verificar('user-1', 'Santander')).isOk()).toBe(true);
  });

  it.each(['BCI', 'Santander'])(
    'con sus dos bancos usados, %s sigue pasando',
    async (banco) => {
      const { limite } = crear({ bancos: ['BCI', 'Santander'] });

      expect((await limite.verificar('user-1', banco)).isOk()).toBe(true);
    },
  );

  it('con sus dos bancos usados, un tercero se rechaza', async () => {
    const { reader, limite } = crear({ bancos: ['BCI', 'Santander'] });

    const resultado = await limite.verificar('user-1', 'BancoEstado');

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(PlanPlusRequeridoError);
    expect(reader.bancosEnOrdenDeImportacion).toHaveBeenCalledWith('user-1');
  });

  it('quien usó más bancos con Plus conserva solo los dos primeros', async () => {
    const { limite } = crear({
      bancos: ['BCI', 'Santander', 'BancoEstado', 'Banco de Chile'],
    });

    expect((await limite.verificar('user-1', 'Santander')).isOk()).toBe(true);
    expect((await limite.verificar('user-1', 'BancoEstado')).isFail()).toBe(
      true,
    );
    expect((await limite.verificar('user-1', 'Banco de Chile')).isFail()).toBe(
      true,
    );
  });

  it('respeta el máximo configurado', async () => {
    const { limite } = crear({ bancos: ['BCI'], maximo: 1 });

    expect((await limite.verificar('user-1', 'BCI')).isOk()).toBe(true);
    expect((await limite.verificar('user-1', 'Santander')).isFail()).toBe(true);
  });

  describe('asegurarCuenta', () => {
    it('en el plan gratis verifica y escribe dentro de la exclusión del usuario', async () => {
      const { exclusion, reader, limite } = crear({ bancos: ['BCI'] });
      const orden: string[] = [];
      exclusion.enExclusiva.mockImplementationOnce(async (_userId, accion) => {
        orden.push('entra');
        const resultado = await accion();
        orden.push('sale');
        return resultado;
      });
      reader.bancosEnOrdenDeImportacion.mockImplementationOnce(() => {
        orden.push('lee');
        return Promise.resolve(['BCI']);
      });
      const asegurar = vi.fn(() => {
        orden.push('escribe');
        return Promise.resolve('cuenta-1');
      });

      const resultado = await limite.asegurarCuenta(
        'user-1',
        'Santander',
        asegurar,
      );

      expect(resultado.getValue()).toBe('cuenta-1');
      expect(exclusion.enExclusiva).toHaveBeenCalledWith(
        'user-1',
        expect.any(Function),
      );
      expect(orden).toEqual(['entra', 'lee', 'escribe', 'sale']);
    });

    it('fuera del límite no escribe', async () => {
      const { limite } = crear({ bancos: ['BCI', 'Santander'] });
      const asegurar = vi.fn();

      const resultado = await limite.asegurarCuenta(
        'user-1',
        'BancoEstado',
        asegurar,
      );

      expect(resultado.getError()).toBeInstanceOf(PlanPlusRequeridoError);
      expect(asegurar).not.toHaveBeenCalled();
    });

    it('con Plus escribe directo, sin exclusión ni lectura de bancos', async () => {
      const { exclusion, reader, limite } = crear({ plus: true });
      const asegurar = vi.fn().mockResolvedValue('cuenta-1');

      const resultado = await limite.asegurarCuenta(
        'user-1',
        'BancoEstado',
        asegurar,
      );

      expect(resultado.getValue()).toBe('cuenta-1');
      expect(exclusion.enExclusiva).not.toHaveBeenCalled();
      expect(reader.bancosEnOrdenDeImportacion).not.toHaveBeenCalled();
    });
  });
});
