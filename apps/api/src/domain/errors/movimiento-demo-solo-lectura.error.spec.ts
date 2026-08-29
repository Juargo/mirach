import { MovimientoDemoSoloLecturaError } from './movimiento-demo-solo-lectura.error';

describe('MovimientoDemoSoloLecturaError', () => {
  it('el nombre del error es MovimientoDemoSoloLecturaError', () => {
    const error = new MovimientoDemoSoloLecturaError();
    expect(error.name).toBe('MovimientoDemoSoloLecturaError');
  });

  it('el mensaje sigue la familia UX demo en tuteo neutro (PRODUCT.md)', () => {
    const error = new MovimientoDemoSoloLecturaError();
    expect(error.message).toBe(
      'Los movimientos de la cuenta demo son de solo lectura. Crea una cuenta para gestionar tus movimientos.',
    );
  });
});
