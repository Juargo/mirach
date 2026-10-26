# Categorías y patrones

Ver y editar el catálogo propio de categorías, agrupado por bloque, y los patrones que clasifican solos los movimientos (CLA-05 a CLA-18). En la v1.0 todas las cuentas tienen Plus gratis (D1), así que crear y editar está disponible para todos.

## Pantallas

| N° | Pantalla | Figma | Requisitos | Alcance |
|---|---|---|---|---|
| 26 | Categorías | [`124:684`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=124-684) | CLA-09, CLA-10, CLA-13 | v1.0 |
| 27 | Detalle de categoría | [`124:888`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=124-888) | CLA-07, CLA-09, CLA-11 | v1.0 |
| 28 | Agregar patrón | [`124:1050`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=124-1050) | CLA-14, CLA-15, CLA-16, CLA-18 | v1.0 |
| 29 | Nueva categoría | [`132:874`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=132-874) | CLA-09, CLA-10, CLA-11 | v1.0 |
| 30 | Patrón ya en otra categoría | [`132:951`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=132-951) | CLA-17 | v1.0 |
| 26b | Categorías · plan gratis | [`129:843`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=129-843) | CLA-09, PLA-01 | v1.1 ([planes](planes.md)) |
| 27b | Detalle de categoría · plan gratis | [`129:955`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=129-955) | CLA-09, PLA-01 | v1.1 ([planes](planes.md)) |

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/categorias` | Al abrir la lista o un detalle, al refrescar y al volver de un detalle | 200, 401 |
| POST | `/api/categorias` | Al crear una categoría | 201, 400, 409, 401 |
| PATCH | `/api/categorias/{id}` | Al guardar cambios de una categoría | 200, 400, 403, 404, 409, 401 |
| DELETE | `/api/categorias/{id}` | Al confirmar la eliminación | 204, 403, 404, 401 |
| POST | `/api/patrones` | Al confirmar un patrón nuevo | 201, 400, 404, 409, 401 |
| PATCH | `/api/patrones/{id}` | Al guardar la edición de un patrón | 200, 400, 404, 409, 401 |
| DELETE | `/api/patrones/{id}` | Al confirmar la eliminación de un patrón | 204, 404, 401 |

No hay endpoint de una sola categoría: el detalle toma de `GET /api/categorias` la entrada con el `id` recibido. Si no aparece, la categoría ya no existe.

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Crear una categoría | `POST /api/categorias` | `{"nombre": "<1 a 40 caracteres>", "bucket": "Necesidades"\|"Deseos"\|"Ahorro", "icono": "<de la lista>"\|null}` | 201 `CategoriaResponse`: aparece en su grupo y se anuncia | 400 `NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `ICONO_INVALIDO`; 409 `NOMBRE_DUPLICADO` (el nombre se repite en el mismo bloque, CLA-10); el formulario conserva lo escrito |
| Guardar cambios | `PATCH /api/categorias/{id}` | Solo los campos modificados de `{"nombre", "bucket", "icono"}`; un cuerpo vacío no se envía | 200 `CategoriaResponse` | 400 igual que crear; 404 `CATEGORIA_NO_ENCONTRADA`; 409 `NOMBRE_DUPLICADO`; 403 `CATEGORIA_INTERNA` |
| Eliminar una categoría | `DELETE /api/categorias/{id}` | — | 204: vuelve a la lista | 404 (se vuelve a la lista); 403 `CATEGORIA_INTERNA` |
| Crear un patrón | `POST /api/patrones` | `{"categoriaId", "patron": "<1 a 200 caracteres>", "matchType": "CONTAINS"}`; nunca otro tipo ni `prioridad` (CLA-12, CLA-14) | 201 `PatronResponse` | 400 `PATRON_INVALIDO`; 404 `CATEGORIA_NO_ENCONTRADA`; 409 `PATRON_DUPLICADO` (pantalla 30, CLA-17) |
| Editar un patrón | `PATCH /api/patrones/{id}` | `{"patron"}` | 200 `PatronResponse` | 400 igual que crear; 404 `PATRON_NO_ENCONTRADO`; 409 `PATRON_DUPLICADO` |
| Eliminar un patrón | `DELETE /api/patrones/{id}` | — | 204: la fila desaparece | 404 `PATRON_NO_ENCONTRADO`: se quita de la lista |

Reglas de contrato:

- **Cambiar de bloque** una categoría afecta todos los meses ya clasificados: siempre se pide confirmación antes de guardar, con el número de movimientos (`transaccionesCount`) cuando hay.
- **Eliminar una categoría**: el API borra sus patrones y pasa sus movimientos a «Desconocido» del mismo bloque; la confirmación nombra esa consecuencia con el número de movimientos.
- **Eliminar un patrón** pide confirmación; no cambia categorías ya asignadas.
- Las categorías con `esInterna: true` (las tres «Desconocido») se muestran como del sistema, sin editar ni eliminar, y no aceptan patrones (CLA-13, CLA-18). El 403 sigue cubierto.
- La clasificación con patrones la hace el API; la app lista los patrones en el orden recibido y no decide cuál gana (CLA-12).
- Los mensajes de cada `code` los define la app; el `message` del servidor es respaldo (brecha 7).

### Íconos

El campo `icono` acepta solo la allowlist de `apps/api/src/domain/value-objects/icono-categoria.ts` (cualquier otro valor responde 400 `ICONO_INVALIDO`): `shopping-cart`, `fuel`, `pill`, `heart-pulse`, `bus`, `house`, `zap`, `wifi`, `smartphone`, `graduation-cap`, `shield`, `car`, `paw-print`, `tv`, `bike`, `utensils`, `shirt`, `plane`, `gamepad-2`, `gift`, `dumbbell`, `piggy-bank`, `trending-up`, `credit-card`, `circle-help`. Un `icono` desconocido o `null` se muestra con un símbolo genérico, sin error. Esta lista no coincide con el set de 24 íconos de CLA-11 (brecha 23).

## Estados

- **Grupo sin categorías**: los tres bloques aparecen siempre, con «Sin categorías» si están vacíos.
- **Vacío de patrones**: «Sin patrones: esta categoría solo se asigna a mano» con «Agregar patrón».
- **Categoría inexistente**: «Esa categoría ya no existe» con «Volver a Categorías».
- **Guardando**: botón deshabilitado con progreso; salir con cambios sin guardar pide confirmación.
- **Confirmando**: cambio de bloque, eliminación de categoría o de patrón.
- **Error de escritura**: mensaje junto al control que falló; lo escrito se conserva.

## Navegación

- Entrada: Ajustes (14) → Categorías.
- Salida: detalle de categoría (27) → agregar patrón (28); nueva categoría (29); volver a Ajustes.

## Pendiente en el API

- Brecha 16 (#140): vista previa de un patrón (CLA-15) sin mover lo cambiado a mano (CLA-16).
- Brecha 20 (#129, #130): coincidencia sin tildes y desempate por largo; la app deja de ofrecer los otros tipos.
- Brecha 23 (#159): allowlist de íconos distinta del set de CLA-11.

## Notas por plataforma

- Elegir el bloque es obligatorio y explícito: selector de tres opciones rotuladas, no solo color.
- Agregar o editar un patrón se hace en una hoja modal con el teclado sin autocorrección ni mayúscula automática.
- Eliminar usa una confirmación nativa con botón destructivo rotulado; deslizar para borrar es un atajo, no el único camino.
