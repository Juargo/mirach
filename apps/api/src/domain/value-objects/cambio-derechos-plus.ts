import type { Suscripcion } from './plan';

/**
 * CambioDerechosPlus — lo que un evento de la tienda le hace a los derechos de
 * Plus de una cuenta (ADR-012 §1, ADR-015 §5), sin nada del proveedor que lo
 * informa.
 *
 * `usuarios` son los identificadores con que el proveedor conoce a la cuenta,
 * del más al menos probable: el cambio se aplica al primero que exista.
 */
export type CambioDerechosPlus =
  | {
      readonly tipo: 'suscripcion';
      readonly usuarios: readonly string[];
      readonly suscripcion: Suscripcion;
      readonly ocurridoEn: Date;
    }
  | {
      readonly tipo: 'fundador_otorgado';
      readonly usuarios: readonly string[];
      readonly ocurridoEn: Date;
      /** Compra hecha en el entorno de pruebas de la tienda: no usa un cupo. */
      readonly sandbox: boolean;
    }
  | {
      readonly tipo: 'fundador_revocado';
      readonly usuarios: readonly string[];
      readonly ocurridoEn: Date;
    }
  | {
      /** Las compras pasaron de una cuenta a otra (restaurar compras, PLA-05). */
      readonly tipo: 'transferencia';
      readonly desde: readonly string[];
      readonly hacia: readonly string[];
      readonly ocurridoEn: Date;
    }
  | {
      /** El evento no cambia ningún derecho; `motivo` es para el log. */
      readonly tipo: 'ignorado';
      readonly motivo: string;
    };
