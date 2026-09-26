import { ReclasificarDemoSoloLecturaError } from './reclasificar-demo-solo-lectura.error';

describe('ReclasificarDemoSoloLecturaError', () => {
  it('el nombre del error es ReclasificarDemoSoloLecturaError', () => {
    const error = new ReclasificarDemoSoloLecturaError();
    expect(error.name).toBe('ReclasificarDemoSoloLecturaError');
  });

  it('el mensaje sigue la familia UX demo en tuteo neutro (PRODUCT.md)', () => {
    const error = new ReclasificarDemoSoloLecturaError();
    expect(error.message).toBe(
      'La reclasificación de transacciones no está disponible en la cuenta demo. Crea una cuenta para reclasificar tus movimientos.',
    );
  });
});
