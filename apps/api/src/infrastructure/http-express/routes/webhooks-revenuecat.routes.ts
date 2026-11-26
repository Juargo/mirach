import { createHash, timingSafeEqual } from 'node:crypto';
import type { Router } from 'express';
import type {
  ProcesarEventoSuscripcionUseCase,
  ResultadoEventoSuscripcion,
} from '../../../application/use-cases/procesar-evento-suscripcion.use-case';
import { interpretarEventoRevenueCat } from '../../revenuecat/revenuecat-event.mapper';

/** Dependencies of the RevenueCat webhook (ADR-012 §1). */
export interface WebhookRevenueCatGraph {
  readonly procesarEvento: ProcesarEventoSuscripcionUseCase;
  /** Value RevenueCat sends in `Authorization`, configured in its dashboard. */
  readonly secreto: string;
  /** Store product id of the Fundador purchase (ADR-015 §6). */
  readonly productoFundador: string | undefined;
}

const RUTA = '/webhooks/revenuecat';

/** Fixed-length digests: the comparison leaks neither content nor length. */
function mismoSecreto(recibido: string, esperado: string): boolean {
  const digest = (valor: string) => createHash('sha256').update(valor).digest();
  return timingSafeEqual(digest(recibido), digest(esperado));
}

function autorizado(header: string | undefined, secreto: string): boolean {
  if (header === undefined) {
    return false;
  }
  // The dashboard value may be saved with or without the `Bearer` scheme.
  return (
    mismoSecreto(header, secreto) || mismoSecreto(header, `Bearer ${secreto}`)
  );
}

/**
 * registrarWebhookRevenueCat — `POST /api/webhooks/revenuecat` (ADR-012 §1).
 *
 * RevenueCat calls it, not the apps: it is mounted before the api-key
 * middleware, carries no session and is left out of `openapi.json`, which is
 * the contract the app clients are generated from (ADR-005). Its only
 * credential is the secret in `Authorization`.
 *
 * Request: a RevenueCat event, `{ event: { id, type, event_timestamp_ms, ... } }`
 * (https://www.revenuecat.com/docs/integrations/webhooks).
 * Responses: 200 `{ resultado }` with `aplicado`, `duplicado`, `obsoleto`,
 * `usuario_desconocido` or `ignorado`; 400 when the body is not an event; 401
 * for a missing or wrong secret; 404 when the webhook is not configured.
 * Every event the API understands answers 200, including the
 * ones it ignores, because any other status makes RevenueCat retry; an
 * unexpected failure goes to `next(err)` (500) so the retry happens.
 */
export function registrarWebhookRevenueCat(
  router: Router,
  graph: WebhookRevenueCatGraph,
): void {
  const { procesarEvento, secreto, productoFundador } = graph;

  router.post(RUTA, async (req, res, next) => {
    try {
      if (!autorizado(req.get('authorization'), secreto)) {
        res.status(401).json({ message: 'No autorizado.' });
        return;
      }

      const evento = interpretarEventoRevenueCat(req.body, {
        productoFundador,
      });
      if (evento.isFail()) {
        res.status(400).json({ message: evento.getError().message });
        return;
      }

      const { id, tipo, cambio } = evento.getValue();
      const body: { resultado: ResultadoEventoSuscripcion } = {
        resultado: await procesarEvento.execute({
          eventoId: id,
          tipoEvento: tipo,
          cambio,
        }),
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  });
}

/** Without a configured secret the webhook does not exist: 404. */
export function registrarWebhookRevenueCatDeshabilitado(router: Router): void {
  router.post(RUTA, (_req, res) => {
    res.status(404).json({ message: 'Not Found' });
  });
}
