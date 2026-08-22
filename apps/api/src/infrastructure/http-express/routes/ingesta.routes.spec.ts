import express, { type Express } from 'express';
import request from 'supertest';
import { registrarIngestas } from './ingesta.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { ExtensionNoPermitidaError } from '../../../domain/errors/extension-no-permitida.error';
import { PersistenciaFallidaError } from '../../../domain/errors/persistencia-fallida.error';
import { CategorizacionFallidaError } from '../../../domain/errors/categorizacion-fallida.error';
import { RowIndexFueraDeRangoError } from '../../../domain/errors/row-index-fuera-de-rango.error';
import { CategoriaFueraDeCatalogoError } from '../../../domain/errors/categoria-fuera-de-catalogo.error';
import { IngestaNoEncontradaError } from '../../../domain/errors/ingesta-no-encontrada.error';
import { Bucket } from '../../../domain/value-objects/bucket';
import type { ProcessIngestaUseCase } from '../../../application/use-cases/process-ingesta.use-case';
import type { EliminarIngestaUseCase } from '../../../application/use-cases/eliminar-ingesta.use-case';
import type { ListarIngestasUseCase } from '../../../application/use-cases/listar-ingestas.use-case';
import type { PreviewIngestaUseCase } from '../../../application/use-cases/preview-ingesta.use-case';
import type { CommitIngestaUseCase } from '../../../application/use-cases/commit-ingesta.use-case';
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
type CommitDoble = Pick<CommitIngestaUseCase, 'execute'>;

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
  commitIngesta?: CommitDoble;
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
    commitIngesta: (deps.commitIngesta ?? {
      execute: vi.fn(),
    }) as CommitIngestaUseCase,
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
      execute: vi.fn().mockResolvedValue([
        {
          id: 'ing-1',
          banco: 'BCI',
          nombreArchivo: 'movimientos.xlsx',
          fecha,
          estado: 'exitoso',
          totalTransacciones: 10,
          motivoFallo: null,
        },
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
          nombreArchivo: 'movimientos.xlsx',
          fecha: fecha.toISOString(),
          estado: 'exitoso',
          totalTransacciones: 10,
          motivoFallo: null,
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
  // US-057 PR2: new PreviewIngestaResult shape ({ resumen, filas } replaces
  // { estructura, muestra }). Per-row dedup and classification included.
  resumen: { totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 },
  filas: [],
};

describe('registrarIngestas — POST /api/ingestas/preview (T1.5)', () => {
  it('200 con el PreviewIngestaDto en Result.ok — con userId forwarded (US-057 PR2)', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(PREVIEW_OK)) };
    const res = await request(probeApp({ previewIngesta: uc }))
      .post('/api/ingestas/preview')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '****',
      resumen: { totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 },
      filas: [],
      // Legacy mirror (@deprecated compat shim, removed by US-061).
      estructura: { totalFilasDatos: 2 },
      muestra: [],
    });
    // US-057 PR2: userId is forwarded for per-row dedup scoping (D-06).
    expect(uc.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        fileReader: expect.anything(),
        userId: 'user-x',
      }),
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

const COMMIT_OK = {
  ingestaId: 'ing-commit-1',
  totalTransacciones: 2,
  duplicadosOmitidos: 1,
  transacciones: [
    {
      fecha: new Date('2024-01-15T00:00:00.000Z'),
      descripcion: 'SUPERMERCADO',
      cargo: 50000n,
      abono: 0n,
      bucket: Bucket.Necesidades,
      categoriaId: 'cat-necesidades',
    },
    {
      fecha: new Date('2024-01-15T00:00:00.000Z'),
      descripcion: 'SUELDO',
      cargo: 0n,
      abono: 1500000n,
      bucket: Bucket.Ingreso,
      categoriaId: null,
    },
  ],
};

describe('registrarIngestas — POST /api/ingestas/commit (US-057 PR4)', () => {
  it('201 con el CommitIngestaResponseDto (montos string, bucket serializado)', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(COMMIT_OK)) };
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .field(
        'edits',
        JSON.stringify([{ rowIndex: 0, categoriaId: 'cat-necesidades' }]),
      )
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ingestaId: 'ing-commit-1',
      totalTransacciones: 2,
      duplicadosOmitidos: 1,
      transacciones: [
        {
          fecha: '2024-01-15T00:00:00.000Z',
          descripcion: 'SUPERMERCADO',
          cargo: '50000',
          abono: '0',
          bucket: 'Necesidades',
          categoriaId: 'cat-necesidades',
        },
        {
          fecha: '2024-01-15T00:00:00.000Z',
          descripcion: 'SUELDO',
          cargo: '0',
          abono: '1500000',
          bucket: 'Ingreso',
          categoriaId: null,
        },
      ],
    });
    // El overlay parseado + userId llegan al use case.
    expect(uc.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        fileReader: expect.anything(),
        userId: 'user-x',
        edits: [{ rowIndex: 0, categoriaId: 'cat-necesidades' }],
      }),
    );
  });

  it('201 con edits ausente ⇒ overlay vacío (commit de pura auto-clasificación)', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(COMMIT_OK)) };
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(201);
    expect(uc.execute).toHaveBeenCalledWith(
      expect.objectContaining({ edits: [] }),
    );
  });

  it('400 si no se envía archivo', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(probeApp({ commitIngesta: uc })).post(
      '/api/ingestas/commit',
    );

    expect(res.status).toBe(400);
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 ante edits con JSON malformado (EdicionesInvalidasError) — no llama al use case', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .field('edits', '{ not valid json')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('edits');
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 cuando el archivo excede el límite de multer (10 MB)', async () => {
    const uc = { execute: vi.fn() };
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1);
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .attach('file', grande, 'grande.xlsx');

    expect(res.status).toBe(400);
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 cuando el campo edits excede el cap de 256 KB (LIMIT_FIELD_SIZE)', async () => {
    const uc = { execute: vi.fn() };
    // Un edits > 256 KB dispara LIMIT_FIELD_SIZE en multer — debe mapear a 400,
    // no caer al error middleware (500). Mensaje fijo, sin echo del payload.
    const editsGrande = 'x'.repeat(256 * 1024 + 1);
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .field('edits', editsGrande)
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('256 KB');
    // El mensaje NUNCA debe contener el payload crudo del campo.
    expect(res.body.message).not.toContain(editsGrande);
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 ante RowIndexFueraDeRangoError (mapeo de aCommitHttpError)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new RowIndexFueraDeRangoError(99, 2))),
    };
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(400);
  });

  it('400 ante CategoriaFueraDeCatalogoError (cross-tenant, RNF-SEC-006)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new CategoriaFueraDeCatalogoError('cat-de-otro')),
        ),
    };
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(400);
  });

  it('500 ante PersistenciaFallidaError (fallo de infra)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new PersistenciaFallidaError('DB caída')),
        ),
    };
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(500);
  });

  it('500 ante CategorizacionFallidaError (catalog-load fail, fail-closed)', async () => {
    const uc = {
      execute: vi
        .fn()
        .mockResolvedValue(
          Result.fail(new CategorizacionFallidaError('catálogo caído')),
        ),
    };
    const res = await request(probeApp({ commitIngesta: uc }))
      .post('/api/ingestas/commit')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(500);
  });
});
