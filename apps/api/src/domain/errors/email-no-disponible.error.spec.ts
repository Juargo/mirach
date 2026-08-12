import { EmailNoDisponibleError } from './email-no-disponible.error';

describe('EmailNoDisponibleError', () => {
  it('el nombre del error es EmailNoDisponibleError', () => {
    const error = new EmailNoDisponibleError();
    expect(error.name).toBe('EmailNoDisponibleError');
  });

  it('lleva un mensaje descriptivo (uso interno del port, nunca cruza el boundary HTTP)', () => {
    const error = new EmailNoDisponibleError();
    expect(error.message.length).toBeGreaterThan(0);
  });
});
