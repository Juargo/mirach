import { VerificacionIdentidadFallidaError } from './verificacion-identidad-fallida.error';

describe('VerificacionIdentidadFallidaError', () => {
  it('expone motivo para logging server-side', () => {
    const error = new VerificacionIdentidadFallidaError('discovery-fallo');
    expect(error.motivo).toBe('discovery-fallo');
  });

  it('el mensaje es fijo y genérico, no deriva del motivo', () => {
    const a = new VerificacionIdentidadFallidaError('discovery-fallo');
    const b = new VerificacionIdentidadFallidaError('id-token-invalido');
    expect(a.message).toBe(b.message);
  });

  it('el nombre del error es VerificacionIdentidadFallidaError', () => {
    const error = new VerificacionIdentidadFallidaError('discovery-fallo');
    expect(error.name).toBe('VerificacionIdentidadFallidaError');
  });
});
