/**
 * GoogleYaVinculadoError — error de dominio.
 *
 * Retornado por `IniciarVinculacionGoogleUseCase` cuando la cuenta ya tiene
 * un `googleSub` (§P1). **UX pre-flight, NO un control de seguridad**: el
 * control real que impide re-linkear a otra identidad vive en
 * `VincularGoogleUseCase` (★ regla, CA-02) — este error solo evita mandar al
 * usuario a un consent screen de Google innecesario cuando ya sabemos que la
 * cuenta está vinculada. Mensaje fijo, sin ningún input interpolado.
 */
export class GoogleYaVinculadoError extends Error {
  constructor() {
    super('Tu cuenta ya tiene una identidad de Google vinculada.');
    this.name = 'GoogleYaVinculadoError';
  }
}
