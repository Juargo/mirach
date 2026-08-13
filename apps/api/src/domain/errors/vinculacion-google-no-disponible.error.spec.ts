import { VinculacionGoogleNoDisponibleError } from './vinculacion-google-no-disponible.error';

describe('VinculacionGoogleNoDisponibleError', () => {
  it('el nombre del error es VinculacionGoogleNoDisponibleError', () => {
    const error = new VinculacionGoogleNoDisponibleError();
    expect(error.name).toBe('VinculacionGoogleNoDisponibleError');
  });

  it('es un mensaje fijo, sin ningún input interpolado', () => {
    const a = new VinculacionGoogleNoDisponibleError();
    const b = new VinculacionGoogleNoDisponibleError();
    expect(a.message).toBe(b.message);
    expect(a.message.length).toBeGreaterThan(0);
  });
});
