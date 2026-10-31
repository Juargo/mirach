import {
  parsearPlataformaApp,
  type PlataformaApp,
} from '../../domain/value-objects/plataforma-app';
import { VersionApp } from '../../domain/value-objects/version-app';

/**
 * Configuración remota de las apps (ADR-005 §4.5, PLA-08): vive en la
 * configuración del API, así que cambiarla no exige publicar una versión nueva
 * de ninguna app.
 */
export interface ConfiguracionApp {
  readonly versionMinima: Readonly<Record<PlataformaApp, VersionApp>>;
  /** Límites del plan gratis (PLA-01: mes actual, 2 bancos). */
  readonly planGratis: {
    readonly bancosMaximos: number;
    readonly soloMesActual: boolean;
  };
  /** Nombres de los flags encendidos; cualquier otro se considera apagado. */
  readonly flagsActivos: readonly string[];
}

/** Lo que la app declara de sí misma; crudo, tal como llegó en la petición. */
export interface ClienteApp {
  readonly plataforma?: string;
  readonly version?: string;
}

export interface ConfiguracionAppDto {
  readonly versionMinima: Readonly<Record<PlataformaApp, string>>;
  readonly planGratis: ConfiguracionApp['planGratis'];
  readonly flags: Readonly<Record<string, boolean>>;
  /**
   * `true` cuando la versión instalada es menor que la mínima de su
   * plataforma; `null` cuando la app no declaró una plataforma y una versión
   * válidas (nunca un error: el endpoint debe servir a cualquier versión).
   */
  readonly actualizacionRequerida: boolean | null;
}

/**
 * ObtenerConfiguracionAppUseCase — respalda `GET /api/config`.
 *
 * El API decide si la app debe actualizarse (ADR-001: la regla de negocio no
 * vive en el cliente); la app solo muestra «Actualiza la app».
 */
export class ObtenerConfiguracionAppUseCase {
  constructor(private readonly config: ConfiguracionApp) {}

  execute(cliente: ClienteApp): ConfiguracionAppDto {
    const { versionMinima, planGratis, flagsActivos } = this.config;
    return {
      versionMinima: {
        ios: versionMinima.ios.toString(),
        android: versionMinima.android.toString(),
      },
      planGratis: { ...planGratis },
      flags: Object.fromEntries(flagsActivos.map((flag) => [flag, true])),
      actualizacionRequerida: this.actualizacionRequerida(cliente),
    };
  }

  private actualizacionRequerida(cliente: ClienteApp): boolean | null {
    if (cliente.plataforma === undefined || cliente.version === undefined) {
      return null;
    }
    const plataforma = parsearPlataformaApp(cliente.plataforma);
    const instalada = VersionApp.crear(cliente.version);
    if (plataforma.isFail() || instalada.isFail()) {
      return null;
    }
    return instalada
      .getValue()
      .esMenorQue(this.config.versionMinima[plataforma.getValue()]);
  }
}
