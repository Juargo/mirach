import { ExtensionNoPermitidaError } from '../errors/extension-no-permitida.error';

/**
 * Extensiones aceptadas para archivos bancarios.
 * .xlsx (ADR-007 — .xls legacy eliminado) y .pdf (Sprint 4, sprint4-pdf-ingesta —
 * cartolas PDF, pipeline detectar/validar/normalizar dedicado, ver design.md).
 */
const EXTENSIONES_PERMITIDAS = ['.xlsx', '.pdf'] as const;

export type ExtensionPermitida = (typeof EXTENSIONES_PERMITIDAS)[number];

/**
 * Extension — value object de dominio.
 *
 * Encapsula la regla de negocio: un archivo bancario válido debe tener
 * extensión .xlsx o .pdf (case-insensitive). Soporte .xls eliminado — ver
 * ADR-007.
 *
 * Invariantes garantizadas en construcción:
 *   - El valor siempre está en minúsculas.
 *   - Solo puede existir si la extensión es permitida; de lo contrario
 *     create() retorna un error.
 *
 * Los value objects son inmutables — no hay setters.
 */
export class Extension {
  private constructor(private readonly _valor: ExtensionPermitida) {}

  /**
   * Intenta crear un value object Extension desde el nombre de un archivo.
   * Retorna la instancia o lanza ExtensionNoPermitidaError.
   */
  static desdeNombreArchivo(nombreArchivo: string): Extension {
    const ultimoPunto = nombreArchivo.lastIndexOf('.');
    const raw = ultimoPunto === -1 ? '' : nombreArchivo.slice(ultimoPunto).toLowerCase();

    if (!(EXTENSIONES_PERMITIDAS as readonly string[]).includes(raw)) {
      throw new ExtensionNoPermitidaError(raw || nombreArchivo, EXTENSIONES_PERMITIDAS);
    }

    return new Extension(raw as ExtensionPermitida);
  }

  /** Retorna la extensión en minúsculas, ej: ".xlsx" */
  get valor(): ExtensionPermitida {
    return this._valor;
  }

  /** Lista de extensiones aceptadas — útil para mensajes de error y validaciones. */
  static get permitidas(): readonly string[] {
    return EXTENSIONES_PERMITIDAS;
  }
}
