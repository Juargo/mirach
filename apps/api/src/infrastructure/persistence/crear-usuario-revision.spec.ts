import type { PrismaClient } from '@prisma/client';

import {
  runCrearUsuarioRevision,
  cargarMuestraConCommit,
  logCrearUsuarioRevisionFailure,
  MENSAJES,
  type CrearUsuarioRevisionDeps,
} from '../../../prisma/crear-usuario-revision';
import { AesGcmCryptoService } from './aes-gcm-crypto.service';
import { HmacBlindIndexService } from './hmac-blind-index.service';
import { deriveBlindIndexKey } from '../../composition/derive-blind-index-key';
import { Result } from '../../shared/result';
import type { IPasswordHasher } from '../../application/ports/password-hasher.port';
import type { IFileReader } from '../../application/ports/file-reader.port';
import { SinMovimientosError } from '../../domain/errors/sin-movimientos.error';

const copiarCatalogoTemplate = vi.hoisted(() => vi.fn());
vi.mock('./catalogo-template', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./catalogo-template')>()),
  copiarCatalogoTemplate,
}));

// ──────────────────────────────────────────────────────────────────────────────
// Orchestration of the one-off App Review user script (ADR-051). The DB is a
// hand-written fake; crypto and blind index are the REAL services so the
// key-mismatch check exercises real AES-GCM.
// ──────────────────────────────────────────────────────────────────────────────

const EMAIL = 'Review@Example.com';
const EMAIL_NORMALIZADO = 'review@example.com';
const PASSWORD = 'S3cret-Review-Pass!';

const KEY = Buffer.alloc(32, 7);
const OTRA_KEY = Buffer.alloc(32, 9);

function makeServices(key: Buffer = KEY) {
  return {
    crypto: new AesGcmCryptoService(key),
    blindIndex: new HmacBlindIndexService(deriveBlindIndexKey(key)),
  };
}

function makeHasher() {
  const hash = vi.fn().mockResolvedValue('argon2-hash-del-password');
  const hasher: IPasswordHasher = { hash, verificar: vi.fn() };
  return { hasher, hash };
}

interface FakeOptions {
  /** Row returned by `findFirst` (the key-identity probe). */
  filaConEmail?: { email: string } | null;
  /** Row returned by the blind-index lookup. */
  usuarioExistente?: {
    id: string;
    appleSub: string | null;
    googleSub: string | null;
  } | null;
  categorias?: number;
  ingestas?: number;
}

function makePrisma(options: FakeOptions = {}) {
  const userCreate = vi.fn().mockResolvedValue({ id: 'user-nuevo' });
  const userUpdate = vi.fn().mockResolvedValue({ id: 'user-existente' });
  const tx = {
    user: { create: userCreate, update: userUpdate },
    categoria: { count: vi.fn().mockResolvedValue(options.categorias ?? 0) },
  };
  const transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
    fn(tx),
  );
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(options.filaConEmail ?? null),
      findUnique: vi.fn().mockResolvedValue(options.usuarioExistente ?? null),
    },
    ingesta: { count: vi.fn().mockResolvedValue(options.ingestas ?? 0) },
    $transaction: transaction,
  } as unknown as PrismaClient;
  return { prisma, userCreate, userUpdate, transaction, tx };
}

function makeDeps(
  overrides: Partial<CrearUsuarioRevisionDeps> = {},
): CrearUsuarioRevisionDeps & {
  cargarMuestra: ReturnType<typeof vi.fn>;
  hash: ReturnType<typeof vi.fn>;
} {
  const { hasher, hash } = makeHasher();
  const cargarMuestra = vi
    .fn()
    .mockResolvedValue({ totalTransacciones: 28, duplicadosOmitidos: 0 });
  return {
    ...makeServices(),
    hasher,
    cargarMuestra,
    ...overrides,
    hash,
  } as never;
}

function captureConsole() {
  const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
  return {
    output: () =>
      spies.flatMap((s) => s.mock.calls.flat().map(String)).join('\n'),
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}

describe('runCrearUsuarioRevision (ADR-051)', () => {
  beforeEach(() => {
    copiarCatalogoTemplate.mockReset().mockResolvedValue(undefined);
  });

  describe('usuario nuevo', () => {
    it('crea el usuario con email cifrado, blind index y hash argon2, copia el catálogo y carga la muestra', async () => {
      const { prisma, userCreate, tx } = makePrisma();
      const deps = makeDeps();

      const resultado = await runCrearUsuarioRevision(
        prisma,
        { email: EMAIL, password: PASSWORD },
        deps,
      );

      expect(resultado).toMatchObject({
        userId: 'user-nuevo',
        email: EMAIL_NORMALIZADO,
        creado: true,
        catalogoCopiado: true,
        muestraCargada: true,
      });
      const data = userCreate.mock.calls[0][0].data;
      expect(data.passwordHash).toBe('argon2-hash-del-password');
      expect(data.emailBlindIndex).toBe(
        deps.blindIndex.compute(EMAIL_NORMALIZADO),
      );
      expect(deps.crypto.decrypt(data.email)).toBe(EMAIL_NORMALIZADO);
      expect(data.email).not.toContain('@');
      expect(deps.hash).toHaveBeenCalledWith(PASSWORD);
      expect(copiarCatalogoTemplate).toHaveBeenCalledWith(tx, 'user-nuevo');
      expect(deps.cargarMuestra).toHaveBeenCalledWith('user-nuevo');
    });
  });

  describe('idempotencia (usuario existente)', () => {
    const existente = { id: 'user-existente', appleSub: null, googleSub: null };

    it('actualiza solo el hash de la contraseña y no vuelve a copiar el catálogo ni la muestra', async () => {
      const { prisma, userCreate, userUpdate } = makePrisma({
        usuarioExistente: existente,
        categorias: 17,
        ingestas: 1,
      });
      const deps = makeDeps();

      const resultado = await runCrearUsuarioRevision(
        prisma,
        { email: EMAIL, password: PASSWORD },
        deps,
      );

      expect(resultado).toMatchObject({
        userId: 'user-existente',
        creado: false,
        catalogoCopiado: false,
        muestraCargada: false,
      });
      expect(userCreate).not.toHaveBeenCalled();
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-existente' },
        data: { passwordHash: 'argon2-hash-del-password' },
      });
      expect(copiarCatalogoTemplate).not.toHaveBeenCalled();
      expect(deps.cargarMuestra).not.toHaveBeenCalled();
    });

    it('repara un usuario existente sin catálogo ni muestra', async () => {
      const { prisma } = makePrisma({
        usuarioExistente: existente,
        categorias: 0,
        ingestas: 0,
      });
      const deps = makeDeps();

      const resultado = await runCrearUsuarioRevision(
        prisma,
        { email: EMAIL, password: PASSWORD },
        deps,
      );

      expect(resultado.catalogoCopiado).toBe(true);
      expect(resultado.muestraCargada).toBe(true);
      expect(copiarCatalogoTemplate).toHaveBeenCalledTimes(1);
      expect(deps.cargarMuestra).toHaveBeenCalledTimes(1);
    });

    it.each([
      [{ appleSub: 'apple-sub-1', googleSub: null }],
      [{ appleSub: null, googleSub: 'google-sub-1' }],
    ])(
      'aborta sin escribir si el email es de una cuenta real con Apple o Google (%j)',
      async (sociales) => {
        const { prisma, userUpdate, transaction } = makePrisma({
          usuarioExistente: { id: 'user-real', ...sociales },
        });
        const deps = makeDeps();

        await expect(
          runCrearUsuarioRevision(
            prisma,
            { email: EMAIL, password: PASSWORD },
            deps,
          ),
        ).rejects.toThrow(MENSAJES.cuentaSocial);

        expect(userUpdate).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
        expect(deps.hash).not.toHaveBeenCalled();
      },
    );
  });

  describe('verificación de la clave de cifrado', () => {
    it('aborta sin escribir si ENCRYPTION_KEY no descifra una fila existente', async () => {
      const cifradoConOtraClave =
        makeServices(OTRA_KEY).crypto.encrypt('otro@example.com');
      const { prisma, transaction } = makePrisma({
        filaConEmail: { email: cifradoConOtraClave },
      });
      const deps = makeDeps();

      await expect(
        runCrearUsuarioRevision(
          prisma,
          { email: EMAIL, password: PASSWORD },
          deps,
        ),
      ).rejects.toThrow(MENSAJES.claveNoCoincide);

      expect(transaction).not.toHaveBeenCalled();
      expect(deps.hash).not.toHaveBeenCalled();
      expect(deps.cargarMuestra).not.toHaveBeenCalled();
    });

    it('continúa si la clave descifra la fila existente', async () => {
      const cifrado = makeServices().crypto.encrypt('otro@example.com');
      const { prisma } = makePrisma({ filaConEmail: { email: cifrado } });

      await expect(
        runCrearUsuarioRevision(
          prisma,
          { email: EMAIL, password: PASSWORD },
          makeDeps(),
        ),
      ).resolves.toMatchObject({ creado: true });
    });

    it('continúa con una advertencia si no hay ninguna fila contra la cual verificar', async () => {
      const consola = captureConsole();
      const { prisma } = makePrisma({ filaConEmail: null });

      await runCrearUsuarioRevision(
        prisma,
        { email: EMAIL, password: PASSWORD },
        makeDeps(),
      );

      expect(consola.output()).toContain('ENCRYPTION_KEY');
      consola.restore();
    });
  });

  describe('validación de entradas (mensajes fijos)', () => {
    it('rechaza un email inválido sin tocar la BD', async () => {
      const { prisma, transaction } = makePrisma();

      await expect(
        runCrearUsuarioRevision(
          prisma,
          { email: 'no-es-email', password: PASSWORD },
          makeDeps(),
        ),
      ).rejects.toThrow(MENSAJES.emailInvalido);

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rechaza una contraseña fuera de política con un mensaje fijo que no la contiene', async () => {
      const { prisma, transaction } = makePrisma();
      const corta = 'corta1';

      const error: unknown = await runCrearUsuarioRevision(
        prisma,
        { email: EMAIL, password: corta },
        makeDeps(),
      ).catch((e: unknown) => e);

      expect((error as Error).message).toBe(MENSAJES.passwordInvalida);
      expect((error as Error).message).not.toContain(corta);
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('carga de la muestra', () => {
    it('si la carga falla, propaga un mensaje fijo (el usuario ya quedó creado)', async () => {
      const { prisma } = makePrisma();
      const deps = makeDeps({
        cargarMuestra: vi.fn().mockRejectedValue(new Error('detalle interno')),
      });

      await expect(
        runCrearUsuarioRevision(
          prisma,
          { email: EMAIL, password: PASSWORD },
          deps,
        ),
      ).rejects.toThrow(MENSAJES.muestraFallida);
    });
  });

  describe('la contraseña nunca se escribe en la salida', () => {
    it('ni en éxito ni en los logs de fallo', async () => {
      const consola = captureConsole();
      const { prisma } = makePrisma();

      await runCrearUsuarioRevision(
        prisma,
        { email: EMAIL, password: PASSWORD },
        makeDeps(),
      );
      logCrearUsuarioRevisionFailure(new Error(MENSAJES.muestraFallida));

      const salida = consola.output();
      consola.restore();
      expect(salida).not.toContain(PASSWORD);
      expect(salida).not.toContain('argon2-hash-del-password');
    });
  });
});

describe('cargarMuestraConCommit — ingesta real (ADR-051)', () => {
  const lector: IFileReader = {
    getBuffer: () => Buffer.from('x'),
    getOriginalName: () => 'cartola-revision.xlsx',
    getSizeInBytes: () => 1,
  };

  it('ejecuta el commit real con el archivo, el usuario y sin ediciones', async () => {
    const execute = vi.fn().mockResolvedValue(
      Result.ok({
        ingestaId: 'ing-1',
        totalTransacciones: 28,
        duplicadosOmitidos: 2,
        transacciones: [],
      }),
    );

    const resultado = await cargarMuestraConCommit(
      { execute },
      'user-1',
      lector,
    );

    expect(execute).toHaveBeenCalledWith({
      fileReader: lector,
      userId: 'user-1',
      edits: [],
    });
    expect(resultado).toEqual({
      totalTransacciones: 28,
      duplicadosOmitidos: 2,
    });
  });

  it('si el commit falla, lanza un mensaje fijo con solo el nombre del error', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue(Result.fail(new SinMovimientosError('x.xlsx', 'BCI')));

    const error: unknown = await cargarMuestraConCommit(
      { execute },
      'user-1',
      lector,
    ).catch((e: unknown) => e);

    expect((error as Error).message).toBe(
      `${MENSAJES.muestraFallida} (SinMovimientosError)`,
    );
  });
});
