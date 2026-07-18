import { IReloj } from '../../../application/ports/reloj.port';

/** SystemReloj — implementación real de `IReloj`, envuelve `new Date()`. */
export class SystemReloj implements IReloj {
  ahora(): Date {
    return new Date();
  }
}
