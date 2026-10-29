/**
 * MetaPresupuestoInvalidaError — error de dominio.
 *
 * Se produce cuando una meta de un perfil de presupuesto es negativa, o
 * cuando un perfil guardado no corresponde a ningún perfil conocido. La
 * validación del cuerpo HTTP ya rechaza metas negativas; este error protege
 * al dominio de cualquier otro origen.
 */
export class MetaPresupuestoInvalidaError extends Error {
  constructor() {
    super('Las metas del perfil no son válidas.');
    this.name = 'MetaPresupuestoInvalidaError';
  }
}
