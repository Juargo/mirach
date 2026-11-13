---
tipo: adr
proyecto: Mirach
estado: Aceptado
fecha: 2026-11-12
requisitos: [AUTH-07]
---

# ADR-014 — Fusión de una cuenta anónima con una cuenta existente

## Estado

Aceptado (2026-11-12). Decisión del product owner: cuando una persona que usó la app sin
cuenta entra a una cuenta que ya existía, los datos del dispositivo se unen a esa cuenta.
Completa ADR-013 §5, que dejó la fusión para una segunda entrega.

## Contexto

- Con ADR-013, vincular una identidad que ya tiene cuenta responde `409 CUENTA_YA_EXISTE`.
  La app entra a esa cuenta y guarda la sesión anónima en un ítem aparte del Keychain.
- `Transaccion` no tiene `userId`: pertenece a un usuario a través de su `Account`. Su
  llave a `Categoria` es de una sola columna, así que la base no impide que un movimiento
  apunte a la categoría de otro usuario.
- La unicidad de categorías es `(userId, bucketId, nombre)` (ADR-004) y las dos cuentas
  nacen de la misma plantilla: casi todas las categorías chocan.
- `descripcion` y `numeroCuenta` van cifrados con IV aleatorio (ADR-009). Los movimientos
  duplicados solo se pueden detectar descifrando; las cuentas bancarias, por su blind index,
  que usa la misma clave para todos los usuarios.
- Los límites del plan gratis solo se informan en `GET /api/config`; ningún caso de uso los
  aplica todavía.

## Decisión

1. **Endpoint.** `POST /api/cuenta/fusionar`, con sesión. El destino es siempre el usuario
   de la sesión. El cuerpo lleva el token de sesión de la cuenta anónima (`tokenOrigen`),
   que prueba que quien llama es su dueño.
2. **Quién puede fusionar.** El origen debe ser una cuenta anónima distinta del destino y
   con sesión vigente; si no, `409 ORIGEN_INVALIDO`, un solo código para todas las causas.
   El destino no puede ser anónimo (`409 DESTINO_ANONIMO`). Un token de origen inválido
   nunca responde `401`.
3. **Una sola transacción.** Todo se aplica o nada. Ante cualquier rechazo no se escribe.
4. **Cuentas bancarias.** Si origen y destino tienen la misma `(banco, tipoCuenta,
   numeroCuentaBlindIndex)`, se unen; si no, la cuenta se mueve. La cuenta de movimientos
   manuales sigue la misma regla.
5. **Movimientos.** En una cuenta unida se usa la regla de duplicados de la ingesta
   (`fecha|cargo|abono|descripcion`, contando copias): lo que ya existe en el destino se
   descarta y el resto se mueve con su categoría, bloque y marca de clasificación manual.
6. **Categorías y patrones.** Una categoría del origen con el mismo `(bucketId, nombre)`
   que una del destino se reemplaza por ella: primero se reapuntan sus movimientos y
   patrones y después se elimina. Las demás se mueven. Un patrón cuyo texto ya existe en
   el destino se descarta.
7. **Datos de la cuenta.** El destino conserva su nombre, email, perfil de presupuesto,
   metas, día de corte, ingreso declarado y consentimientos. Los del origen se descartan.
8. **Cierre.** Se borran las sesiones del origen y el usuario de origen. Una segunda
   llamada con el mismo token responde `409 ORIGEN_INVALIDO`.
9. **Solo con una acción explícita.** La app fusiona cuando la persona confirma «Entrar y
   unir datos» o toca «Unir a mi cuenta» en Perfil. Nunca fusiona sola: la sesión guardada
   en el dispositivo no dice a qué cuenta pertenece.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Fusionar al vincular, sin endpoint propio | Mezcla dos operaciones con riesgos distintos y no sirve para las sesiones ya guardadas por el build 10. |
| Identificar el origen por `userId` | Cualquiera con una sesión podría absorber los datos de otra cuenta anónima. El token prueba la propiedad. |
| Detectar duplicados en SQL | Imposible con `descripcion` cifrada con IV aleatorio. |
| Que gane la configuración del origen | La cuenta existente es la que la persona eligió conservar. |
| Fusión automática al iniciar la app | La sesión guardada podría unirse a la cuenta de otra persona que use el mismo teléfono. |

## Consecuencias

- La fusión es irreversible: no hay forma de separar las cuentas después.
- Para detectar duplicados se cargan y descifran los movimientos de las cuentas unidas
  dentro de la transacción; con muchos movimientos la transacción es larga.
- Los totales guardados de cada ingesta no se recalculan.
- Tras la fusión el destino puede superar los límites del plan gratis; se resolverá cuando
  esos límites se apliquen (ADR-012).
- El consentimiento de cartolas del origen no se traslada: si el destino no lo tenía, la
  app lo pide de nuevo al subir una cartola.

## Referencias

- ADR-004 Persistencia
- ADR-009 Seguridad
- ADR-013 Cuenta anónima y vinculación posterior
