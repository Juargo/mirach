import express, { type Express } from 'express';
import request from 'supertest';
import { registrarIngestas } from './ingesta.routes';
import { errorMiddleware } from '../middleware/error.middleware';
import { Result } from '../../../shared/result';
import { ExtensionNoPermitidaError } from '../../../domain/errors/extension-no-permitida.error';
import { PersistenciaFallidaError } from '../../../domain/errors/persistencia-fallida.error';
import type { ProcessIngestaUseCase } from '../../../application/use-cases/process-ingesta.use-case';

/**
 * Port del IngestaController: upload multipart (multer) → MulterFileReaderAdapter
 * → ProcessIngestaUseCase (el mismo pipeline del CLI) → Result→HTTP.
 * Errores de validación del archivo → 400; fallo de infra (persistencia) → 500.
 */
type Doble = Pick<ProcessIngestaUseCase, 'execute'>;

const INGESTA_OK = {
  ingestaId: 'ing-1',
  banco: { banco: 'BancoEstado', tipoCuenta: 'CuentaRUT', numeroCuenta: '****' },
  archivo: { originalName: 'cartola.xlsx', extension: '.xlsx', sizeInBytes: 1234 },
  total: 10,
  duplicadosOmitidos: 2,
  transacciones: [],
};

function probeApp(uc: Doble): Express {
  const app = express();
  const router = express.Router();
  router.use((req, _res, next) => {
    req.userId = 'user-x';
    next();
  });
  registrarIngestas(router, uc as ProcessIngestaUseCase);
  app.use('/api', router);
  app.use(errorMiddleware);
  return app;
}

describe('registrarIngestas — POST /api/ingestas', () => {
  it('200 con el DTO; llama al pipeline con el fileReader y el userId', async () => {
    const uc = { execute: vi.fn().mockResolvedValue(Result.ok(INGESTA_OK)) };
    const res = await request(probeApp(uc))
      .post('/api/ingestas')
      .attach('file', Buffer.from('contenido'), 'cartola.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.ingestaId).toBe('ing-1');
    expect(uc.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-x', fileReader: expect.anything() }),
    );
  });

  it('400 si no se envía archivo', async () => {
    const uc = { execute: vi.fn() };
    const res = await request(probeApp(uc)).post('/api/ingestas');

    expect(res.status).toBe(400);
    expect(uc.execute).not.toHaveBeenCalled();
  });

  it('400 ante error de validación del archivo (ExtensionNoPermitidaError)', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(Result.fail(new ExtensionNoPermitidaError('.txt', ['.xlsx', '.pdf']))),
    };
    const res = await request(probeApp(uc))
      .post('/api/ingestas')
      .attach('file', Buffer.from('x'), 'malo.txt');

    expect(res.status).toBe(400);
  });

  it('500 ante fallo de infraestructura (PersistenciaFallidaError)', async () => {
    const uc = {
      execute: vi.fn().mockResolvedValue(Result.fail(new PersistenciaFallidaError('DB caída'))),
    };
    const res = await request(probeApp(uc))
      .post('/api/ingestas')
      .attach('file', Buffer.from('x'), 'cartola.xlsx');

    expect(res.status).toBe(500);
  });
});
