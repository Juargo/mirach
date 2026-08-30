import {
  LoginConGoogleFallidoError,
  MotivoFalloGoogle,
} from './login-con-google-fallido.error';

const TODOS_LOS_MOTIVOS: MotivoFalloGoogle[] = [
  'email-no-verificado',
  'usuario-demo',
  'ya-vinculado-a-otra-identidad',
  'link-perdio-la-carrera',
  'creacion-perdio-la-carrera',
  'email-invalido',
];

describe('LoginConGoogleFallidoError', () => {
  it.each(TODOS_LOS_MOTIVOS)(
    'acepta el motivo "%s" y expone el mismo mensaje fijo',
    (motivo) => {
      const error = new LoginConGoogleFallidoError(motivo);
      expect(error.motivo).toBe(motivo);
      expect(error.message).toBe('No pudimos iniciar sesión con Google.');
    },
  );

  it('el mensaje es idéntico entre todos los motivos (AUTH-15 — no enumeración)', () => {
    const mensajes = TODOS_LOS_MOTIVOS.map(
      (motivo) => new LoginConGoogleFallidoError(motivo).message,
    );
    const unico = new Set(mensajes);
    expect(unico.size).toBe(1);
  });

  it('el nombre del error es LoginConGoogleFallidoError', () => {
    const error = new LoginConGoogleFallidoError('email-invalido');
    expect(error.name).toBe('LoginConGoogleFallidoError');
  });
});
