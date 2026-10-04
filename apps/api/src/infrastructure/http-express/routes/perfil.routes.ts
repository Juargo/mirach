import type { Router } from 'express';
import type { ActualizarPerfilUseCase } from '../../../application/use-cases/actualizar-perfil.use-case';
import type { CambiarPasswordUseCase } from '../../../application/use-cases/cambiar-password.use-case';
import {
  perfilUpdateRequestSchema,
  passwordUpdateRequestSchema,
} from '../schemas/perfil.schema';
import { aPerfilHttpError } from './perfil-http-error';
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
 * `req.userId!` se hilvana SIEMPRE desde la sesión,
 * nunca desde el body (PERF040-07 — el schema `.strict()` ya rechaza un
 * `userId` ajeno, esto es la segunda barrera: el body ni siquiera se lee para
 * eso). `req.sessionTokenHash!` (PR#2, PERF040-06) — el hash de la sesión que
 * llama, para que `CambiarPasswordUseCase` sepa a cuál NO revocar.
 *
 * Toda respuesta de error pasa por `responderErrorTraducido` (issue #507).
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
        nombre: parsed.data.nombre,
        emailRaw: parsed.data.email,
        passwordActual: parsed.data.passwordActual,
      });

      if (result.isFail()) {
        responderErrorTraducido(res, aPerfilHttpError(result.getError()));
        return;
      }

      const identidad = result.getValue();
      res.status(200).json({
        userId: identidad.userId,
        nombre: identidad.nombre,
        email: identidad.email,
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
        tokenHashActual: req.sessionTokenHash!,
        passwordActual: parsed.data.passwordActual,
        passwordNueva: parsed.data.passwordNueva,
      });

      if (result.isFail()) {
        responderErrorTraducido(res, aPerfilHttpError(result.getError()));
        return;
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
}
