# Importaciones, privacidad y cuenta

Ver las importaciones y deshacer una equivocada, exportar los datos, cerrar sesión y eliminar la cuenta (IMP-09, IMP-22, PRI-04, AUTH-04, AUTH-05, AUTH-06).

## Pantallas

| N° | Pantalla | Figma | Requisitos | Alcance |
|---|---|---|---|---|
| 45 | Historial de importaciones | [`151:1511`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=151-1511) | IMP-09 | v1.0 |
| 46 | Detalle de importación | [`151:1687`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=151-1687) | IMP-09, IMP-22 | v1.0 |
| 33 | Exportar mis datos | [`142:1096`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=142-1096) | PRI-04 | v1.0 |
| 35 | Eliminar cuenta | [`142:1172`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=142-1172) | AUTH-05 | v1.0 (la variante «con Plus activo» aplica desde la v1.1) |
| 36 | Cuenta eliminada | [`142:1209`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=142-1209) | AUTH-05 | v1.0 |
| 34 | Permiso para leer cartolas | [`142:1140`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=142-1140) | PRI-06 (por verificar) | v1.1 (#156) |

Cerrar sesión y cerrar sesión en todos los dispositivos están en Ajustes (14).

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/ingestas` | Al abrir el historial y al refrescar | 200, 401 |
| DELETE | `/api/ingestas/{id}` | Al confirmar la eliminación de una importación | 204, 404, 401 |
| POST | `/api/auth/logout` | Al cerrar sesión | 204 |
| DELETE | `/api/cuenta` | Al confirmar la eliminación de la cuenta | 204, 400, 401 |

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Ver importaciones | `GET /api/ingestas` | — | Lista con `banco` («Banco no identificado» si es `null`), `nombreArchivo`, `fecha`, `totalTransacciones`, `estado` (`PROCESADA` o `FALLIDA`, con texto y marca) y `motivoFallo` | Error con reintento |
| Eliminar una importación | `DELETE /api/ingestas/{id}` | — | 204: la fila desaparece, se anuncia y se recarga la lista; el Inicio se recarga al volver. Los movimientos manuales no se tocan | 404 ya no existe: se quita de la lista; otro fallo: «No se pudo eliminar la importación» y la fila vuelve a estar disponible |
| Exportar mis datos | Pendiente (brecha 17) | — | — | — |
| Cerrar sesión | `POST /api/auth/logout` | — | 204: se borra el token y se abre la bienvenida | El token se borra localmente aunque la llamada falle; no hay error visible |
| Cerrar sesión en todos los dispositivos | Pendiente (brecha 18) | — | — | — |
| Eliminar la cuenta | `DELETE /api/cuenta` | `{"confirmacion": "ELIMINAR"}` | 204: se borra todo lo local y se muestra la pantalla 36 | 400 `CONFIRMACION_INVALIDA`: no se borró nada (copia propia, brecha 7); 401: se lleva a la bienvenida sin confirmar el borrado; red o 5xx: «No se pudo eliminar la cuenta» con reintento, y nada se da por borrado |

Reglas de contrato:

- Eliminar una importación pide confirmación con la consecuencia: `PROCESADA`, «Se eliminarán {N} movimientos de {banco} ({fecha}). Esta acción no se puede deshacer»; `FALLIDA`, «Se eliminará esta importación fallida». Es la única forma de corregir datos de una cartola (IMP-22).
- Eliminar la cuenta pasa por una confirmación escrita: la persona escribe `ELIMINAR` y el botón final se habilita solo con ese texto, que se envía tal cual. El API revoca el token de Sign in with Apple antes de borrar (ADR-006).
- El orden de la lista es el que entrega el API, la más reciente primero (brecha 9).

## Estados

- **Historial vacío**: «No hay cartolas cargadas» con «Subir cartola».
- **Eliminando**: la fila o el botón quedan deshabilitados con progreso; la eliminación de la cuenta no se puede cancelar una vez enviada.
- **Importación fallida**: se muestra con su motivo y solo admite eliminar.

## Navegación

- Entrada: Ajustes (14).
- Salida: [Subir una cartola](subir-cartola.md) desde el historial vacío; la [bienvenida](primer-uso.md) tras cerrar sesión o eliminar la cuenta.

## Pendiente en el API

- Brecha 17 (#144): exportar los datos en Excel o CSV.
- Brecha 18 (#146): cerrar sesión en todos los dispositivos.

## Notas por plataforma

- Eliminar una importación se ofrece con deslizar y también con un botón accesible en la fila.
- La confirmación de la cuenta desactiva autocorrección, mayúscula automática y sugerencias.
- Las dos tiendas exigen poder eliminar la cuenta desde la app; la acción debe ser fácil de encontrar en Ajustes.
