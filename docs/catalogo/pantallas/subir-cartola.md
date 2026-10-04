# Subir cartola

## Propósito

Importar una cartola bancaria (`.xlsx` o `.pdf`) en tres pasos: vista previa sin guardar, revisión opcional fila por fila y confirmación. Nada se guarda hasta confirmar. Banco de Chile, BancoEstado, BCI y Santander.

## Datos que muestra

| Dato | Origen | Formato |
|---|---|---|
| Archivo elegido | Selector de documentos del sistema | Nombre y tamaño |
| Banco detectado | `POST /api/ingestas/preview` → `banco` | Texto |
| Tipo y número de cuenta | `tipoCuenta`, `numeroCuenta` | Texto; el número tal como llega |
| Resumen de la cartola | `resumen.totalFilas`, `resumen.duplicadosDetectados`, `resumen.nuevas` | Tres enteros: «Total filas», «Duplicados», «Nuevas» |
| Filas de la vista previa | `filas[]`: `rowIndex`, `fecha`, `descripcion`, `cargo`, `abono`, `esDuplicado`, `sugerido` | Fecha corta, texto, dinero (`cargo` es gasto, `abono` es ingreso), marca «Ya cargado» si `esDuplicado` |
| Clasificación sugerida de una fila | `filas[].sugerido` (`bucket`, `categoriaId`) o `null`; el nombre de la categoría se resuelve contra `GET /api/categorias` | «Bucket · Categoría». Sin coincidencia con ningún patrón, la fila queda en «Deseos · Desconocido» |
| Categorías para elegir | `GET /api/categorias` → `categorias[]` | Agrupadas por bucket |
| Resultado de la importación | `POST /api/ingestas/commit` → `totalTransacciones`, `duplicadosOmitidos` | «N movimientos importados» y, si corresponde, «N duplicados omitidos» |

Las propiedades `estructura` y `muestra` de la respuesta de vista previa están obsoletas (US-061): no se usan; el contrato canónico es `resumen` más `filas`.

## Acciones

Máquina de estados de la subida:

| Estado | Entra por | Sale por |
|---|---|---|
| `inicial` | Abrir la pantalla; «Subir otra cartola»; descartar | Elegir archivo |
| `previsualizando` | Archivo válido elegido, o «Reintentar» con contraseña | `decidiendo`, `protegido`, `error-previa` |
| `protegido` | 400 con `code` `PDF_PROTEGIDO` o `PDF_PASSWORD_INCORRECTA` | Enviar contraseña, o cambiar de archivo |
| `error-previa` | Cualquier otro fallo de la vista previa | «Reintentar» o elegir otro archivo |
| `decidiendo` | Vista previa correcta | «Subir tal cual» (a `subiendo`), «Revisar y editar» (a `revisando`), «Descartar» (con confirmación, a `inicial`) |
| `revisando` | «Revisar y editar» | «Confirmar» (a `subiendo`), «Descartar» (con confirmación) |
| `subiendo` | Confirmar importación | `exito` o `error-importacion` |
| `error-importacion` | Fallo del commit | «Reintentar» (a `subiendo`), volver a revisar |
| `exito` | Commit 201 | «Ver resumen», «Subir otra cartola» |

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Elegir archivo | Ninguno | — | Valida extensión `.xlsx` o `.pdf` y tamaño de hasta 10 MB antes de enviar; si pasa, llama a la vista previa | Extensión o tamaño no válidos: mensaje y no se llama al API |
| Vista previa | `POST /api/ingestas/preview` | Multipart: `file` (obligatorio) y `password` (solo si ya se pidió, ver [PDF protegido](#pdf-protegido)) | 200: pasa a `decidiendo` y se carga el catálogo con `GET /api/categorias` | 400 genérico (archivo, banco no reconocido, estructura, tamaño): `message` del servidor; 400 `SIN_MOVIMIENTOS`: «No encontramos movimientos en el archivo»; 400 `PDF_PROTEGIDO`/`PDF_PASSWORD_INCORRECTA`: estado `protegido`; 503 `CATALOGO_NO_DISPONIBLE`: «No se pudo analizar ahora, intenta de nuevo» con reintento |
| Subir tal cual | `POST /api/ingestas/commit` | Multipart: `file`, `edits` = `[]`, `password` si corresponde | 201: `exito` | Ver errores de confirmación abajo |
| Cambiar la categoría de una fila | Ninguno hasta confirmar | La elección se guarda en memoria como `{rowIndex, categoriaId}` | La fila muestra la categoría elegida | — |
| Crear una categoría desde una fila | `POST /api/categorias` | `{"nombre", "bucket", "icono"?, "patrones"?}` | 201: la fila queda con esa categoría; se repite la vista previa con el mismo archivo y contraseña para que sus patrones reclasifiquen otras filas, conservando las ediciones manuales, y se informa ««X» se aplicó a N filas más» (el conteo compara `sugerido` antes y después) | 400 `NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `ICONO_INVALIDO`, `PATRON_INVALIDO`, `MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA`; 409 `NOMBRE_DUPLICADO` o `PATRON_DUPLICADO`; en los errores de patrón anidado el cuerpo trae `indice` |
| Confirmar | `POST /api/ingestas/commit` | Multipart: `file`, `edits` = texto JSON con **solo las filas tocadas**: `[{"rowIndex": 3, "categoriaId": "..."}]` (hasta 256 KB), `password` si corresponde | 201 `CommitIngestaResponse`: `exito` | 400 por `edits` inválido (índice fuera de rango, categoría fuera del catálogo) o por archivo; 409 `CATALOGO_INCOMPLETO`; 500 reintentable; 503 `CATALOGO_NO_DISPONIBLE` reintentable. En todos, **no se guardó nada** |
| Descartar | Ninguno | — | Pide confirmación («Se perderá la revisión»); vuelve a `inicial` y borra archivo, ediciones y contraseña de la memoria | — |

Reglas:

- **Sin identificador de vista previa.** El API no guarda la vista previa: `commit` recibe el archivo otra vez y vuelve a leerlo. La app conserva el archivo (y la contraseña, si hizo falta) en memoria mientras dure el flujo y los reenvía en cada llamada.
- Solo se envían ediciones con un `categoriaId` real elegido; la v1 nunca envía `categoriaId: null` (el contrato lo admite, pero las apps anteriores no lo usaban). Las filas sin edición se clasifican en el servidor.
- Las filas con `esDuplicado: true` se muestran marcadas y no son editables; el servidor las omite al confirmar. `duplicadosOmitidos` del commit puede ser mayor que el de la vista previa (duplicados nuevos detectados en el momento) y no aborta la importación.
- Errores de `commit` y qué hacer: 400 por archivo, banco o estructura (el mismo conjunto que en la vista previa): `message` del servidor y volver a `inicial`; 400 por `edits`: mensaje genérico y volver a revisar (indica un desfase con el catálogo; recargar el catálogo); 409 `CATALOGO_INCOMPLETO`: error permanente de la cuenta (falta la categoría interna `Desconocido` del bucket por defecto), copia propia «No pudimos importar tu cartola por un problema de tu cuenta. El archivo está bien y no se importó nada» sin reintento automático y con el nombre del bucket como «Deseos» (brecha 5); 500 y 503: «Reintentar».
- El resumen de arriba («Revisa las filas y confirma para importar»; «Nada se ha guardado aún») aparece en `decidiendo`. La clasificación manual es opcional: las filas se pueden reclasificar después desde [Detalle de bucket](detalle-de-bucket.md).

### PDF protegido

El API soporta PDF con contraseña. No hay brecha de contrato: ambos endpoints (`POST /api/ingestas/preview` y `POST /api/ingestas/commit`) aceptan el campo de formulario multipart **`password`**, opcional; ausente o vacío significa «sin protección».

Flujo reactivo, igual que el de la web anterior (se pide la contraseña solo cuando hace falta):

1. Se envía el archivo sin `password`. Si es un PDF protegido, el API responde 400 con `code` `PDF_PROTEGIDO` (falta la contraseña).
2. La app pasa a `protegido` y muestra un campo de contraseña (texto oculto) con «Reintentar». El mensaje del servidor nombra el archivo; la app puede usar copia propia: «Este archivo está protegido. Ingresa su contraseña para continuar».
3. «Reintentar» repite `POST /api/ingestas/preview` con el mismo archivo y `password`. Si es incorrecta, el 400 trae `PDF_PASSWORD_INCORRECTA`: «La contraseña es incorrecta», se vuelve a pedir y el campo conserva el foco.
4. Con la vista previa correcta, la contraseña se conserva solo en memoria y se reenvía en **cada** llamada posterior: la repetición de vista previa tras crear una categoría y el `commit` (el servidor vuelve a leer el PDF).
5. La contraseña nunca se guarda en disco, ni en el Keychain, ni en registros; se descarta al descartar, al cambiar de archivo, al terminar y al cerrar la sesión. Es una credencial del banco, no de Mirach.

Ni `PDF_PROTEGIDO` ni `PDF_PASSWORD_INCORRECTA` figuran en `openapi.json` (brecha 1), pero el servidor los emite en las dos rutas.

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| POST | `/api/ingestas/preview` | Al elegir el archivo; con contraseña al reintentar; al repetir la vista previa tras crear una categoría | 200, 400, 401, 503 |
| POST | `/api/ingestas/commit` | Al «Subir tal cual» o «Confirmar» | 201, 400, 401, 409 (no documentado), 500, 503 |
| GET | `/api/categorias` | Al llegar a `decidiendo` (el catálogo da nombre a las categorías sugeridas y alimenta la revisión) | 200, 401 |
| POST | `/api/categorias` | Al crear una categoría desde una fila | 201, 400, 409, 401 |

## Estados

- **Cargando**: «Generando vista previa…» y «Subiendo transacciones…»; los controles se deshabilitan para evitar envíos dobles.
- **Vacío**: `inicial` (nada elegido) con las instrucciones: formatos `.xlsx` o `.pdf`, bancos soportados y límite de 10 MB. Una cartola sin movimientos no es éxito silencioso: el API responde 400 `SIN_MOVIMIENTOS`.
- **Error con reintento**: `error-previa`, `protegido`, `error-importacion`; el mensaje permanece visible hasta el siguiente intento y recibe el foco de VoiceOver.
- **Éxito** (`exito`): «N movimientos importados de {banco}», duplicados omitidos si hay, y dos acciones: «Ver resumen del mes» y «Subir otra cartola». También un acceso a [Cartolas subidas](cartolas-subidas.md).
- **Catálogo no disponible en la revisión** (`GET /api/categorias` falla): «Subir tal cual» sigue disponible; «Revisar y editar» queda deshabilitada con «Reintentar» para cargar el catálogo.
- **Re-clasificación en curso** tras crear categoría: «Actualizando la vista previa con la nueva categoría…».
- **Confirmación de descarte**: obligatoria en todo descarte, haya ediciones o no.

## Navegación

- Entrada: pestaña Subir; acción «Subir cartola» desde estados vacíos del [Resumen](resumen-del-mes.md) y de [Cartolas subidas](cartolas-subidas.md).
- Salida: [Resumen del mes](resumen-del-mes.md) con «Ver resumen del mes» (se navega sin `periodo`, así que el API muestra el último mes con movimientos; las apps anteriores derivaban el mes en el cliente a partir de las fechas de las filas y este catálogo no lo exige); [Cartolas subidas](cartolas-subidas.md).
- Salir de la pantalla con una revisión a medias pide confirmación.

## Notas para iPhone

- El archivo se elige con el selector de documentos del sistema (`UIDocumentPicker`) restringido a `.xlsx` y `.pdf`, también desde iCloud Drive, Archivos o la hoja de compartir (abrir con Mirach). Hay que abrir el recurso con acceso con alcance de seguridad (security-scoped) y leerlo antes de que el sistema lo libere; para el reenvío en `commit`, conviene copiarlo a un archivo temporal propio y borrarlo al terminar.
- Para PDF protegido, el campo de contraseña usa entrada de texto segura y sin autocorrección.
- La revisión por fila usa una hoja modal con las categorías agrupadas por bucket; los grupos de la lista de revisión (por bucket y categoría) son solo presentación de los datos de `filas[]`.
- Si la app pasa a segundo plano durante la subida, la solicitud puede cancelarse: se muestra `error-importacion` con «Reintentar» (según el contrato, un commit que falla no guarda nada, así que reintentar es seguro). No hay borrador de revisión persistente en la v1 (la web guardaba uno en la sesión del navegador).
- El descarte es una acción destructiva: confirmación nativa de dos opciones.

## Referencia

- Expo: `apps/mobile/app/subir.tsx`, `apps/mobile/src/components/subir/` (`ResumenDecision`, `ListaRevision`, `HojaClasificacion`), `apps/mobile/src/api/preview-ingesta.ts`, `commit-ingesta.ts`, `apps/mobile/src/domain/preview-cartola.ts`.
- Web: `apps/web/src/components/SubirCartola.tsx` (máquina de estados, contraseña reactiva, repetición de vista previa), `ResumenCartola.tsx`, `MuestraAgrupada.tsx`, `PreviewMuestra.tsx`, `preview/NuevaCategoriaDesdeFilaForm.tsx`, `apps/web/src/routes/_authenticated/subir.tsx`, `apps/web/src/api/use-preview-ingesta.ts`, `use-commit-ingesta.ts`.
