/** Plan de una cuenta (PLA-01). */
export enum Plan {
  Gratis = 'gratis',
  Plus = 'plus',
}

/** Motivo de un permiso Plus concedido por el API (ADR-015 §1). */
export enum MotivoPermiso {
  Prueba = 'prueba',
  TesterVitalicio = 'tester_vitalicio',
  Fundador = 'fundador',
}

/** Estado de una suscripción de tienda (ADR-012 §1, sin `prueba`: ADR-015 §3). */
export enum EstadoSuscripcion {
  Activa = 'activa',
  EnGracia = 'en_gracia',
  Cancelada = 'cancelada',
  Vencida = 'vencida',
}

export enum TiendaSuscripcion {
  AppStore = 'app_store',
  PlayStore = 'play_store',
}

/** Origen del plan cuando viene de una suscripción de tienda. */
export const OrigenSuscripcion = 'suscripcion';

export type OrigenPlan = typeof OrigenSuscripcion | MotivoPermiso;

export interface Suscripcion {
  readonly estado: EstadoSuscripcion;
  /** Identificador del producto en la tienda. */
  readonly producto: string;
  readonly tienda: TiendaSuscripcion;
  /** Fin del acceso: fin del período pagado o del período de gracia. */
  readonly venceEn: Date;
}

export interface PermisoPlan {
  readonly motivo: MotivoPermiso;
  readonly otorgadoEn: Date;
  /** `null` cuando el permiso no vence. */
  readonly venceEn: Date | null;
  readonly revocadoEn: Date | null;
}

export interface PlanEfectivo {
  readonly plan: Plan;
  /** `null` en el plan gratis. */
  readonly origen: OrigenPlan | null;
  /** `null` en el plan gratis y en un permiso que no vence. */
  readonly venceEn: Date | null;
  /** `true` solo si una suscripción se va a cobrar de nuevo. */
  readonly renueva: boolean;
  /** Producto y tienda de la suscripción; `null` en cualquier otro origen. */
  readonly producto: string | null;
  readonly tienda: TiendaSuscripcion | null;
}

const PLAN_GRATIS: PlanEfectivo = {
  plan: Plan.Gratis,
  origen: null,
  venceEn: null,
  renueva: false,
  producto: null,
  tienda: null,
};

function suscripcionVigente(suscripcion: Suscripcion, ahora: Date): boolean {
  return (
    suscripcion.estado !== EstadoSuscripcion.Vencida &&
    suscripcion.venceEn.getTime() > ahora.getTime()
  );
}

function permisoVigente(permiso: PermisoPlan, ahora: Date): boolean {
  return (
    permiso.revocadoEn === null &&
    (permiso.venceEn === null || permiso.venceEn.getTime() > ahora.getTime())
  );
}

/** Un origen sin vencimiento dura más que cualquiera con fecha. */
function duraMas(candidato: PlanEfectivo, actual: PlanEfectivo): boolean {
  if (actual.venceEn === null) {
    return false;
  }
  return (
    candidato.venceEn === null ||
    candidato.venceEn.getTime() > actual.venceEn.getTime()
  );
}

/**
 * resolverPlanEfectivo — una cuenta tiene Plus si tiene una suscripción
 * vigente o un permiso vigente (ADR-015 §2). Con más de un origen vigente
 * informa el que dura más; con la misma fecha, la suscripción.
 */
export function resolverPlanEfectivo(
  suscripcion: Suscripcion | null,
  permisos: readonly PermisoPlan[],
  ahora: Date,
): PlanEfectivo {
  const vigentes: PlanEfectivo[] = [];

  if (suscripcion !== null && suscripcionVigente(suscripcion, ahora)) {
    vigentes.push({
      plan: Plan.Plus,
      origen: OrigenSuscripcion,
      venceEn: suscripcion.venceEn,
      renueva: suscripcion.estado !== EstadoSuscripcion.Cancelada,
      producto: suscripcion.producto,
      tienda: suscripcion.tienda,
    });
  }

  for (const permiso of permisos) {
    if (permisoVigente(permiso, ahora)) {
      vigentes.push({
        plan: Plan.Plus,
        origen: permiso.motivo,
        venceEn: permiso.venceEn,
        renueva: false,
        producto: null,
        tienda: null,
      });
    }
  }

  return vigentes.reduce(
    (actual, candidato) =>
      actual.plan === Plan.Gratis || duraMas(candidato, actual)
        ? candidato
        : actual,
    PLAN_GRATIS,
  );
}
