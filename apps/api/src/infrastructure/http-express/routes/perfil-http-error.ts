import { NombrePerfilInvalidoError } from '../../../domain/errors/nombre-perfil-invalido.error';
import { EmailInvalidoError } from '../../../domain/errors/email-invalido.error';
import { PerfilDemoSoloLecturaError } from '../../../domain/errors/perfil-demo-solo-lectura.error';
import { PerfilRechazadoError } from '../../../domain/errors/perfil-rechazado.error';
import { PasswordInvalidaError } from '../../../domain/errors/password-invalida.error';
import { GoogleYaVinculadoError } from '../../../domain/errors/google-ya-vinculado.error';
import { VinculacionGoogleNoDisponibleError } from '../../../domain/errors/vinculacion-google-no-disponible.error';
import { VinculoRequierePasswordError } from '../../../domain/errors/vinculo-requiere-password.error';
import { ActualizarPerfilError } from '../../../application/use-cases/actualizar-perfil.use-case';
import { CambiarPasswordError } from '../../../application/use-cases/cambiar-password.use-case';
import { IniciarVinculacionGoogleError } from '../../../application/use-cases/iniciar-vinculacion-google.use-case';
import { DesvincularGoogleError } from '../../../application/use-cases/desvincular-google.use-case';

/**
 * aPerfilHttpError — ÚNICO traductor de errores para `registrarPerfil` +
 * `registrarPerfilGoogleVincular` + `registrarPerfilGoogleDesvincular`
 * (US-040/US-041, design.md §5.3), ampliado en PR#2 (US-041) a
 * `ActualizarPerfilError | CambiarPasswordError |
 * IniciarVinculacionGoogleError` y en PR#3 a `DesvincularGoogleError`.
 * Mirrors `aCatalogoHttpError`'s shape — pero NO es una reutilización: unión
 * distinta, traductor propio (design.md §5.3). Un class ⇒ exactamente un
 * status ⇒ exactamente un `code`.
 *
 * El guard `const _exhaustive: never = error` es la garantía de compilación:
 * agregar una variante a cualquiera de las cuatro uniones sin mapearla acá
 * DEJA DE COMPILAR. En la otra dirección, agregar `EmailNoDisponibleError` a
 * `ActualizarPerfilError` — o `VinculacionGoogleFallidaError` a esta unión —
 * también dejaría de compilar: esa es la prueba de que ninguno de los dos
 * alcanza el boundary HTTP (`EmailNoDisponibleError` colapsa a
 * `PerfilRechazadoError`, D-04; `VinculacionGoogleFallidaError` nunca
 * produce un body — solo un `302`, design §5.3).
 */
export function aPerfilHttpError(
  error:
    | ActualizarPerfilError
    | CambiarPasswordError
    | IniciarVinculacionGoogleError
    | DesvincularGoogleError,
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
  if (error instanceof GoogleYaVinculadoError) {
    return {
      status: 409,
      code: 'GOOGLE_YA_VINCULADO',
      message: error.message,
    };
  }
  if (error instanceof VinculacionGoogleNoDisponibleError) {
    return {
      status: 503,
      code: 'GOOGLE_NO_DISPONIBLE',
      message: error.message,
    };
  }
  if (error instanceof VinculoRequierePasswordError) {
    return {
      status: 403,
      code: 'VINCULO_REQUIERE_PASSWORD',
      message: error.message,
    };
  }
  const _exhaustive: never = error;
  return _exhaustive;
}
