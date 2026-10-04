import { NoopRevocadorIdentidadExterna } from './noop-revocador-identidad-externa';

describe('NoopRevocadorIdentidadExterna', () => {
  it('resuelve sin hacer nada', async () => {
    await expect(
      new NoopRevocadorIdentidadExterna().revocar('u1'),
    ).resolves.toBeUndefined();
  });
});
