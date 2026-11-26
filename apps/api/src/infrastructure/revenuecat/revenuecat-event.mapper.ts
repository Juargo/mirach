import type { CambioDerechosPlus } from '../../domain/value-objects/cambio-derechos-plus';
import {
  EstadoSuscripcion,
  TiendaSuscripcion,
} from '../../domain/value-objects/plan';
import { Result } from '../../shared/result';

/** A RevenueCat webhook event, reduced to what the API acts on. */
export interface EventoRevenueCat {
  /** Event id: the idempotency key (the same event can be delivered twice). */
  readonly id: string;
  /** RevenueCat `type`, kept for the log. */
  readonly tipo: string;
  readonly cambio: CambioDerechosPlus;
}

export interface OpcionesEventoRevenueCat {
  /** Store product id of the Fundador purchase (ADR-015 §6); unset: not sold. */
  readonly productoFundador: string | undefined;
}

export class EventoRevenueCatInvalidoError extends Error {
  constructor() {
    super('El evento de RevenueCat no tiene el formato esperado.');
    this.name = 'EventoRevenueCatInvalidoError';
  }
}

const TIENDAS: Readonly<Record<string, TiendaSuscripcion>> = {
  APP_STORE: TiendaSuscripcion.AppStore,
  PLAY_STORE: TiendaSuscripcion.PlayStore,
};

/** Events after which the subscription is paid and will renew. */
const ACTIVA = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
]);

/** RevenueCat's own anonymous ids never name a Mirach user. */
const PREFIJO_ANONIMO = '$RCAnonymousID:';

type Campos = Record<string, unknown>;

function esObjeto(valor: unknown): valor is Campos {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}

/** Largest timestamp a `Date` can hold, in milliseconds since the epoch. */
const FECHA_MAXIMA_MS = 8.64e15;

function fecha(valor: unknown): Date | undefined {
  return typeof valor === 'number' &&
    Number.isSafeInteger(valor) &&
    Math.abs(valor) <= FECHA_MAXIMA_MS
    ? new Date(valor)
    : undefined;
}

/** Mirach user ids among the given values, in order, without repeats. */
function usuarios(...valores: unknown[]): string[] {
  const ids = valores
    .flatMap((valor) => (Array.isArray(valor) ? (valor as unknown[]) : [valor]))
    .map(texto)
    .filter(
      (id): id is string => id !== undefined && !id.startsWith(PREFIJO_ANONIMO),
    );
  return [...new Set(ids)];
}

function ignorado(motivo: string): CambioDerechosPlus {
  return { tipo: 'ignorado', motivo };
}

function transferencia(evento: Campos, ocurridoEn: Date): CambioDerechosPlus {
  const desde = usuarios(evento.transferred_from);
  const hacia = usuarios(evento.transferred_to);
  if (desde.length === 0 || hacia.length === 0) {
    return ignorado('transferencia sin origen o destino');
  }
  return { tipo: 'transferencia', desde, hacia, ocurridoEn };
}

function fundador(
  evento: Campos,
  tipo: string,
  cuentas: readonly string[],
  ocurridoEn: Date,
): CambioDerechosPlus {
  if (tipo === 'NON_RENEWING_PURCHASE' || tipo === 'REFUND_REVERSED') {
    return {
      tipo: 'fundador_otorgado',
      usuarios: cuentas,
      ocurridoEn,
      sandbox: evento.environment === 'SANDBOX',
    };
  }
  if (tipo === 'CANCELLATION') {
    return { tipo: 'fundador_revocado', usuarios: cuentas, ocurridoEn };
  }
  return ignorado('evento que no aplica a una compra única');
}

function suscripcion(
  evento: Campos,
  tipo: string,
  producto: string,
  cuentas: readonly string[],
  ocurridoEn: Date,
): CambioDerechosPlus {
  // A promotional entitlement mirrors a grant the API already stores (ADR-015 §4).
  if (evento.period_type === 'PROMOTIONAL') {
    return ignorado('derecho promocional');
  }
  const tienda = TIENDAS[texto(evento.store) ?? ''];
  if (tienda === undefined) {
    return ignorado('tienda no soportada');
  }
  const vencimiento = fecha(evento.expiration_at_ms);
  if (vencimiento === undefined) {
    return ignorado('suscripción sin vencimiento');
  }

  let estado: EstadoSuscripcion;
  let venceEn = vencimiento;
  if (ACTIVA.has(tipo)) {
    estado = EstadoSuscripcion.Activa;
  } else if (tipo === 'BILLING_ISSUE') {
    estado = EstadoSuscripcion.EnGracia;
    venceEn = fecha(evento.grace_period_expiration_at_ms) ?? vencimiento;
  } else if (tipo === 'EXPIRATION') {
    estado = EstadoSuscripcion.Vencida;
  } else if (tipo === 'CANCELLATION') {
    // A refund ends access at once; any other cancellation keeps the paid period.
    const reembolso = evento.cancel_reason === 'CUSTOMER_SUPPORT';
    estado = reembolso
      ? EstadoSuscripcion.Vencida
      : EstadoSuscripcion.Cancelada;
    venceEn = reembolso ? ocurridoEn : vencimiento;
  } else {
    return ignorado('tipo de evento sin efecto');
  }

  return {
    tipo: 'suscripcion',
    usuarios: cuentas,
    suscripcion: { estado, producto, tienda, venceEn },
    ocurridoEn,
  };
}

function cambio(
  evento: Campos,
  tipo: string,
  ocurridoEn: Date,
  opciones: OpcionesEventoRevenueCat,
): CambioDerechosPlus {
  if (tipo === 'TRANSFER') {
    return transferencia(evento, ocurridoEn);
  }
  const producto = texto(evento.product_id);
  if (producto === undefined) {
    return ignorado('evento sin producto');
  }
  const cuentas = usuarios(
    evento.app_user_id,
    evento.original_app_user_id,
    evento.aliases,
  );
  if (cuentas.length === 0) {
    return ignorado('evento sin usuario de Mirach');
  }
  if (producto === opciones.productoFundador) {
    return fundador(evento, tipo, cuentas, ocurridoEn);
  }
  if (tipo === 'NON_RENEWING_PURCHASE') {
    return ignorado('compra única de otro producto');
  }
  return suscripcion(evento, tipo, producto, cuentas, ocurridoEn);
}

/**
 * interpretarEventoRevenueCat — turns a webhook body into the change it makes to
 * Plus entitlements (ADR-012 §1, ADR-015 §5). Fails only when the envelope is
 * not an event at all; an event the API does not act on, including a type
 * RevenueCat adds later, is `ignorado` so the webhook still answers 200.
 */
export function interpretarEventoRevenueCat(
  cuerpo: unknown,
  opciones: OpcionesEventoRevenueCat,
): Result<EventoRevenueCat, EventoRevenueCatInvalidoError> {
  const evento = esObjeto(cuerpo) ? cuerpo.event : undefined;
  if (!esObjeto(evento)) {
    return Result.fail(new EventoRevenueCatInvalidoError());
  }
  const id = texto(evento.id);
  const tipo = texto(evento.type);
  const ocurridoEn = fecha(evento.event_timestamp_ms);
  if (id === undefined || tipo === undefined || ocurridoEn === undefined) {
    return Result.fail(new EventoRevenueCatInvalidoError());
  }

  return Result.ok({
    id,
    tipo,
    cambio: cambio(evento, tipo, ocurridoEn, opciones),
  });
}
