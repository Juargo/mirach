import { VerificarPlusUseCase } from './verificar-plus.use-case';
import type { IPlanReader } from '../ports/plan-reader.port';
import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import {
  MotivoPermiso,
  type DerechosCuenta,
  type ReglaPrueba,
} from '../../domain/value-objects/plan';

const ahora = new Date('2026-12-10T12:00:00.000Z');
const COBRO_ACTIVO: ReglaPrueba = {
  cobroActivoDesde: new Date('2026-11-01T00:00:00.000Z'),
  diasPrueba: 30,
  diasAviso: 3,
};

function crear(cuenta: Partial<DerechosCuenta>, regla = COBRO_ACTIVO) {
  const reader: IPlanReader = {
    leer: vi.fn().mockResolvedValue({
      cuentaCreadaEn: new Date('2026-01-01T00:00:00.000Z'),
      suscripcion: null,
      permisos: [],
      ...cuenta,
    }),
    contarFundadoresVendidos: vi.fn(),
  };
  return {
    reader,
    useCase: new VerificarPlusUseCase(reader, { ahora: () => ahora }, regla),
  };
}

describe('VerificarPlusUseCase', () => {
  it('una cuenta en el plan gratis no tiene Plus', async () => {
    // Created long ago: its trial ended on 2026-12-01.
    const { reader, useCase } = crear({});

    expect(await useCase.tienePlus('user-1')).toBe(false);
    const resultado = await useCase.execute({ userId: 'user-1' });
    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(PlanPlusRequeridoError);
    expect(resultado.getError().message).toBe(
      'Esta función es parte de Mirach Plus.',
    );
    expect(reader.leer).toHaveBeenCalledWith('user-1');
  });

  it('una cuenta dentro de su prueba tiene Plus', async () => {
    const { useCase } = crear({
      cuentaCreadaEn: new Date('2026-12-01T00:00:00.000Z'),
    });

    expect(await useCase.tienePlus('user-1')).toBe(true);
    expect((await useCase.execute({ userId: 'user-1' })).isOk()).toBe(true);
  });

  it('una cuenta con un permiso vigente tiene Plus', async () => {
    const { useCase } = crear({
      permisos: [
        {
          motivo: MotivoPermiso.Fundador,
          otorgadoEn: ahora,
          venceEn: null,
          revocadoEn: null,
        },
      ],
    });

    expect(await useCase.tienePlus('user-1')).toBe(true);
  });

  it('mientras el cobro no está activo toda cuenta tiene Plus', async () => {
    const { useCase } = crear({}, { ...COBRO_ACTIVO, cobroActivoDesde: null });

    expect(await useCase.tienePlus('user-1')).toBe(true);
  });

  it('nunca cuenta los cupos del Fundador', async () => {
    const { reader, useCase } = crear({});

    await useCase.tienePlus('user-1');

    expect(reader.contarFundadoresVendidos).not.toHaveBeenCalled();
  });
});
