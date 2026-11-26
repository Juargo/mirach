import { ObtenerPlanUseCase } from './obtener-plan.use-case';
import type { DerechosGuardados, IPlanReader } from '../ports/plan-reader.port';
import {
  EstadoSuscripcion,
  MotivoPermiso,
  OrigenSuscripcion,
  Plan,
  TiendaSuscripcion,
} from '../../domain/value-objects/plan';

const ahora = new Date('2026-12-10T12:00:00.000Z');
const enUnMes = new Date('2027-01-10T12:00:00.000Z');

function crear(derechos: DerechosGuardados) {
  const reader: IPlanReader = { leer: vi.fn().mockResolvedValue(derechos) };
  const useCase = new ObtenerPlanUseCase(reader, { ahora: () => ahora });
  return { reader, useCase };
}

describe('ObtenerPlanUseCase', () => {
  it('lee los derechos del usuario de la sesión', async () => {
    const { reader, useCase } = crear({ suscripcion: null, permisos: [] });

    await useCase.execute({ userId: 'user-1' });

    expect(reader.leer).toHaveBeenCalledExactlyOnceWith('user-1');
  });

  it('sin derechos guardados responde el plan gratis', async () => {
    const { useCase } = crear({ suscripcion: null, permisos: [] });

    expect(await useCase.execute({ userId: 'user-1' })).toEqual({
      plan: Plan.Gratis,
      origen: null,
      venceEn: null,
      renueva: false,
      producto: null,
      tienda: null,
    });
  });

  it('con una suscripción vigente responde Plus con su producto y tienda', async () => {
    const { useCase } = crear({
      suscripcion: {
        estado: EstadoSuscripcion.Activa,
        producto: 'plus_anual',
        tienda: TiendaSuscripcion.PlayStore,
        venceEn: enUnMes,
      },
      permisos: [],
    });

    expect(await useCase.execute({ userId: 'user-1' })).toEqual({
      plan: Plan.Plus,
      origen: OrigenSuscripcion,
      venceEn: enUnMes,
      renueva: true,
      producto: 'plus_anual',
      tienda: TiendaSuscripcion.PlayStore,
    });
  });

  it('evalúa la vigencia con el reloj inyectado', async () => {
    const { useCase } = crear({
      suscripcion: null,
      permisos: [
        {
          motivo: MotivoPermiso.Prueba,
          otorgadoEn: new Date('2026-11-10T12:00:00.000Z'),
          venceEn: ahora,
          revocadoEn: null,
        },
      ],
    });

    const plan = await useCase.execute({ userId: 'user-1' });

    expect(plan.plan).toBe(Plan.Gratis);
  });
});
