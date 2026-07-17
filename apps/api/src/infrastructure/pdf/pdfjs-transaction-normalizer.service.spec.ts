import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PdfjsTransactionNormalizerService } from './pdfjs-transaction-normalizer.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';

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
        expect(Number.isInteger(t.cargo)).toBe(true);
        expect(Number.isInteger(t.abono)).toBe(true);
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
      expect(transferencia).toEqual({
        fecha: new Date(Date.UTC(2026, 2, 20)),
        descripcion: 'Transf a Tercero Maria Ejemplo',
        cargo: 120000,
        abono: 0,
      });

      const sueldo = result
        .getValue()
        .find((t) => t.descripcion === 'Abono Sueldo Empresa Generica');
      expect(sueldo).toEqual({
        fecha: new Date(Date.UTC(2026, 2, 5)),
        descripcion: 'Abono Sueldo Empresa Generica',
        cargo: 0,
        abono: 850000,
      });
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
        expect(Number.isInteger(t.cargo)).toBe(true);
        expect(Number.isInteger(t.abono)).toBe(true);
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
      const totalCargos = transacciones.reduce((acc, t) => acc + t.cargo, 0);
      const totalAbonos = transacciones.reduce((acc, t) => acc + t.abono, 0);

      expect(totalCargos).toBe(125000);
      expect(totalAbonos).toBe(130000);
      expect(Number.isInteger(totalCargos)).toBe(true);
      expect(Number.isInteger(totalAbonos)).toBe(true);
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
        expect(Number.isInteger(t.cargo)).toBe(true);
        expect(Number.isInteger(t.abono)).toBe(true);
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
      expect(compra?.cargo).toBe(15990);
      expect(compra?.abono).toBe(0);

      const abono = transacciones.find((t) =>
        t.descripcion.includes('ABONO TRANSFERENCIA'),
      );
      expect(abono?.abono).toBe(250000);
      expect(abono?.cargo).toBe(0);
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
        expect(Number.isInteger(t.cargo)).toBe(true);
        expect(Number.isInteger(t.abono)).toBe(true);
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
        expect(t.cargo > 0 || t.abono > 0).toBe(true);
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
        (t) => t.cargo === 700000 && t.abono === 0,
      );
      expect(transferTercero?.descripcion).toBe('TRANSFER A TERCERO EJEMPLO');

      // [4] cargo=250213 — debe incluir la etiqueta de arriba ("PAGO
      // CREDITO D00000000001"), el número de documento propio
      // ("4800000001") y la cuota de abajo ("001/012"), en ese orden.
      const pagoCredito = transacciones.find(
        (t) => t.cargo === 250213 && t.abono === 0,
      );
      expect(pagoCredito?.descripcion).toBe(
        'PAGO CREDITO D00000000001 4800000001 001/012',
      );

      // [5] cargo=9990 (la primera suscripción, 03/04) — NO debe absorber
      // "COMISION POR COMPRA", que pertenece a la transacción SIGUIENTE
      // (5375).
      const suscripcionDigital = transacciones.find(
        (t) => t.cargo === 9990 && t.fecha.getUTCDate() === 3,
      );
      expect(suscripcionDigital?.descripcion).toBe(
        'SUSCRIPCION SERVICIO DIGITAL',
      );

      // [6] cargo=5375 — descripción propia vacía en el PDF: debe
      // reconstruirse enteramente desde las 2 líneas huérfanas vecinas.
      const comisionCompra = transacciones.find((t) => t.cargo === 5375);
      expect(comisionCompra?.descripcion).toBe(
        'COMISION POR COMPRA INTERNACIONAL',
      );

      // [10] cargo=3500 — NO debe absorber el fragmento de encabezado
      // "N° DE" de la página 2 (Fix 2).
      const cargoMantencion = transacciones.find((t) => t.cargo === 3500);
      expect(cargoMantencion?.descripcion).toBe('CARGO MANTENCION CUENTA');
      expect(cargoMantencion?.descripcion).not.toContain('N° DE');

      // [12] abono=300000 — NO debe absorber "TRASPASO DE FONDOS A
      // TERCERO", que pertenece a la transacción SIGUIENTE (cargo=50000).
      const depositoEfectivo = transacciones.find((t) => t.abono === 300000);
      expect(depositoEfectivo?.descripcion).toBe('DEPOSITO EN EFECTIVO');

      // [13] cargo=50000 — descripción propia vacía en el PDF: debe
      // reconstruirse enteramente desde las 2 líneas huérfanas vecinas.
      const traspasoFondos = transacciones.find((t) => t.cargo === 50000);
      expect(traspasoFondos?.descripcion).toBe(
        'TRASPASO DE FONDOS A TERCERO EJEMPLO GENERICO',
      );
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
});
