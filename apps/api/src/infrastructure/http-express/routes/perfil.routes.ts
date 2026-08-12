import type { Router } from 'express';
import type { ActualizarPerfilUseCase } from '../../../application/use-cases/actualizar-perfil.use-case';
import { perfilUpdateRequestSchema } from '../schemas/perfil.schema';
import { aPerfilHttpError } from './perfil-http-error';

const BODY_INVALIDO = {
  message: 'Cuerpo de la petición inválido.',
  code: 'BODY_INVALIDO',
};

/** Dependencias de `/api/perfil` — PR#1 (nombre/email write). */
export interface PerfilGraph {
  readonly actualizarPerfil: ActualizarPerfilUseCase;
}

/**
 * registrarPerfil — port de `/api/perfil` (US-040, PERF040-01…04/07/08).
 *
 * `.safeParse()` a la entrada (D-09 convention, `categorias.routes.ts`
 * precedent) — un fallo NUNCA ecoa el body ni la lista de issues de Zod.
 * `req.esDemo!`/`req.userId!` se hilvanan SIEMPRE desde la sesión, nunca
 * desde el body (PERF040-07 — el schema `.strict()` ya rechaza un `userId`
 * ajeno, esto es la segunda barrera: el body ni siquiera se lee para eso).
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
        esDemo: req.esDemo!,
        nombre: parsed.data.nombre,
        emailRaw: parsed.data.email,
        passwordActual: parsed.data.passwordActual,
      });

      if (result.isFail()) {
        const { status, code, message } = aPerfilHttpError(result.getError());
        res.status(status).json({ message, code });
        return;
      }

      const identidad = result.getValue();
      res.status(200).json({
        userId: identidad.userId,
        nombre: identidad.nombre,
        email: identidad.email,
        esDemo: identidad.esDemo,
      });
    } catch (err) {
      next(err);
    }
  });
}
