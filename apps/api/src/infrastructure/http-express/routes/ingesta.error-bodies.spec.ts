import express, { type Express } from 'express';
import request from 'supertest';
import type { z } from 'zod';
import type { Mock } from 'vitest';
import { registrarIngestas } from './ingesta.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import {
  CODIGOS_INGESTA_400,
  ingestaCatalogoIncompletoResponseSchema,
  ingestaCatalogoNoDisponibleResponseSchema,
  ingestaErrorResponseSchema,
  serverErrorResponseSchema,
} from '../schemas/ingesta-error.schema';
import { bodyIssues } from '../schemas/body-issues.spec-helper';
import { Bucket } from '../../../domain/value-objects/bucket';
import { ExtensionNoPermitidaError } from '../../../domain/errors/extension-no-permitida.error';
import { PersistenciaFallidaError } from '../../../domain/errors/persistencia-fallida.error';
import { CategorizacionFallidaError } from '../../../domain/errors/categorizacion-fallida.error';
import { PdfProtegidoError } from '../../../domain/errors/pdf-protegido.error';
import { SinMovimientosError } from '../../../domain/errors/sin-movimientos.error';
import { CatalogoIncompletoError } from '../../../domain/errors/catalogo-incompleto.error';
import { RowIndexFueraDeRangoError } from '../../../domain/errors/row-index-fuera-de-rango.error';
import { CategoriaFueraDeCatalogoError } from '../../../domain/errors/categoria-fuera-de-catalogo.error';
import { EdicionesInvalidasError } from '../../../domain/errors/ediciones-invalidas.error';
import type { ProcessIngestaUseCase } from '../../../application/use-cases/process-ingesta.use-case';
import type { PreviewIngestaUseCase } from '../../../application/use-cases/preview-ingesta.use-case';
import type { CommitIngestaUseCase } from '../../../application/use-cases/commit-ingesta.use-case';

/**
 * The OpenAPI document declares the error bodies of the three upload
 * endpoints from the zod schemas in `schemas/ingesta-error.schema.ts`. Native
 * clients are generated from that spec, so each body the routes really emit
 * is validated here against the same schema, with `additionalProperties:
 * false` (a drift between emitter and spec fails the test).
 */
type Endpoint = 'ingestas' | 'preview' | 'commit';
const ENDPOINTS: ReadonlyArray<{ nombre: Endpoint; ruta: string }> = [
  { nombre: 'ingestas', ruta: '/api/ingestas' },
  { nombre: 'preview', ruta: '/api/ingestas/preview' },
  { nombre: 'commit', ruta: '/api/ingestas/commit' },
];

type Execute = Mock<(...args: unknown[]) => Promise<unknown>>;
const doble = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();

function appWith(nombre: Endpoint, execute: Execute): Express {
  const fallback = { execute: doble() };
  const doubles = {
    processIngesta: fallback,
    previewIngesta: fallback,
    commitIngesta: fallback,
    eliminarIngesta: fallback,
    listarIngestas: fallback,
  };
  if (nombre === 'ingestas') doubles.processIngesta = { execute };
  if (nombre === 'preview') doubles.previewIngesta = { execute };
  if (nombre === 'commit') doubles.commitIngesta = { execute };

  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarIngestas(router, {
    processIngesta: doubles.processIngesta as unknown as ProcessIngestaUseCase,
    previewIngesta: doubles.previewIngesta as unknown as PreviewIngestaUseCase,
    commitIngesta: doubles.commitIngesta as unknown as CommitIngestaUseCase,
    eliminarIngesta: doubles.eliminarIngesta as never,
    listarIngestas: doubles.listarIngestas as never,
  });
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

async function subir(nombre: Endpoint, ruta: string, execute: Execute) {
  return request(appWith(nombre, execute))
    .post(ruta)
    .attach('file', Buffer.from('contenido'), 'cartola.xlsx');
}

const falla = (error: Error): Execute =>
  doble().mockResolvedValue(Result.fail(error));

describe.each(ENDPOINTS)(
  'upload error bodies — POST $ruta',
  ({ nombre, ruta }) => {
    const casos: ReadonlyArray<
      readonly [
        string,
        Execute,
        number,
        z.ZodObject,
        { code?: string } | undefined,
      ]
    > = [
      [
        'PDF_PROTEGIDO',
        falla(new PdfProtegidoError('c.pdf', 'requiere-password')),
        400,
        ingestaErrorResponseSchema,
        { code: 'PDF_PROTEGIDO' },
      ],
      [
        'PDF_PASSWORD_INCORRECTA',
        falla(new PdfProtegidoError('c.pdf', 'password-incorrecta')),
        400,
        ingestaErrorResponseSchema,
        { code: 'PDF_PASSWORD_INCORRECTA' },
      ],
      [
        'SIN_MOVIMIENTOS',
        falla(new SinMovimientosError('c.xlsx', 'BCI')),
        400,
        ingestaErrorResponseSchema,
        { code: 'SIN_MOVIMIENTOS' },
      ],
      [
        'a file validation error carries no code',
        falla(new ExtensionNoPermitidaError('.txt', ['.xlsx', '.pdf'])),
        400,
        ingestaErrorResponseSchema,
        {},
      ],
      [
        'CATALOGO_INCOMPLETO',
        falla(new CatalogoIncompletoError(Bucket.Deseos)),
        409,
        ingestaCatalogoIncompletoResponseSchema,
        { code: 'CATALOGO_INCOMPLETO' },
      ],
      [
        'CATALOGO_NO_DISPONIBLE (catalog unreachable)',
        falla(new CategorizacionFallidaError('db caída')),
        503,
        ingestaCatalogoNoDisponibleResponseSchema,
        { code: 'CATALOGO_NO_DISPONIBLE' },
      ],
      [
        'CATALOGO_NO_DISPONIBLE (post-persist rollback, with its cause)',
        falla(
          new CategorizacionFallidaError(
            'no se pudo completar la categorización tras persistir; la ingesta fue revertida',
            new Error('writer de buckets caído'),
          ),
        ),
        503,
        ingestaCatalogoNoDisponibleResponseSchema,
        { code: 'CATALOGO_NO_DISPONIBLE' },
      ],
      [
        'a persistence failure is { message } only',
        falla(new PersistenciaFallidaError('DB caída')),
        500,
        serverErrorResponseSchema,
        undefined,
      ],
      [
        'a collaborator that throws is the generic { message } 500',
        doble().mockRejectedValue(new Error('boom con 123456 de monto')),
        500,
        serverErrorResponseSchema,
        undefined,
      ],
    ];

    it.each(casos)('%s', async (_n, execute, status, schema, esperado) => {
      const res = await subir(nombre, ruta, execute);

      expect(res.status).toBe(status);
      expect(bodyIssues(schema, res.body)).toEqual([]);
      if (esperado?.code !== undefined)
        expect(res.body.code).toBe(esperado.code);
      if (esperado && esperado.code === undefined)
        expect(res.body).not.toHaveProperty('code');
      if (status === 503) {
        expect(res.body.message).not.toContain('db caída');
        expect(res.body.message).not.toContain('writer de buckets');
      }
      if (status === 500 && esperado === undefined) {
        expect(res.body.message).not.toContain('monto');
      }
    });

    it('400 without a file is { message } only', async () => {
      const res = await request(appWith(nombre, doble())).post(ruta);

      expect(res.status).toBe(400);
      expect(bodyIssues(ingestaErrorResponseSchema, res.body)).toEqual([]);
      expect(res.body).not.toHaveProperty('code');
    });

    it('400 over the 10 MB multer limit is { message } only', async () => {
      const res = await request(appWith(nombre, doble()))
        .post(ruta)
        .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'grande.xlsx');

      expect(res.status).toBe(400);
      expect(bodyIssues(ingestaErrorResponseSchema, res.body)).toEqual([]);
      expect(res.body).not.toHaveProperty('code');
    });
  },
);

describe('upload error bodies — request-level 400s with a code-less body', () => {
  it('preview: a password over 500 characters', async () => {
    const res = await request(appWith('preview', doble()))
      .post('/api/ingestas/preview')
      .field('password', 'x'.repeat(501))
      .attach('file', Buffer.from('contenido'), 'cartola.pdf');

    expect(res.status).toBe(400);
    expect(bodyIssues(ingestaErrorResponseSchema, res.body)).toEqual([]);
    expect(res.body).not.toHaveProperty('code');
  });

  it('commit: edits over 256 KB', async () => {
    const res = await request(appWith('commit', doble()))
      .post('/api/ingestas/commit')
      .field('edits', 'x'.repeat(256 * 1024 + 1))
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(400);
    expect(bodyIssues(ingestaErrorResponseSchema, res.body)).toEqual([]);
    expect(res.body).not.toHaveProperty('code');
  });

  it('commit: malformed edits JSON', async () => {
    const res = await request(appWith('commit', doble()))
      .post('/api/ingestas/commit')
      .field('edits', '{ not valid json')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(400);
    expect(bodyIssues(ingestaErrorResponseSchema, res.body)).toEqual([]);
    expect(res.body).not.toHaveProperty('code');
  });

  it.each([
    ['RowIndexFueraDeRangoError', new RowIndexFueraDeRangoError(99, 2)],
    [
      'CategoriaFueraDeCatalogoError',
      new CategoriaFueraDeCatalogoError('cat-de-otro'),
    ],
    [
      'EdicionesInvalidasError',
      new EdicionesInvalidasError('no es un arreglo'),
    ],
  ])('commit: %s', async (_n, error) => {
    const res = await subir('commit', '/api/ingestas/commit', falla(error));

    expect(res.status).toBe(400);
    expect(bodyIssues(ingestaErrorResponseSchema, res.body)).toEqual([]);
    expect(res.body).not.toHaveProperty('code');
  });
});

describe('upload error bodies — the 400 code enum', () => {
  it('lists exactly the codes the 400 mappers can emit', () => {
    expect([...CODIGOS_INGESTA_400].sort()).toEqual(
      ['PDF_PASSWORD_INCORRECTA', 'PDF_PROTEGIDO', 'SIN_MOVIMIENTOS'].sort(),
    );
  });
});
