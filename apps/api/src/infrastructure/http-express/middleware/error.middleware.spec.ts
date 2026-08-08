import express, { type Express } from 'express';
import request from 'supertest';
import { errorMiddleware } from './error.middleware';
import { LoginConGoogleFallidoError } from '../../../domain/errors/login-con-google-fallido.error';
import type { MotivoFalloGoogle } from '../../../domain/errors/login-con-google-fallido.error';

/**
 * errorMiddleware — red de seguridad para errores que se ESCAPAN a un
 * handler (nunca lanzados a propósito por un handler bien escrito, pero
 * `LoginConGoogleFallidoError` es exactamente el tipo de error de dominio
 * que un `next(err)` podría reenviar si algún camino de Slice C2 no lo
 * atrapa explícitamente). AUTH-15 exige que TODAS las ramas de fallo
 * colapsen al mismo resultado observable — este test es el guard de
 * consistencia a nivel de middleware: `motivo` (el enum de 6 razones
 * internas, solo para logging server-side) NUNCA debe aparecer en el body
 * ni en ningún header de la respuesta al cliente, para NINGÚN valor de
 * `motivo` (4R carry-forward, re-corrido contra la ruta real de callback en
 * Slice C2 — este es el nivel unitario).
 */
function probeApp(): Express {
  const app = express();
  app.get('/probe/:motivo', (req, _res, next) => {
    next(
      new LoginConGoogleFallidoError(req.params.motivo as MotivoFalloGoogle),
    );
  });
  app.use(errorMiddleware);
  return app;
}

describe('errorMiddleware — nunca serializa motivo de LoginConGoogleFallidoError al cliente (AUTH-15)', () => {
  const TODOS_LOS_MOTIVOS: MotivoFalloGoogle[] = [
    'sin-match',
    'email-no-verificado',
    'usuario-demo',
    'ya-vinculado-a-otra-identidad',
    'link-perdio-la-carrera',
    'email-invalido',
  ];

  it.each(TODOS_LOS_MOTIVOS)(
    'motivo="%s" — el body 500 es el mensaje genérico, nunca "motivo" ni su valor',
    async (motivo) => {
      const res = await request(probeApp()).get(`/probe/${motivo}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Error inesperado. Intenta nuevamente.',
      });
      expect(JSON.stringify(res.body)).not.toContain('motivo');
      expect(JSON.stringify(res.body)).not.toContain(motivo);
    },
  );

  it('el mensaje genérico es byte-idéntico entre distintos motivos (AUTH-15 — no enumeración)', async () => {
    const resA = await request(probeApp()).get('/probe/sin-match');
    const resB = await request(probeApp()).get(
      '/probe/ya-vinculado-a-otra-identidad',
    );

    expect(resA.body).toEqual(resB.body);
    expect(resA.status).toBe(resB.status);
  });
});
