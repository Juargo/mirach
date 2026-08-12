import { Result } from '../../shared/result';
import { CategorizacionFallidaError } from '../../domain/errors/categorizacion-fallida.error';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';

/**
 * ICatalogoClasificacion — port de aplicación (lectura de catálogo).
 *
 * Carga todos los patrones de clasificación del `userId` dueño del catálogo
 * (US-037: el catálogo es per-user, no global). La implementación Prisma los
 * lee en memoria una vez por llamada de ingesta (decisión 3).
 *
 * Contrato: retorna Result y NUNCA lanza. Un catálogo vacío (sin patrones) es
 * un resultado válido (ok con array vacío); solo errores estructurales retornan fail.
 */
export interface ICatalogoClasificacion {
  findAll(
    userId: string,
  ): Promise<
    Result<ReadonlyArray<PatronClasificacion>, CategorizacionFallidaError>
  >;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const CATALOGO_CLASIFICACION = 'ICatalogoClasificacion';
