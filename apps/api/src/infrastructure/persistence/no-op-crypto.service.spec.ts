import { NoOpCryptoService } from './no-op-crypto.service';
import { ICryptoService } from '../../application/ports/crypto-service.port';

describe('NoOpCryptoService', () => {
  const service: ICryptoService = new NoOpCryptoService();

  it('encrypt devuelve el texto plano sin modificarlo', () => {
    expect(service.encrypt('Compra supermercado')).toBe('Compra supermercado');
  });

  it('decrypt devuelve el texto plano sin modificarlo', () => {
    expect(service.decrypt('Transferencia recibida')).toBe('Transferencia recibida');
  });

  it('encrypt seguido de decrypt preserva el valor original (round-trip)', () => {
    const original = 'Pago tarjeta de crédito';

    expect(service.decrypt(service.encrypt(original))).toBe(original);
  });

  it('preserva cadenas vacías sin alterarlas', () => {
    expect(service.encrypt('')).toBe('');
    expect(service.decrypt('')).toBe('');
  });
});
