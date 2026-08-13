import { PerfilDemoSoloLecturaError } from './perfil-demo-solo-lectura.error';

describe('PerfilDemoSoloLecturaError', () => {
  it('el nombre del error es PerfilDemoSoloLecturaError', () => {
    const error = new PerfilDemoSoloLecturaError();
    expect(error.name).toBe('PerfilDemoSoloLecturaError');
  });

  it('el mensaje apunta a registrar una cuenta real (D-05)', () => {
    const error = new PerfilDemoSoloLecturaError();
    expect(error.message).toMatch(/cuenta/i);
  });
});
