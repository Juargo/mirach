/** Conteos de una fusión terminada (ADR-014). */
export interface ResumenFusion {
  readonly cuentasMovidas: number;
  readonly cuentasUnidas: number;
  readonly movimientosMovidos: number;
  readonly duplicadosOmitidos: number;
  readonly categoriasMovidas: number;
  readonly patronesMovidos: number;
}

/**
 * IFusionCuentasRepository — fusión de una cuenta anónima en otra (ADR-014).
 *
 * `fusionar` es UNA transacción: o se aplica todo o no se escribe nada. Dentro
 * de ella bloquea los dos usuarios y vuelve a comprobar que el origen sigue
 * siendo anónimo y que ambos existen. Devuelve `null` (sin escribir) cuando no
 * es así; cualquier otro fallo lanza y la transacción se revierte.
 */
export interface IFusionCuentasRepository {
  fusionar(
    origenUserId: string,
    destinoUserId: string,
  ): Promise<ResumenFusion | null>;
}
