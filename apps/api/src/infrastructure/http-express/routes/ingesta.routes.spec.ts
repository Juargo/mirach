import express, { type Express } from 'express';
import request from 'supertest';
import { registrarIngestas } from './ingesta.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { ExtensionNoPermitidaError } from '../../../domain/errors/extension-no-permitida.error';
import { PersistenciaFallidaError } from '../../../domain/errors/persistencia-fallida.error';
import { IngestaNoEncontradaError } from '../../../domain/errors/ingesta-no-encontrada.error';
import type { ProcessIngestaUseCase } from '../../../application/use-cases/process-ingesta.use-case';
import type { EliminarIngestaUseCase } from '../../../application/use-cases/eliminar-ingesta.use-case';
import type { ListarIngestasUseCase } from '../../../application/use-cases/listar-ingestas.use-case';
import type { PreviewIngestaUseCase } from '../../../application/use-cases/preview-ingesta.use-case';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';

/**
 * Port del IngestaController: upload multipart (multer) → MulterFileReaderAdapter
 * → ProcessIngestaUseCase (el mismo pipeline del CLI) → Result→HTTP.
 * Errores de validación del archivo → 400; fallo de infra (persistencia) → 500.
 *
 * US-018 (T1.11): `registrarIngestas` ahora toma un deps object con 3 use
 * cases (design.md §6.1) — este spec cubre POST (sin cambios de
 * comportamiento) + los nuevos GET/DELETE.
 */
type ProcessDoble = Pick<ProcessIngestaUseCase, 'execute'>;
type EliminarDoble = Pick<EliminarIngestaUseCase, 'execute'>;
type ListarDoble = Pick<ListarIngestasUseCase, 'execute'>;
type PreviewDoble = Pick<PreviewIngestaUseCase, 'execute'>;

const INGESTA_OK = {
  ingestaId: 'ing-1',
  banco: {
    banco: 'BancoEstado',
    tipoCuenta: 'CuentaRUT',
    numeroCuenta: '****',
  },
  archivo: {
    originalName: 'cartola.xlsx',
    extension: '.xlsx',
    sizeInBytes: 1234,
  },
  total: 10,
  duplicadosOmitidos: 2,
  transacciones: [],
};

function probeApp(deps: {
  processIngesta?: ProcessDoble;
  eliminarIngesta?: EliminarDoble;
  listarIngestas?: ListarDoble;
  previewIngesta?: PreviewDoble;
}): Express {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarIngestas(router, {
    processIngesta: (deps.processIngesta ?? {
      execute: vi.fn(),
    }) as ProcessIngestaUseCase,
    eliminarIngesta: (deps.eliminarIngesta ?? {
      execute: vi.fn(),
    }) as EliminarIngestaUseCase,
    listarIngestas: (deps.listarIngestas ?? {
      execute: vi.fn(),
    }) as ListarIngestasUseCase,
    previewIngesta: (deps.previewIngesta ?? {
      execute: vi.fn(),
    }) as PreviewIngestaUseCase,
  });
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarIngestas — POST /api/ingestas', () => {
  it('200 con el DTO; llama al pipeline con el fileReader y el userId', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(INGESTA_OK)) };
    const res = await request(probeApp({ processIngesta: uc }))
      .post('/api/ingestas')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.ingestaId).toBe('ing-1');
    expect(uc.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-x',
        fileReader: expect.anything(),
      }),
    );
  });

  it('400 si no se envía archivo', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(probeApp({ processIngesta: uc })).post(
      '/api/ingestas',
    );

    expect(res.status).toBe(400);
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 ante error de validación del archivo (ExtensionNoPermitidaError)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new ExtensionNoPermitidaError('.txt', ['.xlsx', '.pdf'])),
        ),
    };
    const res = await request(probeApp({ processIngesta: uc }))
      .post('/api/ingestas')
      .attach('file', Buffer.from('x'), 'malo.txt');

    expect(res.status).toBe(400);
  });

  it('500 ante fallo de infraestructura (PersistenciaFallidaError)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new PersistenciaFallidaError('DB caída')),
        ),
    };
    const res = await request(probeApp({ processIngesta: uc }))
      .post('/api/ingestas')
      .attach('file', Buffer.from('x'), 'cartola.xlsx');

    expect(res.status).toBe(500);
  });
});

describe('registrarIngestas — GET /api/ingestas', () => {
  it('T1.11a: 200 con { ingestas: [...] } — llama al use case con el userId', async () => {
    const fecha = new Date('2026-07-15T00:00:00.000Z');
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue([
          { id: 'ing-1', banco: 'BCI', fecha, totalTransacciones: 10 },
        ]),
    };
    const res = await request(probeApp({ listarIngestas: uc })).get(
      '/api/ingestas',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ingestas: [
        {
          id: 'ing-1',
          banco: 'BCI',
          fecha: fecha.toISOString(),
          totalTransacciones: 10,
        },
      ],
    });
    expect(uc.execute).toHaveBeenCalledWith('user-x');
  });

  it('T1.11b: 200 con { ingestas: [] } cuando el usuario no tiene ingestas', async () => {
    const uc = { execute: vi.fn().mockResolvedValue([]) };
    const res = await request(probeApp({ listarIngestas: uc })).get(
      '/api/ingestas',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ingestas: [] });
  });

  it('T1.11c: 500 ante error inesperado (rejection → error middleware)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
    const res = await request(probeApp({ listarIngestas: uc })).get(
      '/api/ingestas',
    );

    expect(res.status).toBe(500);
  });
});

describe('registrarIngestas — DELETE /api/ingestas/:id', () => {
  it('T1.11d: 204 sin body cuando el use case retorna Result.ok', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) };
    const res = await request(probeApp({ eliminarIngesta: uc })).delete(
      '/api/ingestas/ing-1',
    );

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(uc.execute).toHaveBeenCalledWith({
      userId: 'user-x',
      ingestaId: 'ing-1',
    });
  });

  it('T1.11e: 404 cuando el use case retorna IngestaNoEncontradaError (anti-enumeración)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new IngestaNoEncontradaError('ing-x'))),
    };
    const res = await request(probeApp({ eliminarIngesta: uc })).delete(
      '/api/ingestas/ing-x',
    );

    expect(res.status).toBe(404);
  });

  it('T1.11f: 500 ante error inesperado (rejection → error middleware)', async () => {
    const uc = { execute: vi.fn().mockRejectedValue(new Error('DB caída')) };
    const res = await request(probeApp({ eliminarIngesta: uc })).delete(
      '/api/ingestas/ing-1',
    );

    expect(res.status).toBe(500);
  });
});

const PREVIEW_OK = {
  banco: {
    banco: BancoConocido.BancoEstado,
    tipoCuenta: TipoCuentaConocido.CuentaRut,
    numeroCuenta: '****',
  },
  estructura: { totalFilasDatos: 2 },
  muestra: [],
};

describe('registrarIngestas — POST /api/ingestas/preview (T1.5)', () => {
  it('200 con el PreviewIngestaDto en Result.ok — sin userId en el input', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(PREVIEW_OK)) };
    const res = await request(probeApp({ previewIngesta: uc }))
      .post('/api/ingestas/preview')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '****',
      estructura: { totalFilasDatos: 2 },
      muestra: [],
    });
    expect(uc.execute).toHaveBeenCalledWith(
      expect.objectContaining({ fileReader: expect.anything() }),
    );
    // No userId forwarded — the preview input type has none (design §3.3).
    expect(uc.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.anything() }),
    );
  });

  it('400 ante un error de validación representativo (prueba la reutilización de aHttpError)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new ExtensionNoPermitidaError('.txt', ['.xlsx', '.pdf'])),
        ),
    };
    const res = await request(probeApp({ previewIngesta: uc }))
      .post('/api/ingestas/preview')
      .attach('file', Buffer.from('x'), 'malo.txt');

    expect(res.status).toBe(400);
  });

  it('400 si no se envía archivo', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(probeApp({ previewIngesta: uc })).post(
      '/api/ingestas/preview',
    );

    expect(res.status).toBe(400);
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 cuando el archivo excede el límite de multer (10 MB)', async () => {
    const uc = { execute: vi.fn() };
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1);
    const res = await request(probeApp({ previewIngesta: uc }))
      .post('/api/ingestas/preview')
      .attach('file', grande, 'grande.xlsx');

    expect(res.status).toBe(400);
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('500 ante un fallo defensivo (PersistenciaFallidaError)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(
            new PersistenciaFallidaError(
              'fallo inesperado durante la vista previa de ingesta',
            ),
          ),
        ),
    };
    const res = await request(probeApp({ previewIngesta: uc }))
      .post('/api/ingestas/preview')
      .attach('file', Buffer.from('x'), 'cartola.xlsx');

    expect(res.status).toBe(500);
  });
});
