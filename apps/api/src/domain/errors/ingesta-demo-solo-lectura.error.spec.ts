import { IngestaDemoSoloLecturaError } from './ingesta-demo-solo-lectura.error';

describe('IngestaDemoSoloLecturaError', () => {
  it('el nombre del error es IngestaDemoSoloLecturaError', () => {
    const error = new IngestaDemoSoloLecturaError();
    expect(error.name).toBe('IngestaDemoSoloLecturaError');
  });

  it('el mensaje sigue la familia UX de DemoUploadNudge.tsx', () => {
    const error = new IngestaDemoSoloLecturaError();
    expect(error.message).toBe(
      'Las cartolas de la cuenta demo son de solo lectura. Creá una cuenta para gestionar tus cartolas.',
    );
  });
});
