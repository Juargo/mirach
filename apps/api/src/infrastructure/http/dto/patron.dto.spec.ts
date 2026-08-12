import { aPatronDto } from './patron.dto';

describe('aPatronDto', () => {
  it('maps the Patron port shape verbatim to the HTTP DTO shape', () => {
    const dto = aPatronDto({
      id: 'pat-1',
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 100,
    });

    expect(dto).toEqual({
      id: 'pat-1',
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
      prioridad: 100,
    });
  });
});
