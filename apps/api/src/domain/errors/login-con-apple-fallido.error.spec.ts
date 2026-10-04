import {
  LoginConAppleFallidoError,
  MotivoFalloApple,
} from './login-con-apple-fallido.error';

const MOTIVOS: MotivoFalloApple[] = [
  'email-ausente',
  'email-no-verificado',
  'email-invalido',
  'ya-vinculado-a-otra-identidad',
  'link-perdio-la-carrera',
  'creacion-perdio-la-carrera',
];

describe('LoginConAppleFallidoError', () => {
  it.each(MOTIVOS)('expone el motivo "%s" y un mensaje fijo', (motivo) => {
    const error = new LoginConAppleFallidoError(motivo);

    expect(error.motivo).toBe(motivo);
    expect(error.message).toBe('No pudimos iniciar sesión con Apple.');
    expect(error.name).toBe('LoginConAppleFallidoError');
  });
});
