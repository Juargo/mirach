/**
 * VinculacionGoogleNoDisponibleError — error de dominio.
 *
 * Retornado por `IniciarVinculacionGoogleUseCase` cuando `iniciador.iniciar()`
 * falla — discovery/autorización de Google inalcanzable. Es un fallo de
 * DEPENDENCIA (`503`), no un error del cliente: distinto en naturaleza de
 * `PerfilRechazadoError`/`GoogleYaVinculadoError`, que sí son rechazos sobre
 * el input o el estado de la cuenta del propio caller.
 */
export class VinculacionGoogleNoDisponibleError extends Error {
  constructor() {
    super('No pudimos iniciar la vinculación con Google en este momento.');
    this.name = 'VinculacionGoogleNoDisponibleError';
  }
}
