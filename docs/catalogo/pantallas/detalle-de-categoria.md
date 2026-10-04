# Detalle de categoría y patrones

## Propósito

Editar una categoría (nombre, bucket, ícono), eliminarla, y administrar sus patrones de auto-clasificación: crear, editar y eliminar.

## Datos que muestra

No existe un endpoint que devuelva una sola categoría: la pantalla obtiene `GET /api/categorias` y toma la entrada cuyo `id` recibió de la navegación. Si no aparece, la categoría ya no existe.

| Dato | Origen | Formato |
|---|---|---|
| Nombre | `nombre` | Campo de texto editable (1 a 40 caracteres) |
| Bucket | `bucket` | Selector de tres opciones rotuladas: Necesidades, Deseos, Ahorro |
| Ícono | `icono` (`null` si no tiene) | Selector con la lista de abajo; «Sin ícono» equivale a `null` |
| Cantidad de movimientos | `transaccionesCount` (historial completo) | «N movimientos»; se usa en las confirmaciones |
| Patrones | `patrones[]`: `id`, `patron`, `matchType`, `prioridad` | Una fila por patrón: texto y tipo de coincidencia rotulado |

Tipos de coincidencia (`matchType`): `CONTAINS` («Contiene»), `STARTS_WITH` («Empieza con») y `REGEX` («Expresión regular»). La comparación no distingue mayúsculas pero **no ignora tildes**: el texto del patrón se compara con la descripción del movimiento tal como llega.

### Íconos

El campo `icono` solo acepta estos valores (si no, 400 `ICONO_INVALIDO`): `shopping-cart`, `fuel`, `pill`, `heart-pulse`, `bus`, `house`, `zap`, `wifi`, `smartphone`, `graduation-cap`, `shield`, `car`, `paw-print`, `tv`, `bike`, `utensils`, `shirt`, `plane`, `gamepad-2`, `gift`, `dumbbell`, `piggy-bank`, `trending-up`, `credit-card`, `circle-help`. La app asocia cada valor a un símbolo propio (SF Symbols o recurso propio); un `icono` desconocido o `null` se muestra con un símbolo genérico, sin error. El origen de la lista es `domain/value-objects/icono-categoria.ts` del API; no figura como enumeración en `openapi.json`.

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Guardar cambios de la categoría | `PATCH /api/categorias/{id}` | Solo los campos modificados de `{"nombre", "bucket", "icono"}`; un cuerpo vacío no se envía | 200 `CategoriaResponse`: se actualiza la pantalla y se anuncia «Categoría guardada» | 400 `NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `ICONO_INVALIDO`; 404 `CATEGORIA_NO_ENCONTRADA` («Esa categoría ya no existe»); 409 `NOMBRE_DUPLICADO`; 403 `CATEGORIA_INTERNA` («Esta categoría es del sistema y no se puede editar ni eliminar», brecha 2) |
| Eliminar la categoría | `DELETE /api/categorias/{id}` | — | 204: vuelve a [Categorías](categorias.md) y lo anuncia | 404 ya no existe (se vuelve a la lista); 403 `CATEGORIA_INTERNA` |
| Crear un patrón | `POST /api/patrones` | `{"categoriaId": "<id>", "patron": "<1 a 200 caracteres>", "matchType": "CONTAINS"\|"STARTS_WITH"\|"REGEX"}`; `prioridad` es opcional y la v1 no la envía | 201 `PatronResponse`: la fila aparece y se anuncia «Patrón guardado» | 400 `PATRON_INVALIDO`, `MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA` («Esa expresión regular no es válida»), `PRIORIDAD_INVALIDA`; 404 `CATEGORIA_NO_ENCONTRADA`; 409 `PATRON_DUPLICADO` («Ya tienes un patrón con ese texto») |
| Editar un patrón | `PATCH /api/patrones/{id}` | Solo los campos modificados de `{"patron", "matchType", "prioridad"}` | 200 `PatronResponse` | 400 igual que crear, o cuerpo vacío; 404 `PATRON_NO_ENCONTRADO` («Ese patrón ya no existe»); 409 `PATRON_DUPLICADO` |
| Eliminar un patrón | `DELETE /api/patrones/{id}` | — | 204: la fila desaparece y se anuncia «Patrón eliminado» | 404 `PATRON_NO_ENCONTRADO`: se quita de la lista |

Reglas y confirmaciones:

- **Cambiar de bucket** afecta a todos los meses ya clasificados con esa categoría: si `transaccionesCount` es mayor que cero, se pide confirmación antes de guardar («N movimientos pasarán de {bucket actual} a {bucket nuevo} en todos los meses»).
- **Eliminar** pide confirmación con el número de movimientos afectados. El API borra también los patrones de la categoría y reasigna los movimientos a la categoría interna `Desconocido` del mismo bucket (según `EliminarCategoriaUseCase`; la web anterior decía «Sin categoría», que ya no existe como bucket). La confirmación nombra esa consecuencia: «Sus N movimientos pasarán a «Desconocido» de {bucket}».
- **Eliminar un patrón** es inmediato y no cambia categorías ya asignadas; el resultado se anuncia.
- Los patrones se aplican a las **próximas** importaciones y a la vista previa. Los movimientos ya importados no cambian por crear o editar un patrón; reevaluarlos queda para «Después» (ver el [índice](../README.md#después)).
- Un patrón de tipo `REGEX` se valida en el servidor al guardar; la app no valida expresiones regulares por su cuenta.
- La clasificación con patrones la hace el API; la app solo lista los patrones en el orden recibido y no decide cuál gana.
- Los mensajes de error propios de cada `code` los define la app (brecha 7); el campo `message` del servidor solo se usa como respaldo.

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/categorias` | Al abrir la pantalla y al refrescar | 200, 401 |
| PATCH | `/api/categorias/{id}` | Al guardar cambios | 200, 400, 404, 409, 403 (no documentado), 401 |
| DELETE | `/api/categorias/{id}` | Al confirmar la eliminación | 204, 404, 403 (no documentado), 401 |
| POST | `/api/patrones` | Al confirmar un patrón nuevo | 201, 400, 404, 409, 401 |
| PATCH | `/api/patrones/{id}` | Al guardar la edición de un patrón | 200, 400, 404, 409, 401 |
| DELETE | `/api/patrones/{id}` | Al eliminar un patrón | 204, 404, 401 |

## Estados

- **Cargando**: «Cargando…».
- **Vacío de patrones**: «Sin patrones: esta categoría solo se puede asignar manualmente.» con la acción «Agregar patrón».
- **Categoría inexistente** (el `id` no está en el catálogo): «Esa categoría ya no existe» con «Volver a Categorías».
- **Error con reintento**: mensaje y «Reintentar» (repite `GET /api/categorias`).
- **Éxito**: formulario con los valores actuales y la lista de patrones.
- **Guardando**: botón «Guardar» deshabilitado con progreso.
- **Confirmando**: diálogo de cambio de bucket o de eliminación con «Cancelar» y el botón de la acción.
- **Error de escritura**: mensaje junto al control que falló; lo escrito se conserva.
- **Categoría protegida** (403): se muestra el mensaje y los controles de edición y eliminación se deshabilitan hasta salir de la pantalla.

## Navegación

- Entrada: [Categorías](categorias.md) (tocar una categoría).
- Salida: [Categorías](categorias.md), con guardar, eliminar o el botón Volver.

## Notas para iPhone

- La edición se hace en la propia pantalla con un botón «Guardar» en la barra superior; salir con cambios sin guardar pide confirmación.
- Eliminar categoría y eliminar patrón usan alerta o action sheet con botón destructivo rotulado; deslizar para borrar un patrón es un atajo opcional, no el único camino.
- Agregar o editar un patrón se hace en una hoja modal con el teclado sin autocorrección ni mayúscula automática.
- El campo de patrón avisa en una línea que la comparación distingue tildes.
- El selector de tipo de coincidencia muestra las tres opciones con su rótulo, no el valor interno.

## Referencia

- Expo: `apps/mobile/app/categoria/[id].tsx`, `apps/mobile/src/components/configuracion/EditarCategoria.tsx`, `PatronesSection.tsx`, `PatronFila.tsx`, `SelectorIcono.tsx`, `apps/mobile/src/domain/mensajes-catalogo.ts`.
- Web: `apps/web/src/routes/_authenticated/configuracion_.categorias.$categoriaId.tsx`, `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx`, `PatronesSection.tsx`, `PatronFila.tsx`, `ConfirmarImpactoDialog.tsx`, `SelectorIcono.tsx`.
