# Perfil

## Propósito

Ver y cambiar el nombre, cerrar la sesión y eliminar la cuenta con todos sus datos. No hay cambio de correo ni de contraseña, ni vinculación de Google (ver «Fuera» en el [índice](../README.md#fuera)).

## Datos que muestra

El API no tiene un endpoint de lectura del perfil: los datos salen de `GET /api/auth/me` (`AuthMeResponse`).

| Dato | Origen | Formato |
|---|---|---|
| Nombre | `nombre` | Campo de texto editable |
| Correo | `email` (puede ser `null` en el contrato) | Texto de solo lectura; se oculta si es `null`. Puede ser una dirección de reenvío privado de Apple |
| Cuenta | `userId` | No se muestra; se usa solo para identificar la sesión |

`googleVinculado` llega en la respuesta pero la v1 no lo usa.

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Guardar nombre | `PATCH /api/perfil` | `{"nombre": "<1 a 80 caracteres>"}`. No se envían `email` ni `passwordActual` | 200 `AuthMeResponse` con la identidad actualizada: se reemplaza la copia local y se anuncia «Perfil guardado» | 400 `NOMBRE_INVALIDO` («El nombre debe tener entre 1 y 80 caracteres»); 401 ver reglas globales; otro: error con reintento. Lo escrito se conserva |
| Cerrar sesión | `POST /api/auth/logout` | — | 204: se borra el token del Keychain y se abre [Inicio de sesión](inicio-de-sesion.md) | El token se borra localmente aunque la llamada falle (red o servidor); no hay error visible |
| Eliminar la cuenta | `DELETE /api/cuenta` | `{"confirmacion": "ELIMINAR"}` | 204: se borra la sesión local y se abre [Inicio de sesión](inicio-de-sesion.md) con un aviso «Tu cuenta y tus datos se eliminaron» | 400 `CONFIRMACION_INVALIDA`: no se borró nada, se vuelve a mostrar el campo (brecha 7: copia propia); 401: la sesión ya no es válida, se lleva al inicio de sesión sin confirmar que se borrara; error de red o 5xx: «No se pudo eliminar la cuenta. Intenta de nuevo» con reintento, y nada se da por borrado |

**Eliminar la cuenta es irreversible** y debe pasar por una confirmación escrita:

1. «Eliminar cuenta» abre una pantalla o alerta que explica la consecuencia: se borran la cuenta, las cartolas, los movimientos, las categorías y los patrones, sin posibilidad de recuperarlos.
2. La persona escribe la palabra `ELIMINAR` (exactamente así, en mayúsculas). El botón «Eliminar definitivamente» se habilita solo cuando el texto coincide; la app envía ese mismo texto en `confirmacion`.
3. Mientras el API responde, los controles se deshabilitan para evitar envíos dobles.
4. En 204 la app borra todo lo local (token, datos en memoria) antes de mostrar el inicio de sesión.

La eliminación de cuenta con Apple exige revocar los tokens de Sign in with Apple; el API todavía no lo hace de verdad (brecha 6).

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/auth/me` | Al abrir la pantalla | 200, 401 |
| PATCH | `/api/perfil` | Al guardar el nombre | 200, 400, 401 |
| POST | `/api/auth/logout` | Al cerrar sesión | 204 |
| DELETE | `/api/cuenta` | Al confirmar la eliminación | 204, 400, 401 |

## Estados

- **Cargando**: progreso hasta tener `GET /api/auth/me`.
- **Vacío**: no aplica; una sesión válida siempre tiene perfil.
- **Error con reintento**: mensaje y «Reintentar» si falla `GET /api/auth/me`.
- **Éxito**: nombre editable, correo y las acciones de sesión.
- **Guardando**: botón «Guardar» deshabilitado con progreso. Sin cambios en el nombre, el botón está deshabilitado.
- **Cerrando sesión**: «Cerrando sesión…» breve y paso al inicio de sesión.
- **Confirmando eliminación**: campo de confirmación, botón deshabilitado hasta escribir `ELIMINAR`.
- **Eliminando cuenta**: progreso sin posibilidad de cancelar una vez enviada la solicitud.
- **Error de eliminación**: mensaje y el campo de confirmación conservado.

## Navegación

- Entrada: pestaña Perfil.
- Salida: [Inicio de sesión](inicio-de-sesion.md) al cerrar sesión o eliminar la cuenta.

## Notas para iPhone

- Eliminar cuenta dentro de la app es obligatorio para publicar en la App Store cuando se permite crearla desde la app; la acción debe ser fácil de encontrar en el perfil.
- La confirmación destructiva usa una pantalla con campo de texto (no solo una alerta de dos botones) por su irreversibilidad; el botón final es rojo y rotulado.
- El campo de confirmación desactiva autocorrección, autocapitalización y sugerencias.
- Cerrar sesión borra el token del Keychain y cualquier dato en memoria, incluida una contraseña de PDF si hubiera una subida abierta.

## Referencia

- Expo: `apps/mobile/app/configuracion.tsx`, `apps/mobile/src/components/configuracion/PerfilPanel.tsx`, `apps/mobile/src/api/perfil.ts`, `apps/mobile/src/domain/guardar-perfil.ts`, `mensajes-perfil.ts`. La eliminación de cuenta no existía en las apps anteriores.
- Web: `apps/web/src/routes/_authenticated/configuracion.index.tsx`, `apps/web/src/components/configuracion/perfil/PerfilPanel.tsx`, `PerfilForm.tsx`. Las secciones de contraseña, correo y Google quedan fuera.
