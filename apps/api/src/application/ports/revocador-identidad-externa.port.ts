/**
 * IRevocadorIdentidadExterna — hook de revocación de la identidad externa
 * (Sign in with Apple exige revocar los tokens del usuario al eliminar la
 * cuenta, guideline 5.1.1(v)).
 *
 * Se invoca ANTES de borrar la cuenta: lo que una implementación necesita
 * (p. ej. el refresh token de Apple, T4) vive en las filas que el borrado
 * destruye. Es best-effort: el use case captura cualquier fallo, así que una
 * implementación puede lanzar sin impedir la eliminación. Nunca debe loguear
 * tokens ni datos personales.
 */
export interface IRevocadorIdentidadExterna {
  revocar(userId: string): Promise<void>;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const REVOCADOR_IDENTIDAD_EXTERNA = 'IRevocadorIdentidadExterna';
