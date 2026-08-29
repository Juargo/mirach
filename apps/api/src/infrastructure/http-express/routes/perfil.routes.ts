import type { Router } from 'express';
import type { ActualizarPerfilUseCase } from '../../../application/use-cases/actualizar-perfil.use-case';
import type { CambiarPasswordUseCase } from '../../../application/use-cases/cambiar-password.use-case';
import {
  perfilUpdateRequestSchema,
  passwordUpdateRequestSchema,
} from '../schemas/perfil.schema';
import { aPerfilHttpError } from './perfil-http-error';
import { esDemoDeSesion } from '../../http/auth/es-demo-de-sesion';
import { responderErrorTraducido } from './responder-error-traducido';

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

/** Dependencias de `/api/perfil*` (US-040). `cambiarPassword` se suma en PR#2. */
export interface PerfilGraph {
  readonly actualizarPerfil: ActualizarPerfilUseCase;
  readonly cambiarPassword: CambiarPasswordUseCase;
}

/**
 * registrarPerfil — port de `/api/perfil*` (US-040, PERF040-01…09).
 *
 * `.safeParse()` a la entrada (D-09 convention, `categorias.routes.ts`
 * precedent) — un fallo NUNCA ecoa el body ni la lista de issues de Zod.
 * `esDemoDeSesion(req)`/`req.userId!` se hilvanan SIEMPRE desde la sesión,
 * nunca desde el body (PERF040-07 — el schema `.strict()` ya rechaza un
 * `userId` ajeno, esto es la segunda barrera: el body ni siquiera se lee para
 * eso). `req.sessionTokenHash!` (PR#2, PERF040-06) — el hash de la sesión que
 * llama, para que `CambiarPasswordUseCase` sepa a cuál NO revocar.
 *
 * `esDemoDeSesion(req)` (issue #507) reemplaza el `req.esDemo!` original:
 * fail-closed (`req.esDemo ?? true`) en vez de una non-null assertion que no
 * protege nada si `sessionMiddleware` alguna vez no corriera. Toda respuesta
 * de error pasa por `responderErrorTraducido` (issue #507, R2-WARNING del
 * fan-out 4R) — chokepoint único que loguea `logDemoGateTrip` (ADR-033)
 * cuando `code === 'DEMO_SOLO_LECTURA'`, así que un endpoint nuevo no puede
 * olvidar el log con solo copiar `aPerfilHttpError(...)`.
 */
export function registrarPerfil(router: Router, perfil: PerfilGraph): void {
  router.patch('/perfil', async (req, res, next) => {
    try {
      const parsed = perfilUpdateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await perfil.actualizarPerfil.execute({
        userId: req.userId!,
        esDemo: esDemoDeSesion(req),
        nombre: parsed.data.nombre,
        emailRaw: parsed.data.email,
        passwordActual: parsed.data.passwordActual,
      });

      if (result.isFail()) {
        responderErrorTraducido(res, req, aPerfilHttpError(result.getError()));
        return;
      }

      const identidad = result.getValue();
      res.status(200).json({
        userId: identidad.userId,
        nombre: identidad.nombre,
        email: identidad.email,
        esDemo: identidad.esDemo,
        googleVinculado: identidad.googleVinculado,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/perfil/password', async (req, res, next) => {
    try {
      const parsed = passwordUpdateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(BODY_INVALIDO);
        return;
      }

      const result = await perfil.cambiarPassword.execute({
        userId: req.userId!,
        esDemo: esDemoDeSesion(req),
        tokenHashActual: req.sessionTokenHash!,
        passwordActual: parsed.data.passwordActual,
        passwordNueva: parsed.data.passwordNueva,
      });

      if (result.isFail()) {
        responderErrorTraducido(res, req, aPerfilHttpError(result.getError()));
        return;
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
}
