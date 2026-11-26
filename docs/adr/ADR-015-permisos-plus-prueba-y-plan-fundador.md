---
tipo: adr
proyecto: Mirach
estado: Aceptado
fecha: 2026-11-26
requisitos: [PLA-01, PLA-02, PLA-03, PLA-06, PLA-07, PLA-09, PLA-10, PLA-11]
---

# ADR-015 — Permisos Plus concedidos, prueba sin tarjeta y plan Fundador

## Estado

Aceptado (2026-11-26). Decisión del product owner al preparar el cobro de la v1.1. Ajusta
ADR-012 en tres puntos: la prueba de 30 días (§3) deja de ser una oferta de las tiendas,
los derechos de Plus ya no vienen solo de una suscripción, y se agrega una compra única.
RevenueCat, el webhook y la regla "el API decide los derechos" de ADR-012 siguen igual.

## Contexto

- ADR-012 §3 configuraba la prueba como oferta introductoria de cada tienda. Esa oferta
  exige iniciar una suscripción con medio de pago y cobra si la persona no cancela. Mirach
  fomenta el ahorro: nadie debe quedar obligado a pagar para probar Plus.
- Los testers de Android reciben Plus de por vida. Las tiendas no permiten regalar una
  suscripción sin vencimiento.
- Se ofrece un plan Fundador: pago único que da Plus de por vida, con 100 cupos. Las
  tiendas no manejan cupos.
- El precio queda en $1.990 al mes o $14.990 al año (PLA-03); el Fundador, en $39.990
  (PLA-10). Los precios viven en las tiendas (ADR-012 §2).

## Decisión

1. **Permisos concedidos.** Una tabla `PermisoPlan` guarda los derechos de Plus que no
   vienen de una suscripción: `userId`, `motivo` (`prueba`, `tester_vitalicio` o
   `fundador`), `otorgadoEn`, `venceEn` (nulo si no vence) y `revocadoEn`. Un usuario tiene
   a lo más un permiso por motivo. Los permisos no se borran: se revocan.
2. **Plan efectivo.** Una cuenta tiene Plus si tiene una suscripción vigente **o** un
   permiso vigente. Un permiso está vigente si no fue revocado y no venció. La regla vive
   en el dominio del API y la respuesta sale por `GET /api/plan`; las apps no la calculan
   (ADR-001) ni usan el estado que informa el SDK de RevenueCat para autorizar (ADR-006).
   Cuando hay más de un origen vigente, `GET /api/plan` informa el que dura más: un permiso
   sin vencimiento, luego el que vence más tarde.
3. **Prueba sin tarjeta.** La prueba de 30 días la concede el API: no pasa por las tiendas
   ni pide medio de pago. No se guarda una fila por cuenta, se deriva: corre desde lo más
   tardío entre la creación de la cuenta (anónima incluida, ADR-013) y la fecha de
   activación del cobro (`PLUS_BILLING_STARTS_AT`), durante `PLUS_TRIAL_DAYS` días. Así
   una cuenta nueva parte con su prueba y una que ya existía recibe sus días completos
   desde la activación. Un permiso `prueba` guardado reemplaza a la derivada, para
   extenderla o revocarla a mano. El aviso de PLA-09 se calcula con ese vencimiento. El
   estado `prueba` de la tabla `Suscripcion` de ADR-012 ya no se usa.
   **Antes de activar el cobro**, sin `PLUS_BILLING_STARTS_AT` o con una fecha futura, toda
   cuenta tiene Plus con origen `lanzamiento` (el «Plus gratis durante el lanzamiento» de
   ADR-012). Activar el cobro es definir esa variable: no hay migración ni cambio de datos.
4. **Testers.** El Plus de por vida de los testers es un permiso `tester_vitalicio` sin
   vencimiento, concedido a mano con un script del API. Se refleja en RevenueCat como
   derecho promocional, pero la fuente de verdad es `PermisoPlan`.
5. **Plan Fundador.** Es una compra única no consumible en cada tienda, vendida por el SDK
   de RevenueCat. El webhook la convierte en un permiso `fundador` sin vencimiento. El API
   cuenta los permisos `fundador` no revocados y expone los cupos que quedan; las apps
   dejan de ofrecer la compra cuando llegan a cero. Un reembolso revoca el permiso y libera
   el cupo.
   Los cupos son `FUNDADOR_SEATS` (100). Una compra hecha en el entorno de pruebas de una
   tienda da Plus igual, para que App Review y los testers puedan probarla, pero no usa
   cupo. Sin `REVENUECAT_FUNDADOR_PRODUCT_ID` el Fundador no está en venta.
6. **Un solo derecho en RevenueCat.** Los tres productos (mensual, anual y Fundador) dan
   el mismo derecho `plus`. El API distingue el Fundador por el identificador del
   producto, que vive en la configuración del API.
7. **Al terminar cualquier origen**, la cuenta vuelve al plan gratis sin perder datos
   (PLA-07): los límites se aplican al escribir, nunca al leer ni al exportar.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Prueba como oferta introductoria de las tiendas (ADR-012 §3) | Pide medio de pago y cobra a quien olvida cancelar; contradice el principio de ahorro. Suele convertir más, y se acepta ese costo. |
| Guardar el vitalicio solo como derecho promocional en RevenueCat | Deja el beneficio en manos del proveedor; un cambio de proveedor lo perdería. |
| Una sola tabla para suscripciones y permisos | La suscripción cambia con cada evento de la tienda; el permiso es un registro que se concede y se revoca. Mezclarlos complica la idempotencia del webhook. |
| Limitar los cupos del Fundador en la tienda | Ninguna de las dos tiendas maneja cupos para una compra dentro de la app. |

## Consecuencias

- El cupo del Fundador no es exacto: entre la última venta y el momento en que cada app
  vuelve a consultar, pueden venderse algunos más. Se acepta; nunca se rechaza una compra
  ya cobrada.
- "De por vida" queda acotado por escrito: vale mientras la app exista, es personal e
  intransferible.
- Una cuenta anónima (ADR-013) puede comprar. Si la persona borra la app sin vincular, la
  compra se recupera con "Restaurar compras" (PLA-05), que la traslada a la cuenta nueva.
- Reinstalar la app con una cuenta anónima crea una cuenta nueva y, con ella, otra
  prueba. Se acepta: la cuenta anónima pierde todos sus datos al reinstalar, y fusionar
  cuentas (ADR-014) conserva la fecha de la cuenta de destino.
- Quitar `PLUS_BILLING_STARTS_AT` devuelve Plus a todas las cuentas: sirve para revertir
  la activación sin tocar datos.

## Referencias

- ADR-001, ADR-006, ADR-012, ADR-013
- `odd/tasks/monetizacion-plus.md`
- Serie anterior: no hay
