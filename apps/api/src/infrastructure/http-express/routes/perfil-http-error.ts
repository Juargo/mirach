import { NombrePerfilInvalidoError } from '../../../domain/errors/nombre-perfil-invalido.error';
import { EmailInvalidoError } from '../../../domain/errors/email-invalido.error';
import { PerfilDemoSoloLecturaError } from '../../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../../domain/errors/perfil-rechazado.error';
import { PasswordInvalidaError } from '../../../domain/errors/password-invalida.error';
import { ActualizarPerfilError } from '../../../application/use-cases/actualizar-perfil.use-case';
import { CambiarPasswordError } from '../../../application/use-cases/cambiar-password.use-case';

/**
 * aPerfilHttpError — ÚNICO traductor de errores para `registrarPerfil`
 * (US-040, design.md §5.3), ampliado en PR#2 a
 * `ActualizarPerfilError | CambiarPasswordError`. Mirrors `aCatalogoHttpError`'s
 * shape — pero NO es una reutilización: unión distinta, traductor propio
 * (design.md §5.3). Un class ⇒ exactamente un status ⇒ exactamente un `code`.
 *
 * El guard `const _exhaustive: never = error` es la garantía de compilación:
 * agregar una variante a cualquiera de las dos uniones sin mapearla acá DEJA
 * DE COMPILAR. En la otra dirección, agregar `EmailNoDisponibleError` a
 * `ActualizarPerfilError` también deja de compilar — esa es la prueba de que
 * nunca alcanza el boundary HTTP (D-01, colapsado siempre a
 * `PerfilRechazadoError`).
 */
export function aPerfilHttpError(
  error: ActualizarPerfilError | CambiarPasswordError,
): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof NombrePerfilInvalidoError) {
    return { status: 400, code: 'NOMBRE_INVALIDO', message: error.message };
  }
  if (error instanceof EmailInvalidoError) {
    return { status: 400, code: 'EMAIL_INVALIDO', message: error.message };
  }
  if (error instanceof PerfilDemoSoloLecturaError) {
    return { status: 403, code: 'DEMO_SOLO_LECTURA', message: error.message };
  }
  if (error instanceof PerfilRechazadoError) {
    return { status: 403, code: 'PERFIL_RECHAZADO', message: error.message };
  }
  if (error instanceof PasswordInvalidaError) {
    return { status: 400, code: 'PASSWORD_INVALIDA', message: error.message };
  }
  const _exhaustive: never = error;
  return _exhaustive;
}
