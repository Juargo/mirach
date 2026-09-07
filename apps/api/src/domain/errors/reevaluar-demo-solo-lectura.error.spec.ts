import { ReevaluarDemoSoloLecturaError } from './reevaluar-demo-solo-lectura.error';

describe('ReevaluarDemoSoloLecturaError', () => {
  it('el nombre del error es ReevaluarDemoSoloLecturaError', () => {
    const error = new ReevaluarDemoSoloLecturaError();
    expect(error.name).toBe('ReevaluarDemoSoloLecturaError');
  });

  it('el mensaje sigue la familia UX demo en tuteo neutro (PRODUCT.md)', () => {
    const error = new ReevaluarDemoSoloLecturaError();
    expect(error.message).toBe(
      'La reevaluación de categorías no está disponible en la cuenta demo. Crea una cuenta para reevaluar tus transacciones.',
    );
  });
});
