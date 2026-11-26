/**
 * IVerificadorPlus — responde si una cuenta tiene Plus ahora mismo (ADR-006:
 * los derechos por plan se verifican en el servidor). Es lo único que un caso
 * de uso necesita saber del plan para aplicar un límite del plan gratis.
 */
export interface IVerificadorPlus {
  tienePlus(userId: string): Promise<boolean>;
}
