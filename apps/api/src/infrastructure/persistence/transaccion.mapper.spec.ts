import { aPersistencia, aDominio } from './transaccion.mapper';
import { NoOpCryptoService } from './no-op-crypto.service';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { Bucket } from '../../domain/value-objects/bucket';

const crypto = new NoOpCryptoService();

/** Helper: wrap a domain Transaccion as a one-shot TransaccionAPersistir (bucket:null, categoriaId:null). */
function oneShot(tx: Transaccion) {
  return { transaccion: tx, bucket: null, categoriaId: null } as const;
}

describe('transaccion.mapper', () => {
  describe('aPersistencia', () => {
    it('convierte cargo/abono numéricos a BigInt y deja bucketId y categoriaId nulos (one-shot path)', () => {
      const tx: Transaccion = Transaccion.crear({
        fecha: new Date('2026-05-14T00:00:00.000Z'),
        descripcion: 'Compra',
        cargo: 8103n,
        abono: 0n,
      }).getValue();

      const row = aPersistencia(oneShot(tx), crypto);

      expect(row.cargo).toBe(8103n);
      expect(row.abono).toBe(0n);
      expect(typeof row.cargo).toBe('bigint');
      expect(typeof row.abono).toBe('bigint');
      expect(row.bucketId).toBeNull();
      expect(row.categoriaId).toBeNull();
      expect(row.fecha).toEqual(tx.fecha);
    });

    it('cifra la descripción usando el crypto service', () => {
      const tx: Transaccion = Transaccion.crear({
        fecha: new Date('2026-05-15T00:00:00.000Z'),
        descripcion: 'Sueldo',
        cargo: 0n,
        abono: 1500000n,
      }).getValue();

      const row = aPersistencia(oneShot(tx), crypto);

      expect(row.descripcion).toBe('Sueldo');
      expect(row.abono).toBe(1500000n);
      expect(row.cargo).toBe(0n);
    });
  });

  describe('round-trip integrity', () => {
    it('preserva cargo positivo/abono cero sin pérdida (< 2^53)', () => {
      const tx: Transaccion = Transaccion.crear({
        fecha: new Date('2026-05-14T00:00:00.000Z'),
        descripcion: 'Retiro cajero',
        cargo: 1234567n,
        abono: 0n,
      }).getValue();

      const roundTripped = aDominio(aPersistencia(oneShot(tx), crypto), crypto);

      expect(roundTripped).toEqual(tx);
      expect(roundTripped.cargo).toBe(1234567n);
      expect(roundTripped.abono).toBe(0n);
    });

    it('preserva abono positivo/cargo cero sin pérdida (< 2^53)', () => {
      const tx: Transaccion = Transaccion.crear({
        fecha: new Date('2026-06-01T00:00:00.000Z'),
        descripcion: 'Transferencia',
        cargo: 0n,
        abono: 999999999n,
      }).getValue();

      const roundTripped = aDominio(aPersistencia(oneShot(tx), crypto), crypto);

      expect(roundTripped).toEqual(tx);
      expect(typeof roundTripped.cargo).toBe('bigint');
      expect(typeof roundTripped.abono).toBe('bigint');
    });
  });

  describe('aDominio', () => {
    it('convierte BigInt de vuelta a número y descifra la descripción', () => {
      const row = {
        fecha: new Date('2026-07-01T00:00:00.000Z'),
        descripcion: 'Pago',
        cargo: 50000n,
        abono: 0n,
        bucketId: null,
        categoriaId: null,
      };

      const tx = aDominio(row, crypto);

      expect(tx.cargo).toBe(50000n);
      expect(tx.abono).toBe(0n);
      expect(tx.descripcion).toBe('Pago');
      expect(tx.fecha).toEqual(row.fecha);
    });
  });

  describe('sign/zero contract', () => {
    // Una fila "neutra" (cargo=0, abono=0) viola el invariante SIN_MONTOS del
    // VO (CA-06/07/08). El pipeline de ingesta ya la descarta (FilaSinMontos),
    // así que NO debería existir en la DB. Si por corrupción existiera,
    // `aDominio` la trata como frontera de confianza rota → fail-fast (lanza),
    // en vez de devolver en silencio una transacción imposible.
    it('aDominio lanza ante una fila neutra corrupta (cargo=0 y abono=0)', () => {
      const row = {
        fecha: new Date('2026-08-01T00:00:00.000Z'),
        descripcion: 'Ajuste',
        cargo: 0n,
        abono: 0n,
        bucketId: null,
        categoriaId: null,
      };

      expect(() => aDominio(row, crypto)).toThrow();
    });
  });

  describe('US-057 PR2 regression guard — TransaccionAPersistir retype (§7 TDD constraint b)', () => {
    it('aPersistencia with { transaccion, bucket: null, categoriaId: null } produces { bucketId: null, categoriaId: null } — byte-for-byte identical to pre-retype behavior', () => {
      const tx = Transaccion.crear({
        fecha: new Date('2026-05-14T00:00:00.000Z'),
        descripcion: 'Compra',
        cargo: 8103n,
        abono: 0n,
      }).getValue();

      const entry = { transaccion: tx, bucket: null, categoriaId: null };
      const row = aPersistencia(entry, crypto);

      expect(row.bucketId).toBeNull();
      expect(row.categoriaId).toBeNull();
      expect(row.cargo).toBe(8103n);
      expect(row.abono).toBe(0n);
      expect(row.fecha).toEqual(tx.fecha);
    });

    it('aPersistencia with a non-null bucket resolves to the correct physical FK via BUCKET_IDS', () => {
      const tx = Transaccion.crear({
        fecha: new Date('2026-06-01T00:00:00.000Z'),
        descripcion: 'Supermercado',
        cargo: 15000n,
        abono: 0n,
      }).getValue();

      const entry = {
        transaccion: tx,
        bucket: Bucket.Necesidades,
        categoriaId: 'cat-abc',
      };
      const row = aPersistencia(entry, crypto);

      expect(row.bucketId).toBe('bucket-necesidades');
      expect(row.categoriaId).toBe('cat-abc');
    });

    it('aPersistencia with bucket: Ingreso resolves to bucket-ingreso FK', () => {
      const tx = Transaccion.crear({
        fecha: new Date('2026-06-02T00:00:00.000Z'),
        descripcion: 'Sueldo',
        cargo: 0n,
        abono: 1500000n,
      }).getValue();

      const entry = {
        transaccion: tx,
        bucket: Bucket.Ingreso,
        categoriaId: null,
      };
      const row = aPersistencia(entry, crypto);

      expect(row.bucketId).toBe('bucket-ingreso');
      expect(row.categoriaId).toBeNull();
    });

    it('aPersistencia with bucket: SinCategoria resolves to bucket-sincategoria FK (Fix 9)', () => {
      const tx = Transaccion.crear({
        fecha: new Date('2026-06-03T00:00:00.000Z'),
        descripcion: 'Movimiento sin clasificar',
        cargo: 42000n,
        abono: 0n,
      }).getValue();

      const entry = {
        transaccion: tx,
        bucket: Bucket.SinCategoria,
        categoriaId: null,
      };
      const row = aPersistencia(entry, crypto);

      expect(row.bucketId).toBe('bucket-sincategoria');
      expect(row.categoriaId).toBeNull();
    });
  });
});
