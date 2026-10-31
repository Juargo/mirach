import { Result } from '../../shared/result';
import {
  Consentimiento,
  TipoConsentimiento,
  VersionConsentimiento,
} from '../../domain/value-objects/consentimiento';
import { ConsentimientoCartolasRequeridoError } from '../../domain/errors/consentimiento-cartolas-requerido.error';
import { VersionConsentimientoInvalidaError } from '../../domain/errors/version-consentimiento-invalida.error';
import {
  IConsentimientoReader,
  IConsentimientoRepository,
} from '../ports/consentimiento-repository.port';

/** ListarConsentimientosUseCase — `GET /api/consentimientos` (#112). */
export class ListarConsentimientosUseCase {
  constructor(private readonly repositorio: IConsentimientoRepository) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<Consentimiento[], never>> {
    return Result.ok(await this.repositorio.listar(input.userId));
  }
}

/** AceptarConsentimientoUseCase — `POST /api/consentimientos` (#112, PRI-02). */
export class AceptarConsentimientoUseCase {
  constructor(private readonly repositorio: IConsentimientoRepository) {}

  async execute(input: {
    userId: string;
    tipo: TipoConsentimiento;
    version: string;
  }): Promise<Result<Consentimiento, VersionConsentimientoInvalidaError>> {
    const version = VersionConsentimiento.crear(input.version);
    if (version.isFail()) {
      return Result.fail(version.getError());
    }

    return Result.ok(
      await this.repositorio.aceptar(
        input.userId,
        input.tipo,
        version.getValue(),
      ),
    );
  }
}

/** RevocarConsentimientoUseCase — `DELETE /api/consentimientos/:tipo` (PRI-06). */
export class RevocarConsentimientoUseCase {
  constructor(private readonly repositorio: IConsentimientoRepository) {}

  async execute(input: {
    userId: string;
    tipo: TipoConsentimiento;
  }): Promise<Result<void, never>> {
    await this.repositorio.revocar(input.userId, input.tipo);
    return Result.ok(undefined);
  }
}

/**
 * VerificarConsentimientoCartolasUseCase — el control previo a importar
 * (PRI-02, PRI-06). Mientras `exigir` esté apagado no consulta nada: las apps
 * instaladas todavía no pueden pedir el consentimiento (#134).
 */
export class VerificarConsentimientoCartolasUseCase {
  constructor(
    private readonly reader: IConsentimientoReader,
    private readonly exigir: boolean,
  ) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<void, ConsentimientoCartolasRequeridoError>> {
    if (!this.exigir) {
      return Result.ok(undefined);
    }

    const vigente = await this.reader.tieneVigente(
      input.userId,
      TipoConsentimiento.Cartolas,
    );

    return vigente
      ? Result.ok(undefined)
      : Result.fail(new ConsentimientoCartolasRequeridoError());
  }
}
