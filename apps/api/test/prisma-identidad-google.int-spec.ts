import 'dotenv/config';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';
import { loadEnv } from '../src/config/env';
import { PrismaIdentidadGoogleRepository } from '../src/infrastructure/persistence/prisma-identidad-google.repository';
import { PrismaUserCredentialRepository } from '../src/infrastructure/persistence/prisma-user-credential.repository';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { Email } from '../src/domain/value-objects/email';

const RUN_ID = `it-google-${Date.now()}`;

/**
 * Integration tests for PrismaIdentidadGoogleRepository against a real dev DB
 * (design §5.2/§5.4/§5.5, §11.3). Covers what a mocked-Prisma unit test
 * cannot: a REAL `googleSub` unique-constraint collision (P2002), a REAL
 * concurrent conditional-update race, and that this repository's blind index
 * derivation genuinely matches `PrismaUserCredentialRepository`'s — the
 * exact instance `container.ts` builds once and shares across the auth
 * graph (4R carry-forward, design §5.5).
 */
describe('PrismaIdentidadGoogleRepository (real dev DB)', () => {
  const env = loadEnv();
  const prisma = createPrismaClient(env);
  const crypto = new AesGcmCryptoService(
    Buffer.from(env.ENCRYPTION_KEY, 'base64'),
  );
  // MISMA instancia de blindIndex, derivada EXACTAMENTE como container.ts la
  // deriva — inyectada en AMBOS repositorios, igual que el composition root
  // real hace (design §5.5). Si alguno derivara su propia clave, este test
  // lo detectaría (los lookups por email dejarían de matchear).
  const blindIndex = new HmacBlindIndexService(
    deriveBlindIndexKey(Buffer.from(env.ENCRYPTION_KEY, 'base64')),
  );
  const repo = new PrismaIdentidadGoogleRepository(prisma, blindIndex);
  const credenciales = new PrismaUserCredentialRepository(
    prisma,
    crypto,
    blindIndex,
  );

  const userIdVinculado = `user-linked-${RUN_ID}`;
  const userIdPorEmail = `user-by-email-${RUN_ID}`;
  const userIdDemo = `user-demo-${RUN_ID}`;
  const userIdRaceMismaFila = `user-race-same-${RUN_ID}`;
  const userIdRaceFilaA = `user-race-a-${RUN_ID}`;
  const userIdRaceFilaB = `user-race-b-${RUN_ID}`;
  const userIdDesvincularSinPassword = `user-unlink-no-pw-${RUN_ID}`;
  const userIdDesvincularConPassword = `user-unlink-with-pw-${RUN_ID}`;

  const emailPorEmail = `by-email-${RUN_ID}@example.com`;

  const TODOS_LOS_IDS = [
    userIdVinculado,
    userIdPorEmail,
    userIdDemo,
    userIdRaceMismaFila,
    userIdRaceFilaA,
    userIdRaceFilaB,
    userIdDesvincularSinPassword,
    userIdDesvincularConPassword,
  ];

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.create({
      data: {
        id: userIdVinculado,
        nombre: 'Ya vinculado',
        googleSub: `sub-linked-${RUN_ID}`,
        esDemo: false,
      },
    });

    await prisma.user.create({
      data: {
        id: userIdPorEmail,
        nombre: 'Por email',
        email: crypto.encrypt(emailPorEmail),
        emailBlindIndex: blindIndex.compute(emailPorEmail),
        // passwordHash irrelevante para este test (nunca se verifica) — solo
        // necesario para que `PrismaUserCredentialRepository.buscarPorEmail`
        // (que retorna null para un usuario SIN password, semántica correcta
        // de login por contraseña, design §5.2) también encuentre esta fila
        // y así probar la comparación cruzada de abajo.
        passwordHash: 'irrelevant-hash-for-this-test',
        esDemo: false,
      },
    });

    await prisma.user.create({
      data: {
        id: userIdDemo,
        nombre: 'Demo',
        googleSub: `sub-demo-${RUN_ID}`,
        esDemo: true,
      },
    });

    await prisma.user.create({
      data: {
        id: userIdRaceMismaFila,
        nombre: 'Race — misma fila',
        esDemo: false,
      },
    });
    await prisma.user.create({
      data: { id: userIdRaceFilaA, nombre: 'Race — fila A', esDemo: false },
    });
    await prisma.user.create({
      data: { id: userIdRaceFilaB, nombre: 'Race — fila B', esDemo: false },
    });

    await prisma.user.create({
      data: {
        id: userIdDesvincularSinPassword,
        nombre: 'Desvincular — sin password',
        passwordHash: null,
        googleSub: `sub-unlink-no-pw-${RUN_ID}`,
        esDemo: false,
      },
    });
    await prisma.user.create({
      data: {
        id: userIdDesvincularConPassword,
        nombre: 'Desvincular — con password',
        passwordHash: 'irrelevant-hash-for-this-test',
        googleSub: `sub-unlink-with-pw-${RUN_ID}`,
        esDemo: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: TODOS_LOS_IDS } } });
    await prisma.$disconnect();
  });

  it('buscarPorGoogleSub encuentra un usuario ya vinculado', async () => {
    const resultado = await repo.buscarPorGoogleSub(`sub-linked-${RUN_ID}`);

    expect(resultado).toEqual({
      userId: userIdVinculado,
      esDemo: false,
      googleSub: `sub-linked-${RUN_ID}`,
    });
  });

  it('buscarPorGoogleSub — filas demo se exponen con esDemo: true', async () => {
    const resultado = await repo.buscarPorGoogleSub(`sub-demo-${RUN_ID}`);

    expect(resultado).toEqual({
      userId: userIdDemo,
      esDemo: true,
      googleSub: `sub-demo-${RUN_ID}`,
    });
  });

  it('buscarPorEmail encuentra por emailBlindIndex — el índice computado acá MATCHEA el que escribe/lee el login de contraseña (misma instancia compartida, design §5.5)', async () => {
    const email = Email.crear(emailPorEmail).getValue();

    const [porGoogle, porCredenciales] = await Promise.all([
      repo.buscarPorEmail(email),
      credenciales.buscarPorEmail(email),
    ]);

    expect(porGoogle).toEqual({
      userId: userIdPorEmail,
      esDemo: false,
      googleSub: null,
    });
    // Ambos repositorios resuelven a la MISMA fila a través de la MISMA
    // instancia de blindIndex — prueba directa de que no hay una segunda
    // derivación de clave divergiendo en silencio (4R carry-forward).
    expect(porCredenciales).not.toBeNull();
    expect(porCredenciales?.userId).toBe(porGoogle?.userId);
  });

  it('vincularGoogleSub escribe una vez y devuelve true; una segunda llamada sobre la misma fila YA vinculada devuelve false y no sobrescribe', async () => {
    const googleSub = `sub-write-once-${RUN_ID}`;

    const primero = await repo.vincularGoogleSub(userIdPorEmail, googleSub);
    expect(primero).toBe(true);

    const filaTrasPrimerLink = await prisma.user.findUnique({
      where: { id: userIdPorEmail },
      select: { googleSub: true },
    });
    expect(filaTrasPrimerLink?.googleSub).toBe(googleSub);

    const otroGoogleSub = `sub-overwrite-attempt-${RUN_ID}`;
    const segundo = await repo.vincularGoogleSub(userIdPorEmail, otroGoogleSub);
    expect(segundo).toBe(false);

    const filaTrasSegundoIntento = await prisma.user.findUnique({
      where: { id: userIdPorEmail },
      select: { googleSub: true },
    });
    // No sobrescribe: sigue con el valor del PRIMER link.
    expect(filaTrasSegundoIntento?.googleSub).toBe(googleSub);
  });

  it('carrera 1/2 — misma fila, dos vincularGoogleSub concurrentes con el mismo googleSub: el perdedor resuelve por updateMany count===0 (WHERE ya no matchea, sin violar unicidad)', async () => {
    const googleSubCompartido = `sub-race-same-row-${RUN_ID}`;

    const [a, b] = await Promise.all([
      repo.vincularGoogleSub(userIdRaceMismaFila, googleSubCompartido),
      repo.vincularGoogleSub(userIdRaceMismaFila, googleSubCompartido),
    ]);

    const resultados = [a, b].sort();
    // Exactamente uno gana (true) y el otro pierde (false) — nunca los dos
    // true (eso implicaría una escritura duplicada) ni los dos false.
    expect(resultados).toEqual([false, true]);

    const fila = await prisma.user.findUnique({
      where: { id: userIdRaceMismaFila },
      select: { googleSub: true },
    });
    expect(fila?.googleSub).toBe(googleSubCompartido);
  });

  it('carrera 2/2 — dos filas DISTINTAS, mismo googleSub objetivo: el perdedor resuelve por P2002 (colisión real de unicidad TOCTOU), nunca lanza a través del puerto', async () => {
    const googleSubDisputado = `sub-race-distinct-rows-${RUN_ID}`;

    const [a, b] = await Promise.all([
      repo.vincularGoogleSub(userIdRaceFilaA, googleSubDisputado),
      repo.vincularGoogleSub(userIdRaceFilaB, googleSubDisputado),
    ]);

    const resultados = [a, b].sort();
    // Exactamente una fila gana el valor único; la otra pierde vía P2002
    // capturado — resuelto a `false`, nunca una excepción cruzando el puerto.
    expect(resultados).toEqual([false, true]);

    const [filaA, filaB] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userIdRaceFilaA },
        select: { googleSub: true },
      }),
      prisma.user.findUnique({
        where: { id: userIdRaceFilaB },
        select: { googleSub: true },
      }),
    ]);
    const googleSubsFinales = [filaA?.googleSub, filaB?.googleSub];
    // El valor disputado terminó en EXACTAMENTE una de las dos filas.
    expect(
      googleSubsFinales.filter((v) => v === googleSubDisputado),
    ).toHaveLength(1);
    expect(googleSubsFinales.filter((v) => v === null)).toHaveLength(1);
  });

  /**
   * CA-03's WHERE (`passwordHash: { not: null }, googleSub: { not: null }`,
   * repository docblock above `desvincularGoogleSub`) is the ONLY thing
   * preventing an account from being left with no way to log in. Until now
   * only a mocked unit spec asserted the call *arguments* — nothing proved
   * Postgres actually enforces that WHERE. These two tests call the
   * repository method DIRECTLY (bypassing `DesvincularGoogleUseCase`'s own
   * application-layer password check) against real seeded rows: a negative
   * control (passwordHash null — must be blocked) and a positive control
   * (passwordHash set — must succeed), so a broken WHERE that always
   * returns `false`, or one that never blocks, is distinguishable from a
   * genuinely-working predicate.
   */
  it('desvincularGoogleSub — fila SIN passwordHash: el WHERE bloquea, count 0, googleSub sin cambios (negative control)', async () => {
    const resultado = await repo.desvincularGoogleSub(
      userIdDesvincularSinPassword,
    );

    expect(resultado).toBe(false);

    const fila = await prisma.user.findUnique({
      where: { id: userIdDesvincularSinPassword },
      select: { googleSub: true },
    });
    expect(fila?.googleSub).toBe(`sub-unlink-no-pw-${RUN_ID}`);
  });

  it('desvincularGoogleSub — fila CON passwordHash: el WHERE matchea, count 1, googleSub queda null (positive control)', async () => {
    const resultado = await repo.desvincularGoogleSub(
      userIdDesvincularConPassword,
    );

    expect(resultado).toBe(true);

    const fila = await prisma.user.findUnique({
      where: { id: userIdDesvincularConPassword },
      select: { googleSub: true },
    });
    expect(fila?.googleSub).toBeNull();
  });
});
