import { LimiteBancosPlanGratis } from './limite-bancos-plan-gratis';
import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';

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
  const limite = new LimiteBancosPlanGratis(
    verificador,
    reader,
    opciones.maximo ?? 2,
  );
  return { verificador, reader, limite };
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
});
