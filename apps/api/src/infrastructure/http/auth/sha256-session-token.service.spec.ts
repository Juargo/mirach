import { Sha256SessionTokenService } from './sha256-session-token.service';

describe('Sha256SessionTokenService', () => {
  const service = new Sha256SessionTokenService();

  describe('generar()', () => {
    it('retorna un token y su hash coincidente', () => {
      const { token, tokenHash } = service.generar();

      expect(token).toBeTruthy();
      expect(tokenHash).toBe(service.hashToken(token));
    });

    it('genera tokens distintos en llamadas sucesivas', () => {
      const a = service.generar();
      const b = service.generar();

      expect(a.token).not.toBe(b.token);
      expect(a.tokenHash).not.toBe(b.tokenHash);
    });

    it('el token es base64url (sin +, / ni =)', () => {
      const { token } = service.generar();

      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('hashToken()', () => {
    it('es determinístico: el mismo token siempre produce el mismo hash', () => {
      const { token } = service.generar();

      expect(service.hashToken(token)).toBe(service.hashToken(token));
    });

    it('produce un hash hexadecimal de 64 caracteres (SHA-256)', () => {
      const { token } = service.generar();

      expect(service.hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
