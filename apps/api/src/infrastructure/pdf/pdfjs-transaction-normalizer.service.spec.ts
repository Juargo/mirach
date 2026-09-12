import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PdfjsTransactionNormalizerService } from './pdfjs-transaction-normalizer.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { Transaccion } from '../../domain/value-objects/transaccion';

// Debe coincidir EXACTAMENTE con `PASSWORD_FIXTURE` en
// `test/fixtures/pdf/generar-protegida-test.ts`. No se importa ese módulo
// directamente (efecto colateral: reescribe el fixture binario en cada corrida).
const PASSWORD_FIXTURE = 'clave-fixture-pdf-protegido-2026'; // gitleaks:allow — fixture de test, no es un secreto

const fixturesDir = join(__dirname, '../../../test/fixtures/pdf');

describe('PdfjsTransactionNormalizerService', () => {
  const service = new PdfjsTransactionNormalizerService();

  describe('Santander (fixture real, PR4a)', () => {
    it('normaliza a las 7 filas de movimiento reales del período 01/03–31/03/2026 (PDF-03)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'santander-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.Santander);

      expect(result.isOk()).toBe(true);
      const transacciones = result.getValue();
      expect(transacciones).toHaveLength(7);
      for (const t of transacciones) {
        expect(t.fecha.getUTCFullYear()).toBe(2026);
        expect(t.fecha.getUTCMonth()).toBe(2); // marzo, 0-indexed
        expect(typeof t.cargo).toBe('bigint');
        expect(typeof t.abono).toBe('bigint');
      }
    });

    it('descripciones se reconstruyen palabra-por-palabra (merge por rango de X)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'santander-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.Santander);

      const descripciones = result.getValue().map((t) => t.descripcion);
      expect(descripciones).toContain('Transf a Tercero Maria Ejemplo');
      expect(descripciones).toContain('Abono Sueldo Empresa Generica');
    });

    it('"Resumen de Comisiones" queda excluido — no aparece una octava fila duplicada', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'santander-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.Santander);

      const transacciones = result.getValue();
      const suscripciones = transacciones.filter(
        (t) => t.descripcion === 'Suscripcion Servicio Streaming',
      );
      expect(suscripciones).toHaveLength(1);
    });

    it('cargo/abono se asignan a la columna correcta con monto entero exacto', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'santander-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.Santander);

      const transferencia = result
        .getValue()
        .find((t) => t.descripcion === 'Transf a Tercero Maria Ejemplo');
      expect(transferencia).toEqual(
        Transaccion.crear({
          fecha: new Date(Date.UTC(2026, 2, 20)),
          descripcion: 'Transf a Tercero Maria Ejemplo',
          cargo: 120000n,
          abono: 0n,
        }).getValue(),
      );

      const sueldo = result
        .getValue()
        .find((t) => t.descripcion === 'Abono Sueldo Empresa Generica');
      expect(sueldo).toEqual(
        Transaccion.crear({
          fecha: new Date(Date.UTC(2026, 2, 5)),
          descripcion: 'Abono Sueldo Empresa Generica',
          cargo: 0n,
          abono: 850000n,
        }).getValue(),
      );
    });
  });

  describe('BancoEstado (fixture real, PR4b)', () => {
    it('normaliza a las 13 filas de movimiento reales, concatenando 2 páginas, año 2026 inferido del período (PDF-03)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancoestado-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoEstado);

      expect(result.isOk()).toBe(true);
      const transacciones = result.getValue();
      expect(transacciones).toHaveLength(13);
      for (const t of transacciones) {
        expect(t.fecha.getUTCFullYear()).toBe(2026);
        expect(t.fecha.getUTCMonth()).toBe(3); // abril, 0-indexed
        expect(typeof t.cargo).toBe('bigint');
        expect(typeof t.abono).toBe('bigint');
      }
    });

    it('formato DD/Mmm ("02/Abr") se parsea correctamente en las fechas reales', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancoestado-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoEstado);

      const transacciones = result.getValue();
      expect(transacciones[0].fecha).toEqual(new Date(Date.UTC(2026, 3, 2)));
      expect(transacciones.at(-1)?.fecha).toEqual(
        new Date(Date.UTC(2026, 3, 30)),
      );
    });

    it('"Subtotales" (fila resumen de página 2) queda excluido — no aparece como movimiento', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancoestado-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoEstado);

      const transacciones = result.getValue();
      expect(
        transacciones.some((t) => t.descripcion.includes('Subtotales')),
      ).toBe(false);
    });

    it('la suma de cargo/abono de las 13 filas reales es exacta (verificada fila a fila contra el saldo corrido del fixture)', async () => {
      // NOTA (hallazgo PR4b): los totales IMPRESOS en el encabezado del PDF
      // ("Total Cargos $135.010" / "Total Abonos $150.000") NO reconcilian
      // con la suma real de las 13 filas de movimiento — verificado fila a
      // fila contra el saldo corrido impreso en cada fila (15.000 → 35.000 →
      // 20.000 → ... → 20.000, ver engram apply-progress sprint4-pdf-ingesta
      // para el detalle del cálculo). Es una inconsistencia del FIXTURE
      // (dato sintético/anonimizado), no un bug de parseo — este test fija
      // el total real y verificable, no el impreso.
      const buffer = await readFile(
        join(fixturesDir, 'bancoestado-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoEstado);

      const transacciones = result.getValue();
      const totalCargos = transacciones.reduce((acc, t) => acc + t.cargo, 0n);
      const totalAbonos = transacciones.reduce((acc, t) => acc + t.abono, 0n);

      expect(totalCargos).toBe(125000n);
      expect(totalAbonos).toBe(130000n);
      expect(typeof totalCargos).toBe('bigint');
      expect(typeof totalAbonos).toBe('bigint');
    });
  });

  describe('Banco de Chile (fixture real, PR4b)', () => {
    it('normaliza a las 11 filas de movimiento reales, excluyendo SALDO INICIAL/FINAL (PDF-03)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancochile-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoChile);

      expect(result.isOk()).toBe(true);
      const transacciones = result.getValue();
      expect(transacciones).toHaveLength(11);
      for (const t of transacciones) {
        expect(t.fecha.getUTCFullYear()).toBe(2026);
        expect(t.fecha.getUTCMonth()).toBe(3); // abril, 0-indexed
        expect(typeof t.cargo).toBe('bigint');
        expect(typeof t.abono).toBe('bigint');
      }
      expect(transacciones.some((t) => t.descripcion.includes('SALDO'))).toBe(
        false,
      );
    });

    it('cargo/abono se asignan a la columna correcta (ej. COMPRA COMERCIO GENERICO es cargo, ABONO TRANSFERENCIA es abono)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancochile-cartola-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoChile);
      const transacciones = result.getValue();

      const compra = transacciones.find((t) =>
        t.descripcion.includes('COMPRA COMERCIO GENERICO'),
      );
      expect(compra?.cargo).toBe(15990n);
      expect(compra?.abono).toBe(0n);

      const abono = transacciones.find((t) =>
        t.descripcion.includes('ABONO TRANSFERENCIA'),
      );
      expect(abono?.abono).toBe(250000n);
      expect(abono?.cargo).toBe(0n);
    });
  });

  describe('BCI (fixture real, PR4b)', () => {
    it('normaliza a las 18 filas de movimiento reales, concatenando 2 páginas, año explícito por fila (PDF-03)', async () => {
      const buffer = await readFile(join(fixturesDir, 'bci-cartola-test.pdf'));

      const result = await service.normalize(buffer, BancoConocido.BCI);

      expect(result.isOk()).toBe(true);
      const transacciones = result.getValue();
      expect(transacciones).toHaveLength(18);
      for (const t of transacciones) {
        expect(t.fecha.getUTCFullYear()).toBe(2026);
        expect(t.fecha.getUTCMonth()).toBe(3); // abril, 0-indexed
        expect(typeof t.cargo).toBe('bigint');
        expect(typeof t.abono).toBe('bigint');
      }
    });

    it('el footer de navegador (URL + timestamp de impresión + indicador de página) no aparece como movimiento', async () => {
      const buffer = await readFile(join(fixturesDir, 'bci-cartola-test.pdf'));

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      expect(
        transacciones.some((t) => t.descripcion.includes('https://')),
      ).toBe(false);
      expect(
        transacciones.some((t) => /\d{1,2}:\d{2}\s*[AP]M/.test(t.descripcion)),
      ).toBe(false);
    });

    it('el encabezado de tabla (las 3 líneas físicas: "CHEQUES Y", "N° DE ... OTROS DEPOSITOS", "FECHA DESCRIPCION DOCUMENTO") y el título repetidos al inicio de la página 2 no aparecen como movimiento ni contaminan la última descripción de la página 1', async () => {
      const buffer = await readFile(join(fixturesDir, 'bci-cartola-test.pdf'));

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      for (const t of transacciones) {
        expect(t.descripcion).not.toContain('CARTOLA DE CUENTA CORRIENTE');
        expect(t.descripcion).not.toMatch(/^DESCRIPCION\b/);
        // Fragmento real que se fusiona (bug confirmado): "N° DE" es la
        // segunda línea física del encabezado de tabla repetido en la
        // página 2 ("N° DE" / "OTROS" / "DEPOSITOS") — antes del fix se
        // pegaba como sufijo de "CARGO MANTENCION CUENTA" (última
        // transacción de la página 1) vía fusionarContinuaciones.
        expect(t.descripcion).not.toContain('N° DE');
        expect(t.descripcion).not.toContain('CHEQUES Y');
      }
    });

    it('continuaciones multilínea se fusionan — no aparecen filas huérfanas sin fecha ni monto', async () => {
      const buffer = await readFile(join(fixturesDir, 'bci-cartola-test.pdf'));

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      // Las 18 transacciones reales, ninguna con cargo=0 Y abono=0 a la vez
      // (una fila huérfana fusionada mal habría dejado su propia fila con
      // ambos en 0 si la fusión hubiera fallado en crear una fila nueva
      // espuria — no debería ocurrir, pero se verifica explícitamente).
      for (const t of transacciones) {
        expect(t.cargo > 0n || t.abono > 0n).toBe(true);
      }
      // El fragmento "001/012" (cuota de un pago de crédito) debe aparecer
      // fusionado en la descripción de alguna transacción real, no perdido.
      expect(transacciones.some((t) => t.descripcion.includes('001/012'))).toBe(
        true,
      );
    });

    it('hardening jd-fix-agent — las descripciones multilínea se atribuyen a la transacción fechada correcta por geometría, no por recencia (7 filas confirmadas contra el fixture real)', async () => {
      const buffer = await readFile(join(fixturesDir, 'bci-cartola-test.pdf'));

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      // [3] cargo=700000 — NO debe absorber la etiqueta "PAGO CREDITO..."
      // que pertenece a la transacción SIGUIENTE (250213).
      const transferTercero = transacciones.find(
        (t) => t.cargo === 700000n && t.abono === 0n,
      );
      expect(transferTercero?.descripcion).toBe('TRANSFER A TERCERO EJEMPLO');

      // [4] cargo=250213 — debe incluir la etiqueta de arriba ("PAGO
      // CREDITO D00000000001"), el número de documento propio
      // ("4800000001") y la cuota de abajo ("001/012"), en ese orden.
      const pagoCredito = transacciones.find(
        (t) => t.cargo === 250213n && t.abono === 0n,
      );
      expect(pagoCredito?.descripcion).toBe(
        'PAGO CREDITO D00000000001 4800000001 001/012',
      );

      // [5] cargo=9990 (la primera suscripción, 03/04) — NO debe absorber
      // "COMISION POR COMPRA", que pertenece a la transacción SIGUIENTE
      // (5375).
      const suscripcionDigital = transacciones.find(
        (t) => t.cargo === 9990n && t.fecha.getUTCDate() === 3,
      );
      expect(suscripcionDigital?.descripcion).toBe(
        'SUSCRIPCION SERVICIO DIGITAL',
      );

      // [6] cargo=5375 — descripción propia vacía en el PDF: debe
      // reconstruirse enteramente desde las 2 líneas huérfanas vecinas.
      const comisionCompra = transacciones.find((t) => t.cargo === 5375n);
      expect(comisionCompra?.descripcion).toBe(
        'COMISION POR COMPRA INTERNACIONAL',
      );

      // [10] cargo=3500 — NO debe absorber el fragmento de encabezado
      // "N° DE" de la página 2 (Fix 2).
      const cargoMantencion = transacciones.find((t) => t.cargo === 3500n);
      expect(cargoMantencion?.descripcion).toBe('CARGO MANTENCION CUENTA');
      expect(cargoMantencion?.descripcion).not.toContain('N° DE');

      // [12] abono=300000 — NO debe absorber "TRASPASO DE FONDOS A
      // TERCERO", que pertenece a la transacción SIGUIENTE (cargo=50000).
      const depositoEfectivo = transacciones.find((t) => t.abono === 300000n);
      expect(depositoEfectivo?.descripcion).toBe('DEPOSITO EN EFECTIVO');

      // [13] cargo=50000 — descripción propia vacía en el PDF: debe
      // reconstruirse enteramente desde las 2 líneas huérfanas vecinas.
      const traspasoFondos = transacciones.find((t) => t.cargo === 50000n);
      expect(traspasoFondos?.descripcion).toBe(
        'TRASPASO DE FONDOS A TERCERO EJEMPLO GENERICO',
      );
    });
  });

  describe('BCI (fixture sintético "montos grandes" — geometría de las 15 cartolas reales, recalibración 2026-08-30)', () => {
    it('normaliza las 8 transacciones (9 filas fechadas menos la fila $0), 3 páginas, montos BigInt exactos', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bci-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BCI);

      expect(result.isOk()).toBe(true);
      const transacciones = result.getValue();
      expect(transacciones).toHaveLength(8);
      for (const t of transacciones) {
        expect(t.fecha.getUTCFullYear()).toBe(2026);
        expect(t.fecha.getUTCMonth()).toBe(4); // mayo, 0-indexed
        expect(t.cargo > 0n || t.abono > 0n).toBe(true);
      }
      // La suma cuadra con los totales impresos en la última página del
      // fixture (a diferencia del fixture de BancoEstado, este se generó
      // con el saldo corrido exacto).
      expect(transacciones.reduce((acc, t) => acc + t.cargo, 0n)).toBe(
        11654280n,
      );
      expect(transacciones.reduce((acc, t) => acc + t.abono, 0n)).toBe(
        1895320n,
      );
    });

    it('el cargo ANCHO de 8 dígitos (x≈381, fuera de la banda original) y el abono corrido a la izquierda (x≈459.3) se asignan a su columna', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bci-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      const inversion = transacciones.find((t) => t.cargo === 11200000n);
      expect(inversion?.abono).toBe(0n);
      expect(inversion?.descripcion).toContain('INVERSION DEPOSITO PLAZO FIJO');

      const transferencia = transacciones.find((t) => t.abono === 1850000n);
      expect(transferencia?.cargo).toBe(0n);
      expect(transferencia?.descripcion).toContain(
        'TRANSFERENCIA DE TERCERO FICTICIO',
      );
    });

    it('la fila $0 ("VERIFICACION DE CUENTA", cargo "0" literal) se descarta como no-movimiento — la cartola completa NO se rechaza', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bci-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      expect(
        transacciones.some((t) =>
          t.descripcion.includes('VERIFICACION DE CUENTA'),
        ),
      ).toBe(false);
    });

    it('el cluster de continuación multilínea se reconstruye (etiqueta ARRIBA + documento desbordado + cuota ABAJO)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bci-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      const pagoCredito = transacciones.find((t) => t.cargo === 310550n);
      expect(pagoCredito?.descripcion).toBe(
        'PAGO CREDITO D07700445566 7700445566 004/024',
      );
    });

    it('la sección de totales de la última página no se filtra a ninguna descripción ("Periodo Saldo Anterior" era el leak de fusionarContinuaciones)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bci-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      for (const t of transacciones) {
        expect(t.descripcion).not.toContain('Saldo Anterior');
        expect(t.descripcion).not.toContain('Total Cargos');
        expect(t.descripcion).not.toContain('Total Abonos');
        expect(t.descripcion).not.toContain('Saldo Disponible');
      }
    });
  });

  // Slice 3 (change SDD `bci-cartola-variante`, Phase 7) — la segunda
  // variante de cartola BCI: fechas con guion fuera de la banda `fecha`
  // ACTUAL (D-03) y montos en la nueva geometría medida (D-02). RED contra
  // el `rangosX` pre-Fase-8: la mayoría de las fechas quedan sin asignar
  // (Trampa 1, tasks.md) y el conteo de movimientos queda muy por debajo
  // de 11.
  //
  // Los 4 valores SALDO_* duplican (no importan) las constantes exportadas
  // por `generar-bci-cartola-variante-test.ts` — mismo patrón que
  // `PASSWORD_FIXTURE` arriba: importar el generador reescribe el binario
  // del fixture en cada corrida, efecto colateral indeseado en un test
  // suite. Si el generador cambia sus montos, estos literales y el
  // multiset de abajo deben actualizarse a mano.
  describe('BCI (fixture sintético "variante" — segunda geometría publicada, D-02/D-03/D-12/AMENDMENT A-01)', () => {
    const SALDO_ANTERIOR = 8_000_000n;
    // AMENDMENT A-01 (Phase 42/43) — 3 cargos cortos nuevos (5+42+756=803)
    // suman sobre el TOTAL_CARGOS de Slice 3 (1_577_656n): estos literales
    // duplican (no importan) las constantes exportadas por
    // `generar-bci-cartola-variante-test.ts` — mismo patrón documentado
    // arriba (PASSWORD_FIXTURE).
    const TOTAL_CARGOS = 1_578_459n;
    const TOTAL_ABONOS = 486_000n;
    const SALDO_FINAL = 6_907_541n;

    // {fecha ISO (UTC), descripcion, cargo, abono} — multiset exacto de las
    // 11 filas de `movimientosPlan` en
    // `generar-bci-cartola-variante-test.ts`.
    const ESPERADAS: ReadonlyArray<{
      fecha: string;
      descripcion: string;
      cargo: bigint;
      abono: bigint;
    }> = [
      {
        fecha: '2026-06-05',
        descripcion: 'COMPRA FICTICIA UNO',
        cargo: 45_000n,
        abono: 0n,
      },
      {
        fecha: '2026-06-06',
        descripcion: 'COMPRA FICTICIA DOS',
        cargo: 120_500n,
        abono: 0n,
      },
      {
        fecha: '2026-06-07',
        descripcion: 'PAGO SERVICIO FICTICIO',
        cargo: 89_990n,
        abono: 0n,
      },
      {
        fecha: '2026-06-08',
        descripcion: 'TRANSFERENCIA RECIBIDA FICTICIA',
        cargo: 0n,
        abono: 250_000n,
      },
      {
        fecha: '2026-06-09',
        descripcion: 'COMPRA FICTICIA TRES',
        cargo: 15_300n,
        abono: 0n,
      },
      {
        fecha: '2026-06-10',
        descripcion: 'DEPOSITO FICTICIO DOS',
        cargo: 0n,
        abono: 180_000n,
      },
      {
        fecha: '2026-06-11',
        descripcion: 'COMPRA FICTICIA CUATRO',
        cargo: 67_000n,
        abono: 0n,
      },
      {
        fecha: '2026-06-12',
        descripcion: 'COMPRA FICTICIA CINCO ANCHA',
        cargo: 1_234_567n,
        abono: 0n,
      },
      {
        fecha: '2026-06-13',
        descripcion: 'PAGO FICTICIO SEIS',
        cargo: 4_300n,
        abono: 0n,
      },
      {
        fecha: '2026-06-14',
        descripcion: 'DEPOSITO FICTICIO TRES',
        cargo: 0n,
        abono: 56_000n,
      },
      {
        fecha: '2026-06-15',
        descripcion: 'COMPRA FICTICIA SIETE',
        cargo: 999n,
        abono: 0n,
      },
      // AMENDMENT A-01 (Phase 42/43) — 3 cargos cortos nuevos, SIN separador
      // de miles, right-aligned por construcción en el generador (misma
      // tabla `anchoEstimado` que `cargo.rescateBordeDerecho` usa en
      // producción). Los 2 primeros caen en el catchment [440,450) por
      // borde izquierdo (la falla real de producción); el tercero cae en
      // [437.6,440) (ya funcionaba antes del amendment).
      {
        fecha: '2026-06-16',
        descripcion: 'COMPRA FICTICIA OCHO MONTO CORTO',
        cargo: 5n,
        abono: 0n,
      },
      {
        fecha: '2026-06-17',
        descripcion: 'COMPRA FICTICIA NUEVE MONTO CORTO',
        cargo: 42n,
        abono: 0n,
      },
      {
        fecha: '2026-06-18',
        descripcion: 'COMPRA FICTICIA DIEZ MONTO CORTO',
        cargo: 756n,
        abono: 0n,
      },
    ];

    it('normaliza a las 14 filas de movimiento de la variante (fechas con guion, banda `fecha` D-03, geometría de montos D-02, cargos cortos rescatados por borde derecho AD-01), y cuadra la identidad de reconciliación (D-13)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bci-cartola-variante-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BCI);

      expect(result.isOk()).toBe(true);
      const transacciones = result.getValue();
      expect(transacciones).toHaveLength(ESPERADAS.length);

      const multisetObtenido = transacciones
        .map((t) => ({
          fecha: t.fecha.toISOString().slice(0, 10),
          descripcion: t.descripcion,
          cargo: t.cargo,
          abono: t.abono,
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      const multisetEsperado = [...ESPERADAS].sort((a, b) =>
        a.fecha.localeCompare(b.fecha),
      );
      expect(multisetObtenido).toEqual(multisetEsperado);

      const sumaCargo = transacciones.reduce((acc, t) => acc + t.cargo, 0n);
      const sumaAbono = transacciones.reduce((acc, t) => acc + t.abono, 0n);
      expect(sumaCargo).toBe(TOTAL_CARGOS);
      expect(sumaAbono).toBe(TOTAL_ABONOS);

      // D-13 — el único chequeo que atrapa tanto una fila perdida (1x) como
      // una inversión de signo (2x): la identidad de reconciliación contra
      // el saldo corrido que el generador computó por construcción.
      expect(SALDO_ANTERIOR - sumaCargo + sumaAbono).toBe(SALDO_FINAL);
    });

    // Slice 3 (Phase 13, D-12 hazard) — el título de página repetido
    // ("CARTOLA DE CUENTA CORRIENTE") y el encabezado de tabla de una sola
    // línea ("FECHA"/"SUCURSAL"/"DESCRIPCION"/"CHEQUES"/"DEPOSITOS"/"SALDO
    // DIARIO") de esta variante se repiten en las 3 páginas del fixture —
    // ninguno debe filtrarse a la descripción de una transacción vecina vía
    // `fusionarContinuaciones`. Confirmado INERTE sin necesitar un nuevo
    // `filasIgnoradas`: el título ya lo cubre el filtro
    // `/CARTOLA DE CUENTA CORRIENTE/` heredado de V1, y el encabezado de
    // tabla trae "CHEQUES"/"DEPOSITOS" no-vacíos en las columnas
    // cargo/abono — eso por sí solo bloquea la fusión (misma guarda que
    // protege el encabezado de V1). Guarda de regresión permanente, no
    // especulativa (YAGNI): si algún día deja de ser inerte, este test se
    // pone rojo y documenta por qué.
    it('el título de página y el encabezado de tabla repetidos (3 páginas) no contaminan ninguna descripción', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bci-cartola-variante-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BCI);
      const transacciones = result.getValue();

      for (const t of transacciones) {
        expect(t.descripcion).not.toContain('CARTOLA DE CUENTA CORRIENTE');
        expect(t.descripcion).not.toContain('FECHA');
        expect(t.descripcion).not.toContain('SUCURSAL');
        expect(t.descripcion).not.toContain('DESCRIPCION');
        expect(t.descripcion).not.toContain('CHEQUES');
        expect(t.descripcion).not.toContain('DEPOSITOS');
        expect(t.descripcion).not.toContain('SALDO DIARIO');
      }
    });
  });

  describe('Banco de Chile (fixture sintético "montos grandes" — geometría de las 16 cartolas reales, recalibración 2026-08-30)', () => {
    it('normaliza las 7 transacciones (9 filas fechadas menos SALDO INICIAL/FINAL), montos BigInt exactos contra la ecuación del resumen', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancochile-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoChile);

      expect(result.isOk()).toBe(true);
      const transacciones = result.getValue();
      expect(transacciones).toHaveLength(7);
      for (const t of transacciones) {
        expect(t.fecha.getUTCFullYear()).toBe(2026);
        expect(t.fecha.getUTCMonth()).toBe(4); // mayo, 0-indexed
        expect(t.cargo > 0n || t.abono > 0n).toBe(true);
      }
      // La suma cuadra con la ecuación DEPOSITOS/OTROS ABONOS/OTROS CARGOS
      // impresa en el resumen del fixture (generado con saldo corrido
      // exacto: 20.000.000 + 15.277.000 - 13.281.108 = 21.995.892).
      expect(transacciones.reduce((acc, t) => acc + t.cargo, 0n)).toBe(
        13281108n,
      );
      expect(transacciones.reduce((acc, t) => acc + t.abono, 0n)).toBe(
        15277000n,
      );
    });

    it('el rango completo de abonos right-aligned queda en UNA banda: ancho (x≈472.6), mediano (x≈482.7) y mínimo (x≈496.4) — antes solo los chicos caían dentro de [495, 520)', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancochile-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoChile);
      const transacciones = result.getValue();

      const abonoAncho = transacciones.find((t) => t.abono === 15000000n);
      expect(abonoAncho?.cargo).toBe(0n);
      expect(abonoAncho?.descripcion).toContain('TRASPASO DE:Contraparte');

      const abonoMediano = transacciones.find((t) => t.abono === 276500n);
      expect(abonoMediano?.cargo).toBe(0n);

      const abonoMinimo = transacciones.find((t) => t.abono === 500n);
      expect(abonoMinimo?.cargo).toBe(0n);
    });

    it('el cargo ancho de 8 dígitos (x≈392.5) y el cargo de 1 dígito (x≈423.1) se asignan a la columna cargo', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancochile-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoChile);
      const transacciones = result.getValue();

      const inversion = transacciones.find((t) => t.cargo === 12345678n);
      expect(inversion?.abono).toBe(0n);
      expect(inversion?.descripcion).toBe('INVERSION DEPOSITO FICTICIO');

      const comision = transacciones.find((t) => t.cargo === 7n);
      expect(comision?.abono).toBe(0n);
      expect(comision?.descripcion).toBe('COMISION AJUSTE FICTICIO');
    });

    it('los saldos corridos (x≥548), el valor de "SALDO DISPONIBLE A LA FECHA" (x≈543.4) y la ecuación del resumen quedan fuera de las bandas — ningún saldo se cuela como cargo/abono ni contamina descripciones', async () => {
      const buffer = await readFile(
        join(fixturesDir, 'bancochile-cartola-montos-grandes-test.pdf'),
      );

      const result = await service.normalize(buffer, BancoConocido.BancoChile);
      const transacciones = result.getValue();

      // 21.995.892 aparece 3 veces en el fixture (saldo corrido, SALDO
      // FINAL, SALDO DISPONIBLE) — jamás como monto de una transacción.
      for (const t of transacciones) {
        expect(t.cargo).not.toBe(21995892n);
        expect(t.abono).not.toBe(21995892n);
        expect(t.cargo).not.toBe(20000000n);
        expect(t.descripcion).not.toContain('SALDO');
        expect(t.descripcion).not.toContain('OTROS ABONOS');
        expect(t.descripcion).not.toContain('RETENCION');
      }
    });
  });

  it('retorna Fail(EstructuraPdfInvalidaError) para un buffer corrupto, sin colgar el proceso', async () => {
    const buffer = Buffer.from('esto no es un pdf');

    const result = await service.normalize(buffer, BancoConocido.Santander);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstructuraPdfInvalidaError);
  });

  it('el mensaje de error nunca interpola texto crudo del PDF (buffer corrupto)', async () => {
    const buffer = Buffer.from('esto no es un pdf $999.999');

    const result = await service.normalize(buffer, BancoConocido.BancoEstado);

    expect(result.isFail()).toBe(true);
    expect(result.getError().message).not.toContain('$999.999');
  });

  describe('password forwarding al extractor (D-01/D-05)', () => {
    it('sin password, PDF protegido → colapsa a EstructuraPdfInvalidaError "PdfIlegible" (masking existente)', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));

      const result = await service.normalize(buffer, BancoConocido.BancoEstado);

      expect(result.isFail()).toBe(true);
      const error = result.getError() as EstructuraPdfInvalidaError;
      expect(error).toBeInstanceOf(EstructuraPdfInvalidaError);
      expect(error.problemas).toEqual([{ tipo: 'PdfIlegible' }]);
    });

    it('forwarda la password correcta al extractor — deja de colapsar en PdfIlegible (la extracción tuvo éxito)', async () => {
      const buffer = await readFile(join(fixturesDir, 'protegida-test.pdf'));

      const result = await service.normalize(
        buffer,
        BancoConocido.BancoEstado,
        PASSWORD_FIXTURE,
      );

      // El fixture no tiene la estructura de ningún banco real — la
      // extracción SÍ tiene éxito (prueba del forwarding), pero
      // evaluarEstructura falla por anclas faltantes, no por PdfIlegible.
      expect(result.isFail()).toBe(true);
      const error = result.getError() as EstructuraPdfInvalidaError;
      expect(error).toBeInstanceOf(EstructuraPdfInvalidaError);
      expect(error.problemas).not.toEqual([{ tipo: 'PdfIlegible' }]);
    });
  });
});
