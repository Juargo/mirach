import { Result } from '../../shared/result';
import { VersionConsentimientoInvalidaError } from '../errors/version-consentimiento-invalida.error';

/** Lo que una persona puede aceptar (AUTH-03, PRI-02). */
export enum TipoConsentimiento {
  Terminos = 'terminos',
  Privacidad = 'privacidad',
  Cartolas = 'cartolas',
}

export const TIPOS_CONSENTIMIENTO: readonly TipoConsentimiento[] =
  Object.values(TipoConsentimiento);

/**
 * VersionConsentimiento — value object de dominio (ADR-004 §8).
 *
 * La versión del documento aceptado. Es una etiqueta que define quien publica
 * el documento (`2026-10`, `v1.2`): el API la guarda sin interpretarla ni
 * compararla, y solo acota su forma porque viene del cliente.
 */
export class VersionConsentimiento {
  private static readonly FORMATO = /^[A-Za-z0-9._-]{1,32}$/;

  private constructor(readonly valor: string) {}

  static crear(
    raw: string,
  ): Result<VersionConsentimiento, VersionConsentimientoInvalidaError> {
    if (!VersionConsentimiento.FORMATO.test(raw)) {
      return Result.fail(new VersionConsentimientoInvalidaError());
    }
    return Result.ok(new VersionConsentimiento(raw));
  }
}

/** Un registro de aceptación, vigente mientras `revocadoEn` sea `null`. */
export interface Consentimiento {
  readonly tipo: TipoConsentimiento;
  readonly version: string;
  readonly aceptadoEn: Date;
  readonly revocadoEn: Date | null;
}

/** Las dos versiones que se aceptan al crear la cuenta (AUTH-03). */
export interface AceptacionTerminos {
  readonly terminos: VersionConsentimiento;
  readonly privacidad: VersionConsentimiento;
}

/** Las versiones tal como las envía el cliente en un endpoint de token. */
export interface VersionesAceptadas {
  readonly terminos?: string | null;
  readonly privacidad?: string | null;
}

/**
 * aceptacionTerminos — sin ninguna versión devuelve `null`: la persona no
 * aceptó nada, y decidir si eso impide el alta le toca al caso de uso. Una
 * aceptación a medias o malformada nunca es una aceptación: es un error.
 */
export function aceptacionTerminos(
  versiones: VersionesAceptadas,
): Result<AceptacionTerminos | null, VersionConsentimientoInvalidaError> {
  const { terminos, privacidad } = versiones;

  if ((terminos ?? null) === null && (privacidad ?? null) === null) {
    return Result.ok(null);
  }

  if (typeof terminos !== 'string' || typeof privacidad !== 'string') {
    return Result.fail(new VersionConsentimientoInvalidaError());
  }

  const versionTerminos = VersionConsentimiento.crear(terminos);
  if (versionTerminos.isFail()) {
    return Result.fail(versionTerminos.getError());
  }

  const versionPrivacidad = VersionConsentimiento.crear(privacidad);
  if (versionPrivacidad.isFail()) {
    return Result.fail(versionPrivacidad.getError());
  }

  return Result.ok({
    terminos: versionTerminos.getValue(),
    privacidad: versionPrivacidad.getValue(),
  });
}
