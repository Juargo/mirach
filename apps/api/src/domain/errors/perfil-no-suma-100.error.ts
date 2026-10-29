/**
 * PerfilNoSuma100Error — error de dominio.
 *
 * Se produce cuando las tres metas de un perfil de presupuesto personalizado
 * no suman 10.000 puntos base (100 %). PER-05: "Los tres porcentajes deben
 * sumar 100% o la app no deja guardar". HTTP: 400 `PERFIL_NO_SUMA_100`.
 */
export class PerfilNoSuma100Error extends Error {
  constructor() {
    super('Las tres metas del perfil deben sumar 100%.');
    this.name = 'PerfilNoSuma100Error';
  }
}
