import { CatalogoDemoSoloLecturaError } from './catalogo-demo-solo-lectura.error';

describe('CatalogoDemoSoloLecturaError', () => {
  it('el nombre del error es CatalogoDemoSoloLecturaError', () => {
    const error = new CatalogoDemoSoloLecturaError();
    expect(error.name).toBe('CatalogoDemoSoloLecturaError');
  });

  it('el mensaje sigue la familia UX de DemoUploadNudge.tsx', () => {
    const error = new CatalogoDemoSoloLecturaError();
    expect(error.message).toBe(
      'Las categorías de la cuenta demo son de solo lectura. Creá una cuenta para personalizar tu catálogo.',
    );
  });
});
