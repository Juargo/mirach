import {
  EstadoSuscripcion,
  MotivoPermiso,
  OrigenSuscripcion,
  Plan,
  TiendaSuscripcion,
  resolverPlanEfectivo,
  type PermisoPlan,
  type Suscripcion,
} from './plan';

const ahora = new Date('2026-12-10T12:00:00.000Z');
const ayer = new Date('2026-12-09T12:00:00.000Z');
const enUnMes = new Date('2027-01-10T12:00:00.000Z');
const enUnAnio = new Date('2027-12-10T12:00:00.000Z');

function suscripcion(cambios: Partial<Suscripcion> = {}): Suscripcion {
  return {
    estado: EstadoSuscripcion.Activa,
    producto: 'plus_mensual',
    tienda: TiendaSuscripcion.AppStore,
    venceEn: enUnMes,
    ...cambios,
  };
}

function permiso(cambios: Partial<PermisoPlan> = {}): PermisoPlan {
  return {
    motivo: MotivoPermiso.Prueba,
    otorgadoEn: ayer,
    venceEn: enUnMes,
    revocadoEn: null,
    ...cambios,
  };
}

describe('resolverPlanEfectivo', () => {
  it('sin suscripción ni permisos es el plan gratis', () => {
    expect(resolverPlanEfectivo(null, [], ahora)).toEqual({
      plan: Plan.Gratis,
      origen: null,
      venceEn: null,
      renueva: false,
      producto: null,
      tienda: null,
    });
  });

  it('una suscripción activa da Plus y se renueva', () => {
    expect(resolverPlanEfectivo(suscripcion(), [], ahora)).toEqual({
      plan: Plan.Plus,
      origen: OrigenSuscripcion,
      venceEn: enUnMes,
      renueva: true,
      producto: 'plus_mensual',
      tienda: TiendaSuscripcion.AppStore,
    });
  });

  it('una suscripción en gracia da Plus y se renueva', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ estado: EstadoSuscripcion.EnGracia }),
      [],
      ahora,
    );

    expect(plan.plan).toBe(Plan.Plus);
    expect(plan.renueva).toBe(true);
  });

  it('una suscripción cancelada da Plus hasta su vencimiento y no se renueva', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ estado: EstadoSuscripcion.Cancelada }),
      [],
      ahora,
    );

    expect(plan.plan).toBe(Plan.Plus);
    expect(plan.venceEn).toEqual(enUnMes);
    expect(plan.renueva).toBe(false);
  });

  it('una suscripción vencida es el plan gratis', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ estado: EstadoSuscripcion.Vencida }),
      [],
      ahora,
    );

    expect(plan.plan).toBe(Plan.Gratis);
    expect(plan.origen).toBeNull();
  });

  it('una suscripción activa cuya fecha ya pasó es el plan gratis', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ venceEn: ayer }),
      [],
      ahora,
    );

    expect(plan.plan).toBe(Plan.Gratis);
  });

  it('una suscripción que vence en este instante ya no da Plus', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ venceEn: ahora }),
      [],
      ahora,
    );

    expect(plan.plan).toBe(Plan.Gratis);
  });

  it('un permiso de prueba vigente da Plus sin renovación ni tienda', () => {
    expect(resolverPlanEfectivo(null, [permiso()], ahora)).toEqual({
      plan: Plan.Plus,
      origen: MotivoPermiso.Prueba,
      venceEn: enUnMes,
      renueva: false,
      producto: null,
      tienda: null,
    });
  });

  it('un permiso vencido es el plan gratis', () => {
    const plan = resolverPlanEfectivo(
      null,
      [permiso({ venceEn: ayer })],
      ahora,
    );

    expect(plan.plan).toBe(Plan.Gratis);
  });

  it('un permiso revocado es el plan gratis aunque no tenga vencimiento', () => {
    const plan = resolverPlanEfectivo(
      null,
      [
        permiso({
          motivo: MotivoPermiso.Fundador,
          venceEn: null,
          revocadoEn: ayer,
        }),
      ],
      ahora,
    );

    expect(plan.plan).toBe(Plan.Gratis);
  });

  it('un permiso sin vencimiento da Plus sin fecha', () => {
    const plan = resolverPlanEfectivo(
      null,
      [permiso({ motivo: MotivoPermiso.TesterVitalicio, venceEn: null })],
      ahora,
    );

    expect(plan).toEqual({
      plan: Plan.Plus,
      origen: MotivoPermiso.TesterVitalicio,
      venceEn: null,
      renueva: false,
      producto: null,
      tienda: null,
    });
  });

  it('con varios orígenes vigentes informa el permiso sin vencimiento', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ venceEn: enUnAnio }),
      [permiso(), permiso({ motivo: MotivoPermiso.Fundador, venceEn: null })],
      ahora,
    );

    expect(plan.origen).toBe(MotivoPermiso.Fundador);
    expect(plan.venceEn).toBeNull();
    expect(plan.renueva).toBe(false);
  });

  it('entre orígenes con fecha informa el que vence más tarde', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ venceEn: enUnAnio }),
      [permiso()],
      ahora,
    );

    expect(plan.origen).toBe(OrigenSuscripcion);
    expect(plan.venceEn).toEqual(enUnAnio);
  });

  it('una prueba que dura más que la suscripción se informa como prueba', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ venceEn: enUnMes }),
      [permiso({ venceEn: enUnAnio })],
      ahora,
    );

    expect(plan.origen).toBe(MotivoPermiso.Prueba);
  });

  it('con la misma fecha prefiere la suscripción', () => {
    const plan = resolverPlanEfectivo(suscripcion(), [permiso()], ahora);

    expect(plan.origen).toBe(OrigenSuscripcion);
  });

  it('ignora un origen vencido cuando hay otro vigente', () => {
    const plan = resolverPlanEfectivo(
      suscripcion({ estado: EstadoSuscripcion.Vencida, venceEn: ayer }),
      [permiso()],
      ahora,
    );

    expect(plan.origen).toBe(MotivoPermiso.Prueba);
  });
});
