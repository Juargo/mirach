/**
 * La función pedida es parte de Plus y la cuenta está en el plan gratis
 * (PLA-01). Nada se borra ni se cambia: la petición simplemente no se atiende.
 */
export class PlanPlusRequeridoError extends Error {
  constructor() {
    super('Esta función es parte de Mirach Plus.');
    this.name = 'PlanPlusRequeridoError';
  }
}
