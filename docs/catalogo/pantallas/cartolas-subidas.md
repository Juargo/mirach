# Cartolas subidas

## Propósito

Listar las cartolas importadas y permitir eliminar una. Es la única forma de deshacer una importación equivocada: al eliminar una cartola se eliminan sus movimientos.

## Datos que muestra

Todo viene de `GET /api/ingestas` (`IngestasListResponse`).

| Dato | Origen | Formato |
|---|---|---|
| Banco | `ingestas[].banco` (`null` si una importación fallida nunca resolvió el banco) | Texto; «Banco no identificado» si es `null` |
| Nombre del archivo | `nombreArchivo` | Texto, una línea con truncado al centro |
| Fecha de la importación | `fecha` | Fecha corta |
| Cantidad de movimientos | `totalTransacciones` | Entero |
| Estado | `estado`: `PROCESADA` o `FALLIDA` | Etiqueta de texto («Procesada», «Fallida») más ícono o color |
| Motivo del fallo | `motivoFallo` (solo si `FALLIDA`) | Texto del servidor, sin recortar el sentido |

El orden es el que entrega el API (la más reciente primero; ver brecha 9).

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Eliminar una cartola | `DELETE /api/ingestas/{id}` | — | 204: la fila desaparece, se anuncia «Cartola eliminada» y se recarga la lista; el Resumen y los detalles se recargan al volver a ellos | 404 la cartola ya no existe (o no es del usuario): se quita de la lista y se informa; 401 ver reglas globales; otro fallo: «No se pudo eliminar la cartola. Intenta nuevamente.» y la fila vuelve a estar disponible |
| Ir a subir una cartola | Ninguno | — | Abre [Subir cartola](subir-cartola.md) | — |
| Tirar para refrescar | `GET /api/ingestas` | — | Recarga | Error con reintento |

Confirmación obligatoria antes de eliminar, con la consecuencia explícita:

- `PROCESADA`: «Se eliminarán {N} movimientos de {banco} ({fecha}). Esta acción no se puede deshacer.»
- `FALLIDA`: «Se eliminará esta cartola fallida de {banco} ({fecha}).»

La web anterior permitía deshacer durante unos segundos y eliminar varias a la vez; la v1 elimina de una en una, sin deshacer, porque el borrado es inmediato en el servidor.

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/ingestas` | Al abrir y al refrescar | 200, 401 |
| DELETE | `/api/ingestas/{id}` | Al confirmar la eliminación | 204, 404, 401 |

## Estados

- **Cargando**: «Cargando cartolas…».
- **Vacío**: «No hay cartolas cargadas. Sube una cartola para poder gestionarla aquí.» con la acción «Subir cartola».
- **Error con reintento**: mensaje y «Reintentar».
- **Éxito**: lista de cartolas.
- **Confirmando eliminación**: diálogo con el impacto y los botones «Cancelar» y «Eliminar».
- **Eliminando**: la fila queda deshabilitada con progreso hasta la respuesta.
- **Cartola fallida**: se muestra con su motivo; solo admite eliminar.

## Navegación

- Entrada: acceso «Cartolas subidas» desde [Subir cartola](subir-cartola.md) (incluida su pantalla de éxito). Es una propuesta de este catálogo: no está en la barra de pestañas.
- Salida: [Subir cartola](subir-cartola.md); volver a la pantalla de origen.

## Notas para iPhone

- La eliminación se ofrece con deslizar-para-borrar y también con un botón accesible en la fila (VoiceOver no usa el gesto).
- La confirmación es una hoja de acción (action sheet) o alerta con botón destructivo rojo rotulado «Eliminar».
- Tirar para refrescar recarga la lista.
- Tras eliminar, el foco de VoiceOver pasa al título de la pantalla.

## Referencia

- Expo: no existía una pantalla equivalente.
- Web: `apps/web/src/routes/_authenticated/ingestas.tsx`, `apps/web/src/components/ListaIngestas.tsx`, `EliminarIngestaControl.tsx`, `apps/web/src/api/use-ingestas.ts`, `use-eliminar-ingesta.ts`, `use-seleccion-masiva-ingestas.ts` (la selección masiva queda fuera de la v1).
