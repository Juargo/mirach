/**
 * MotivoFalloVinculacionGoogle — las cinco razones internas por las que
 * `VincularGoogleUseCase` puede fallar. Solo para logging server-side —
 * NUNCA cruza el boundary HTTP: toda salida del use case en el callback
 * produce un `302` (mode-appropriate), nunca un body con `motivo`.
 */
export type MotivoFalloVinculacionGoogle =
  | 'usuario-inexistente'
  | 'usuario-demo'
  | 'identidad-de-otra-cuenta'
  | 'ya-tiene-otro-sub'
  | 'link-perdio-la-carrera';

/**
 * VinculacionGoogleFallidaError — error de dominio.
 *
 * El único error que retorna `VincularGoogleUseCase` para TODAS las ramas de
 * fallo (mirrors `LoginConGoogleFallidoError`'s shape — un `motivo` union
 * que alimenta una línea `.warn`) pero es una CLASE SEPARADA con su propia
 * unión: reusar el error de login mezclaría `motivo`s como
 * `'creacion-perdio-la-carrera'` o `'email-no-verificado'`, valores que el
 * camino de link NUNCA puede producir (design §2/D-08).
 *
 * `message` es fijo e idéntico entre los cinco `motivo`s; `motivo` existe
 * solo para el logging server-side y NUNCA se deriva en el mensaje ni llega
 * al cliente — el callback SIEMPRE responde `302 /configuracion?google=error`
 * para cualquier variante de este error, nunca un body HTTP (renombrado
 * desde `vinculacion-rechazada.error.ts` de la propuesta, por simetría con
 * `login-con-google-fallido.error.ts`).
 */
export class VinculacionGoogleFallidaError extends Error {
  constructor(readonly motivo: MotivoFalloVinculacionGoogle) {
    super('No pudimos vincular tu cuenta de Google.');
    this.name = 'VinculacionGoogleFallidaError';
  }
}
