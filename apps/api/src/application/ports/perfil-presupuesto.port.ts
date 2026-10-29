import { PerfilPresupuesto } from '../../domain/value-objects/perfil-presupuesto';

/**
 * IPerfilPresupuestoReader — reads the user's budget profile (#110).
 *
 * Always returns a profile: a user who never chose one has the 50/30/20
 * default (column defaults). The summaries read it on every request, so a
 * profile change applies to every month, past ones too (PER-06).
 */
export interface IPerfilPresupuestoReader {
  obtener(userId: string): Promise<PerfilPresupuesto>;
}

/** IPerfilPresupuestoRepository — read plus write, for `PUT /api/perfil/presupuesto`. */
export interface IPerfilPresupuestoRepository extends IPerfilPresupuestoReader {
  guardar(userId: string, perfil: PerfilPresupuesto): Promise<void>;
}
