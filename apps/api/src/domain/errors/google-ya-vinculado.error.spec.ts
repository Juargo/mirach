import { GoogleYaVinculadoError } from './google-ya-vinculado.error';

describe('GoogleYaVinculadoError', () => {
  it('el nombre del error es GoogleYaVinculadoError', () => {
    const error = new GoogleYaVinculadoError();
    expect(error.name).toBe('GoogleYaVinculadoError');
  });

  it('es un mensaje fijo, sin ningún input interpolado', () => {
    const a = new GoogleYaVinculadoError();
    const b = new GoogleYaVinculadoError();
    expect(a.message).toBe(b.message);
    expect(a.message.length).toBeGreaterThan(0);
  });
});
