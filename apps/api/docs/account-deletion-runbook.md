# Eliminación de cuenta — runbook

`DELETE /api/cuenta` borra la cuenta del usuario autenticado y todos sus datos.
Lo exigen App Store (5.1.1(v)), Google Play y la Ley 21.719 (derecho de supresión,
vigente desde 2026-12-01).

## Contrato

- Requiere `x-api-key` + sesión válida (Bearer en las apps, cookie en la web) **y**
  el body `{ "confirmacion": "ELIMINAR" }` (valor exacto). Decisión del usuario,
  2026-10-04: sesión válida + confirmación explícita, sin exigir sesión reciente ni
  re-autenticación con el proveedor.
- `204` sin cuerpo: cuenta borrada; se limpia la cookie de sesión (inocuo para Bearer).
- `400 CONFIRMACION_INVALIDA`: confirmación ausente, distinta de `ELIMINAR`, de otro
  tipo o con campos extra en el body. No se borra nada.
- `401`: sin sesión (lo responde el middleware). El `userId` sale siempre de la sesión,
  nunca del body.
- Idempotencia: tras un borrado exitoso la sesión deja de existir, así que repetir la
  petición da `401` del middleware. Si el use case llegara a ejecutarse para un usuario
  ya inexistente, el borrado es un no-op exitoso.

## Qué se borra

Una sola transacción, acotada por `userId` (RNF-SEC-006), en este orden (respeta las FKs,
ninguna relación de `User` hace cascade):

`Session` (todos los dispositivos) → `Transaccion` (vía `Account.userId`) → `Ingesta`
→ `PatronClasificacion` → `Categoria` → `Account` → `User`.

`BucketPresupuesto` es catálogo global y no se toca. Si la transacción falla, no se borra nada.

## Revocación de identidad externa

Antes de borrar se llama al port `IRevocadorIdentidadExterna.revocar(userId)`: va
antes porque lo que necesita (p. ej. el refresh token de Apple) vive en las filas que el
borrado destruye. Es best-effort: si falla se loguea un `warn` (solo el nombre del error,
nunca tokens) y el borrado continúa. La implementación por defecto es un no-op; la de
Sign in with Apple llega con T4 (`apps/api/src/infrastructure/identity/`).

## Auditoría

Una línea `info` (`eliminar-cuenta: cuenta eliminada`) solo con `userId`.

## Fuera de alcance

La página web pública para solicitar la eliminación (requisito de Google Play, Data
safety) vive en la landing y se hace después.
