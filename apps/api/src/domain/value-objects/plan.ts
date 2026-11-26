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

/**
 * Origen del plan mientras el cobro no está activo: toda cuenta tiene Plus
 * («Plus gratis durante el lanzamiento», ADR-012).
 */
export const OrigenLanzamiento = 'lanzamiento';

export type OrigenPlan =
  typeof OrigenSuscripcion | typeof OrigenLanzamiento | MotivoPermiso;

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

/** Da acceso en `ahora`: no está vencida y su fecha no pasó. */
export function suscripcionVigente(
  suscripcion: Pick<Suscripcion, 'estado' | 'venceEn'>,
  ahora: Date,
): boolean {
  return (
    suscripcion.estado !== EstadoSuscripcion.Vencida &&
    suscripcion.venceEn.getTime() > ahora.getTime()
  );
}

export function permisoVigente(permiso: PermisoPlan, ahora: Date): boolean {
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

/** Lo que el API sabe de una cuenta para decidir su plan. */
export interface DerechosCuenta {
  /** `null` si la cuenta ya no existe: no se deriva una prueba. */
  readonly cuentaCreadaEn: Date | null;
  readonly suscripcion: Suscripcion | null;
  /** Todos los permisos guardados de la cuenta, vigentes o no. */
  readonly permisos: readonly PermisoPlan[];
}

/** Regla de la prueba de Plus (PLA-02, PLA-09, ADR-015 §3). */
export interface ReglaPrueba {
  /**
   * Desde cuándo se cobra. `null` o una fecha futura: el cobro no está activo
   * y toda cuenta tiene Plus por el lanzamiento.
   */
  readonly cobroActivoDesde: Date | null;
  /** Duración de la prueba; 0 la apaga. */
  readonly diasPrueba: number;
  /** Con cuántos días de anticipación se avisa el fin de la prueba. */
  readonly diasAviso: number;
}

/** La prueba de la cuenta, vigente o ya terminada. */
export interface PruebaCuenta {
  readonly venceEn: Date;
  readonly vigente: boolean;
  /**
   * Días que quedan, redondeados hacia arriba, solo cuando la prueba es lo
   * que da Plus y termina dentro del plazo de aviso; `null` en otro caso.
   */
  readonly avisoDiasRestantes: number | null;
}

export interface PlanCuenta extends PlanEfectivo {
  /** `null` mientras el cobro no está activo o si la cuenta no tiene prueba. */
  readonly prueba: PruebaCuenta | null;
}

/** PLA-09: «Tu prueba Plus termina en 3 días». */
export const DIAS_AVISO_FIN_PRUEBA = 3;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * La prueba no se guarda: corre desde lo más tardío entre la creación de la
 * cuenta y la activación del cobro, así una cuenta que ya existía recibe sus
 * días completos desde la activación.
 */
function derivarPrueba(
  cuentaCreadaEn: Date,
  cobroActivoDesde: Date,
  diasPrueba: number,
): PermisoPlan {
  const inicio = new Date(
    Math.max(cuentaCreadaEn.getTime(), cobroActivoDesde.getTime()),
  );
  return {
    motivo: MotivoPermiso.Prueba,
    otorgadoEn: inicio,
    venceEn: new Date(inicio.getTime() + diasPrueba * MS_POR_DIA),
    revocadoEn: null,
  };
}

/**
 * resolverPlanCuenta — el plan de una cuenta con la prueba incluida
 * (ADR-015 §2 y §3). Mientras el cobro no está activo, una cuenta sin derechos
 * guardados tiene Plus por el lanzamiento. Con el cobro activo, la prueba se
 * deriva de la cuenta salvo que haya un permiso `prueba` guardado, que la
 * reemplaza (permite extenderla o revocarla a mano).
 */
export function resolverPlanCuenta(
  cuenta: DerechosCuenta,
  regla: ReglaPrueba,
  ahora: Date,
): PlanCuenta {
  const { cobroActivoDesde } = regla;
  if (
    cobroActivoDesde === null ||
    cobroActivoDesde.getTime() > ahora.getTime()
  ) {
    const guardado = resolverPlanEfectivo(
      cuenta.suscripcion,
      cuenta.permisos,
      ahora,
    );
    return guardado.plan === Plan.Plus
      ? { ...guardado, prueba: null }
      : {
          ...PLAN_GRATIS,
          plan: Plan.Plus,
          origen: OrigenLanzamiento,
          venceEn: cobroActivoDesde,
          prueba: null,
        };
  }

  const guardada = cuenta.permisos.find(
    (permiso) => permiso.motivo === MotivoPermiso.Prueba,
  );
  const derivada =
    guardada === undefined &&
    cuenta.cuentaCreadaEn !== null &&
    regla.diasPrueba > 0
      ? derivarPrueba(cuenta.cuentaCreadaEn, cobroActivoDesde, regla.diasPrueba)
      : undefined;
  const permisos =
    derivada === undefined ? cuenta.permisos : [...cuenta.permisos, derivada];
  const plan = resolverPlanEfectivo(cuenta.suscripcion, permisos, ahora);

  const prueba = guardada ?? derivada;
  if (prueba === undefined || prueba.venceEn === null) {
    return { ...plan, prueba: null };
  }
  const vigente = permisoVigente(prueba, ahora);
  const restante = prueba.venceEn.getTime() - ahora.getTime();
  const avisa =
    vigente &&
    plan.origen === MotivoPermiso.Prueba &&
    restante <= regla.diasAviso * MS_POR_DIA;
  return {
    ...plan,
    prueba: {
      venceEn: prueba.venceEn,
      vigente,
      avisoDiasRestantes: avisa ? Math.ceil(restante / MS_POR_DIA) : null,
    },
  };
}
