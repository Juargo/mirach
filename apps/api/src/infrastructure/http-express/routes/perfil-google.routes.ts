import type { Router } from 'express';
import type { IniciarVinculacionGoogleUseCase } from '../../../application/use-cases/iniciar-vinculacion-google.use-case';
import type { DesvincularGoogleUseCase } from '../../../application/use-cases/desvincular-google.use-case';
import {
  vincularGoogleRequestSchema,
  desvincularGoogleRequestSchema,
} from '../schemas/perfil-google.schema';
import { firmarLinkIntent } from '../../http/auth/link-intent';
import { serializeOauthCookie } from '../../http/auth/oauth-transient-cookie';
import { aPerfilHttpError } from './perfil-http-error';

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

/**
 * Dependencias de `POST /api/perfil/google/vincular` (US-041, design.md
 * §1/Q2b/§4.1). Solo la mitad LINK del leg 1 — `registrarPerfilGoogleDesvincular`
 * (sin gate de activación) vive más abajo en este archivo.
 */
export interface PerfilGoogleDeps {
  readonly iniciarVinculacion: IniciarVinculacionGoogleUseCase;
  /** Pass-through de `container.googleAuth.linkIntentKey` — la ruta firma, nunca el use case (D-01). */
  readonly linkIntentKey: Buffer;
  readonly cookieSecure: boolean;
}

/**
 * registrarPerfilGoogleVincular — `POST /api/perfil/google/vincular`,
 * montado en `protectedApi` ÚNICAMENTE cuando `container.googleAuth !==
 * undefined` (design §1/Q2b — ver `registrarPerfilGoogleVincularDeshabilitado`
 * para el otro lado del gate y por qué existe).
 *
 * `.safeParse()` en el boundary; un fallo NUNCA ecoa el body ni los issues
 * de Zod (mismo idioma que `registrarPerfil`). `esDemo`/`userId` se hilvanan
 * SIEMPRE desde `req` (sesión), nunca desde el body — el schema `.strict()`
 * ya rechaza un `userId` extra, esto es la segunda barrera.
 *
 * **La ruta es dueña de todo lo que el use case no debe conocer (D-01,
 * G1-G6, design §4.1)**: firma el link-intent con `linkIntentKey` sobre el
 * `state` que el propio `iniciar()` produjo, y arma la cookie `md_oauth`
 * exactamente igual que `registrarAuthGoogle` (mismo nombre/Path/Max-Age/
 * HttpOnly/SameSite/Secure — VINC041-01 no agrega superficie de cookie
 * nueva).
 */
export function registrarPerfilGoogleVincular(
  router: Router,
  deps: PerfilGoogleDeps,
): void {
  const { iniciarVinculacion, linkIntentKey, cookieSecure } = deps;

  router.post('/perfil/google/vincular', async (req, res, next) => {
    try {
      const parsed = vincularGoogleRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await iniciarVinculacion.execute({
        userId: req.userId!,
        esDemo: req.esDemo!,
        passwordActual: parsed.data.passwordActual,
      });

      if (result.isFail()) {
        const { status, code, message } = aPerfilHttpError(result.getError());
        res.status(status).json({ message, code });
        return;
      }

      const inicio = result.getValue();
      const link = firmarLinkIntent(linkIntentKey, inicio.state, req.userId!);
      res.setHeader(
        'Set-Cookie',
        serializeOauthCookie(
          {
            state: inicio.state,
            nonce: inicio.nonce,
            codeVerifier: inicio.codeVerifier,
            link,
          },
          cookieSecure,
        ),
      );
      res.status(200).json({ urlAutorizacion: inicio.urlAutorizacion });
    } catch (err) {
      next(err);
    }
  });
}

/**
 * registrarPerfilGoogleVincularDeshabilitado — el stub de
 * `POST /api/perfil/google/vincular` cuando Google está apagado
 * (`container.googleAuth === undefined`).
 *
 * **CRITICAL bug que esto corrige (design §1/Q2b, binding item #4)**: la
 * ruta real llama `iniciador.iniciar()`, que solo existe cuando Google está
 * prendido — montarla sin condición produce un `TypeError` → `500` en TODO
 * ambiente sin `GOOGLE_CLIENT_ID`, incluyendo el propio entorno de test de
 * la API. "Simplemente no montarla" tampoco funciona: `protectedApi` monta
 * `sessionMiddleware` vía `router.use(mw)`, que corre para TODA request que
 * llegue al router, matcheada o no — un path no-montado cae en ese
 * middleware y responde `401`, no el `404` que exige la paridad AUTH-16.
 * Por eso este stub existe y se monta SIEMPRE en el lado apagado del gate
 * (mismo idioma que `registrarAuthGoogleDeshabilitado`).
 */
export function registrarPerfilGoogleVincularDeshabilitado(
  router: Router,
): void {
  router.post('/perfil/google/vincular', (_req, res) => {
    res.status(404).end();
  });
}

/**
 * registrarPerfilGoogleDesvincular — `POST /api/perfil/google/desvincular`
 * (US-041, VINC041-05, design.md §1/Q2b/§4.3).
 *
 * **GUARD note (binding item #4, second half — deliberate, not an
 * omission)**: montada en `protectedApi` SIEMPRE, sin gate de activación —
 * a diferencia de `registrarPerfilGoogleVincular`. Un usuario que se
 * vinculó mientras Google estaba prendido debe poder desvincular después
 * de que se apague; limpiar `googleSub` no necesita cliente OIDC ni
 * discovery, así que no hay nada que gatear.
 *
 * Mismo idioma que `registrarPerfilGoogleVincular`: `.safeParse()` en el
 * boundary, nunca ecoa el body ni los issues de Zod; `esDemo`/`userId`
 * siempre desde `req` (sesión), nunca desde el body.
 */
export function registrarPerfilGoogleDesvincular(
  router: Router,
  desvincularGoogle: DesvincularGoogleUseCase,
): void {
  router.post('/perfil/google/desvincular', async (req, res, next) => {
    try {
      const parsed = desvincularGoogleRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await desvincularGoogle.execute({
        userId: req.userId!,
        esDemo: req.esDemo!,
        passwordActual: parsed.data.passwordActual,
      });

      if (result.isFail()) {
        const { status, code, message } = aPerfilHttpError(result.getError());
        res.status(status).json({ message, code });
        return;
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}
