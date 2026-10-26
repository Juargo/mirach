# Subir una cartola

Importar una cartola (`.xlsx` o `.pdf`) de Banco de Chile, BancoEstado, BCI o Santander en dos pasos: vista previa sin guardar, revisión opcional fila por fila, y confirmación (IMP-19). Nada se guarda hasta confirmar.

## Pantallas

| N° | Pantalla | Figma | Requisitos | Alcance |
|---|---|---|---|---|
| 06 | Agregar transacción (elige subir cartola o registrar a mano) | [`63:87`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=63-87) | IMP-01, MOV-02 | v1.0 |
| 16 | Consentimiento de cartolas | [`114:442`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-442) | PRI-02, PRI-03 | v1.0 |
| 17 | Guía por banco | [`114:476`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-476) | IMP-08 | v1.0 |
| 03 | Subir cartola | [`3:66`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=3-66) | IMP-01, IMP-23, PRI-03 | v1.0 |
| 18 | Procesando cartola | [`114:510`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-510) | IMP-10 | v1.0 |
| 04 | Vista previa | [`3:69`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=3-69) | IMP-04, IMP-20 | v1.0 |
| 24 | Revisión fila por fila | [`114:763`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-763) | IMP-19, IMP-21 | v1.0 |
| 25 | Confirmar traspaso propio | [`114:909`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-909) | CLA-04, regla 4 | v1.0 (#142) |
| 19 | Inicio · cartola lista (segundo plano) | [`198:3594`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=198-3594) | IMP-10 | v1.0 |
| 20 | Error · formato no aceptado | [`114:630`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-630) | IMP-01, IMP-06 | v1.0 |
| 21 | Error · PDF escaneado | [`114:663`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-663) | IMP-06 | v1.0 |
| 22 | Error · la cartola no calza con el banco | [`114:696`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-696) | IMP-14, IMP-15 | v1.0 |
| 23 | Cartola ya cargada | [`114:731`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=114-731) | IMP-05, IMP-20 | v1.0 |
| 37 | Error · estado de cuenta de tarjeta | [`144:1097`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=144-1097) | IMP-02, regla 3 | v1.0 (#115) |
| 12 | Cartola con contraseña | [`90:368`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=90-368) | IMP-11 | v1.0 |
| 12b | Contraseña incorrecta | [`181:3707`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=181-3707) | IMP-11 | v1.0 |
| 32 | Aviso · límite de 2 bancos (plan gratis) | [`138:1022`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=138-1022) | IMP-24 | v1.1 ([planes](planes.md)) |

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| POST | `/api/ingestas/preview` | Al elegir el archivo; con contraseña al reintentar; al repetir la vista previa tras crear una categoría | 200, 400, 401, 409, 500, 503 |
| POST | `/api/ingestas/commit` | Al «Subir tal cual» o «Confirmar» | 201, 400, 401, 409, 500, 503 |
| GET | `/api/categorias` | Al llegar a la vista previa (da nombre a las categorías sugeridas y alimenta la revisión) | 200, 401 |
| POST | `/api/categorias` | Al crear una categoría desde una fila | 201, 400, 409, 401 |
| GET | `/api/periodos` | Al terminar la importación (el Inicio se recarga) | 200, 401 |

## Acciones

Máquina de estados de la subida:

| Estado | Entra por | Sale por |
|---|---|---|
| `inicial` | Abrir la pantalla; «Subir otra cartola»; descartar | Elegir archivo |
| `previsualizando` | Archivo válido elegido, o «Reintentar» con contraseña | `decidiendo`, `protegido`, `error-previa` |
| `protegido` | 400 `PDF_PROTEGIDO` o `PDF_PASSWORD_INCORRECTA` | Enviar contraseña, o cambiar de archivo |
| `error-previa` | Cualquier otro fallo de la vista previa | «Reintentar» o elegir otro archivo |
| `decidiendo` | Vista previa correcta | «Subir tal cual» (a `subiendo`), «Revisar y editar» (a `revisando`), «Descartar» (con confirmación, a `inicial`) |
| `revisando` | «Revisar y editar» | «Confirmar» (a `subiendo`), «Descartar» (con confirmación) |
| `subiendo` | Confirmar la importación | `exito` o `error-importacion` |
| `error-importacion` | Fallo del commit | «Reintentar» (a `subiendo`), volver a revisar |
| `exito` | Commit 201 | «Ver resumen», «Subir otra cartola» |

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Elegir archivo | Ninguno | — | El selector filtra `.xlsx` y `.pdf` como ayuda visual; la validación real la hace el servidor (IMP-23) | — |
| Vista previa | `POST /api/ingestas/preview` | Multipart: `file` (obligatorio) y `password` (solo si ya se pidió, ver [PDF protegido](#pdf-protegido)) | 200: pasa a `decidiendo` y carga el catálogo con `GET /api/categorias` | 400 genérico (archivo, banco no reconocido, estructura, tamaño): pantallas 20–22 con el `message` del servidor; 400 `SIN_MOVIMIENTOS`: «No encontramos movimientos en el archivo»; 400 `PDF_PROTEGIDO`/`PDF_PASSWORD_INCORRECTA`: `protegido`; 409 `CATALOGO_INCOMPLETO`: copia propia (brecha 5); 503 `CATALOGO_NO_DISPONIBLE`: «No se pudo analizar ahora, intenta de nuevo» con reintento |
| Subir tal cual | `POST /api/ingestas/commit` | Multipart: `file`, `edits` = `[]`, `password` si corresponde | 201: `exito` | Ver errores de confirmación abajo |
| Cambiar la categoría de una fila | Ninguno hasta confirmar | Se guarda en memoria como `{rowIndex, categoriaId}` | La fila muestra la categoría elegida | — |
| Crear una categoría desde una fila | `POST /api/categorias` | `{"nombre", "bucket", "icono"?, "patrones"?}`; los patrones son siempre de tipo «contiene» (CLA-14) | 201: la fila queda con esa categoría; se repite la vista previa con el mismo archivo y contraseña para que sus patrones reclasifiquen otras filas, conservando las ediciones manuales, y se informa ««X» se aplicó a N filas más» | 400 `NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `ICONO_INVALIDO`, `PATRON_INVALIDO`; 409 `NOMBRE_DUPLICADO` o `PATRON_DUPLICADO` (en los errores de patrón anidado el cuerpo trae `indice`) |
| Confirmar | `POST /api/ingestas/commit` | Multipart: `file`, `edits` = texto JSON con **solo las filas tocadas** `[{"rowIndex": 3, "categoriaId": "..."}]` (hasta 256 KB), `password` si corresponde | 201 `CommitIngestaResponse` (`totalTransacciones`, `duplicadosOmitidos`): `exito` | En todos los fallos **no se guardó nada** (IMP-18) |
| Descartar | Ninguno | — | Pide confirmación («Se perderá la revisión»); vuelve a `inicial` y borra archivo, ediciones y contraseña de la memoria | — |

Reglas de contrato:

- **Sin identificador de vista previa.** El API no guarda la vista previa: `commit` recibe el archivo otra vez. La app conserva el archivo (y la contraseña, si hizo falta) en memoria mientras dure el flujo y los reenvía en cada llamada.
- Solo se envían ediciones con un `categoriaId` real; la v1 nunca envía `categoriaId: null`. Las filas sin edición se clasifican en el servidor.
- Una fila de ingreso (`abono > 0` y `cargo == 0`) se muestra como «Ingreso» en su propia sección, no es editable y nunca se envía en `edits` (IMP-21).
- Sin coincidencia con ningún patrón, una fila que no es ingreso queda en «Gustos · Desconocido» (CLA-13).
- Las filas con `esDuplicado: true` se muestran marcadas («Ya cargado»), no son editables y el servidor las omite (IMP-20). `duplicadosOmitidos` del commit puede ser mayor que el de la vista previa.
- Las propiedades `estructura` y `muestra` de la vista previa están obsoletas: se usan `resumen` y `filas`.
- Errores de `commit`: 400 por archivo, banco o estructura: `message` del servidor y volver a `inicial`; 400 por `edits` (índice fuera de rango o categoría fuera del catálogo): mensaje genérico, recargar el catálogo y volver a revisar; 409 `CATALOGO_INCOMPLETO`: error permanente de la cuenta, copia propia «No pudimos importar tu cartola por un problema de tu cuenta. El archivo está bien y no se importó nada», sin reintento automático; 500 y 503: «Reintentar».

### PDF protegido

Ambos endpoints aceptan el campo multipart **`password`**, opcional; ausente o vacío significa «sin protección». Flujo reactivo (IMP-11):

1. Se envía el archivo sin `password`. Si es un PDF protegido, el API responde 400 `PDF_PROTEGIDO`.
2. La app pasa a `protegido` (pantalla 12) y muestra un campo de texto oculto con «Reintentar».
3. «Reintentar» repite la vista previa con `password`. Si es incorrecta, 400 `PDF_PASSWORD_INCORRECTA` (pantalla 12b): se vuelve a pedir y el campo conserva el foco.
4. Con la vista previa correcta, la contraseña se conserva solo en memoria y se reenvía en **cada** llamada posterior.
5. La contraseña nunca se guarda en disco, en el almacenamiento seguro ni en registros; se descarta al descartar, al cambiar de archivo, al terminar y al cerrar la sesión. Es una credencial del banco, no de Mirach.

## Estados

- **Cargando**: «Generando vista previa…» y «Subiendo movimientos…» (pantalla 18); los controles se deshabilitan para evitar envíos dobles.
- **Vacío** (`inicial`): formatos `.xlsx` o `.pdf`, bancos soportados y la promesa de PRI-03 (no se piden claves; el archivo se borra después de procesarlo).
- **Error con reintento**: `error-previa`, `protegido`, `error-importacion`; el mensaje permanece visible y recibe el foco del lector de pantalla.
- **Éxito** (`exito`): «N movimientos importados de {banco}», duplicados omitidos si hay, «Ver resumen del mes» y «Subir otra cartola». Si el procesamiento terminó en segundo plano, el Inicio muestra el aviso de la pantalla 19.
- **Catálogo no disponible en la revisión**: «Subir tal cual» sigue disponible; «Revisar y editar» queda deshabilitada con «Reintentar».
- **Reclasificación en curso** tras crear una categoría: «Actualizando la vista previa con la nueva categoría…».
- **Confirmación de descarte**: obligatoria, haya ediciones o no.

## Navegación

- Entrada: «+ Agregar transacción» → 06 → subir cartola; acción del Inicio vacío (11); tercer paso del onboarding. El consentimiento (16) se pide antes de la primera importación (PRI-02).
- Salida: [Inicio](inicio-y-movimientos.md) con «Ver resumen del mes» (sin `periodo`: el API muestra el último mes con movimientos); [Historial de importaciones](importaciones-y-cuenta.md). Salir con una revisión a medias pide confirmación.

## Pendiente en el API

- Brecha 12 (#112): consentimiento versionado para procesar cartolas.
- Brecha 13 (#115): rechazo de estados de cuenta de tarjeta (pantalla 37).
- Brecha 14 (#142): confirmación de traspasos propios (pantalla 25).
- Brecha 20 (#129): coincidencia sin tildes.

## Notas por plataforma

- iPhone: el archivo se elige con `UIDocumentPicker`, también desde Archivos, iCloud Drive o la hoja de compartir. Hay que abrir el recurso con acceso de seguridad y copiarlo a un temporal propio para el reenvío en `commit`, y borrarlo al terminar.
- Android: el archivo se recibe con el selector de documentos del sistema o con «Compartir» desde la app del banco o el correo; mismo manejo de la copia temporal.
- En ambas: si la app pasa a segundo plano durante la subida, la solicitud puede cancelarse: se muestra `error-importacion` con «Reintentar» (un commit que falla no guarda nada, así que reintentar es seguro). No hay borrador de revisión persistente.
