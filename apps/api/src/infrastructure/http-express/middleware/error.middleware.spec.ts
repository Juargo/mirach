import express, { type Express } from 'express';
import request from 'supertest';
import { errorMiddleware } from './error.middleware';
import { LoginConGoogleFallidoError } from '../../../domain/errors/login-con-google-fallido.error';
import type { MotivoFalloGoogle } from '../../../domain/errors/login-con-google-fallido.error';
import { MovimientoManualInvalidoError } from '../../../domain/errors/movimiento-manual-invalido.error';
import { appLogger } from '../../logging/app-logger';

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
    'creacion-perdio-la-carrera',
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
    const resA = await request(probeApp()).get(
      '/probe/creacion-perdio-la-carrera',
    );
    const resB = await request(probeApp()).get(
      '/probe/ya-vinculado-a-otra-identidad',
    );

    expect(resA.body).toEqual(resB.body);
    expect(resA.status).toBe(resB.status);
  });
});

/**
 * Diagnosticabilidad del log server-side: `errorName` a secas no alcanza.
 * Un `PrismaClientKnownRequestError` sin su `code` obliga a adivinar entre
 * decenas de fallas distintas (P2022 columna inexistente, P2002 unique,
 * P1001 DB inalcanzable...), y lo mismo pasa con un `ECONNREFUSED` de Node.
 *
 * El contrato NO se relaja del lado del cliente: la respuesta sigue siendo el
 * mismo 500 genérico y byte-idéntico (AUTH-15). Lo que cambia es SOLO el log,
 * donde no hay a quién proteger.
 *
 * El guard de forma es la contraparte: se loguea `code` únicamente cuando es
 * un TOKEN DE MÁQUINA (mayúsculas, dígitos y `_`), nunca prosa. Esa es la
 * frontera que importa — un `code` enumerado no transporta datos del request;
 * un string libre sí podría traer interpolado un monto, un email o una
 * descripción (ADR-013).
 */
function probeConError(err: unknown): Express {
  const app = express();
  app.get('/probe', (_req, _res, next) => next(err));
  app.use(errorMiddleware);
  return app;
}

function errorCon(name: string, code: unknown): Error {
  const err = new Error('mensaje interno que nunca se serializa');
  err.name = name;
  (err as Error & { code?: unknown }).code = code;
  return err;
}

describe('errorMiddleware — loguea el code de máquina para diagnóstico', () => {
  // vitest.config.ts no setea `restoreMocks`: sin esto los spies se apilan
  // entre tests y un `toHaveBeenCalledWith` pasaría por una llamada de OTRO
  // test — justo lo que invalidaría los casos negativos de abajo.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PrismaClientKnownRequestError: loguea errorCode "P2022" junto al errorName', async () => {
    const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => {});

    await request(
      probeConError(errorCon('PrismaClientKnownRequestError', 'P2022')),
    ).get('/probe');

    expect(errorSpy).toHaveBeenCalledWith('Error inesperado en la API', {
      errorName: 'PrismaClientKnownRequestError',
      errorCode: 'P2022',
    });
  });

  it('error de red de Node: loguea errorCode "ECONNREFUSED"', async () => {
    const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => {});

    await request(probeConError(errorCon('Error', 'ECONNREFUSED'))).get(
      '/probe',
    );

    expect(errorSpy).toHaveBeenCalledWith('Error inesperado en la API', {
      errorName: 'Error',
      errorCode: 'ECONNREFUSED',
    });
  });

  it('error de dominio con code enumerado (SCREAMING_SNAKE): lo loguea', async () => {
    const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => {});

    await request(
      probeConError(new MovimientoManualInvalidoError('FECHA_FUTURA')),
    ).get('/probe');

    expect(errorSpy).toHaveBeenCalledWith('Error inesperado en la API', {
      errorName: 'MovimientoManualInvalidoError',
      errorCode: 'FECHA_FUTURA',
    });
  });

  it('error SIN code: el contexto queda con errorName solo, sin la clave errorCode', async () => {
    const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => {});

    await request(probeConError(new Error('pelado'))).get('/probe');

    expect(errorSpy).toHaveBeenCalledWith('Error inesperado en la API', {
      errorName: 'Error',
    });
  });

  it.each([
    ['prosa con datos del request', 'monto 45000 de jorge@ejemplo.cl'],
    ['kebab-case en minúsculas', 'email-no-verificado'],
    ['token demasiado largo', 'A'.repeat(33)],
    ['no es string', 500],
    ['string vacío', ''],
  ])(
    'code que no es token de máquina (%s): NO se loguea',
    async (_caso, code) => {
      const errorSpy = vi
        .spyOn(appLogger, 'error')
        .mockImplementation(() => {});

      await request(probeConError(errorCon('Error', code))).get('/probe');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('Error inesperado en la API', {
        errorName: 'Error',
      });
    },
  );

  it('el code NUNCA llega al cliente: el body sigue siendo el 500 genérico', async () => {
    vi.spyOn(appLogger, 'error').mockImplementation(() => {});

    const res = await request(
      probeConError(errorCon('PrismaClientKnownRequestError', 'P2022')),
    ).get('/probe');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      message: 'Error inesperado. Intenta nuevamente.',
    });
    expect(JSON.stringify(res.body)).not.toContain('P2022');
    expect(JSON.stringify(res.headers)).not.toContain('P2022');
  });
});
