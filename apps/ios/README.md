# Mirach para iPhone

App nativa (Swift + SwiftUI, iOS 17+) de Mirach. Es un cliente delgado de la API (ADR-046 D9). El estado actual: inicio de sesión con Apple, sesión guardada en el Keychain y y el Resumen del mes (solo lectura): mes, estado global, ingreso, gráfico de distribución del gasto y una fila por bucket, con selector de mes, y una barra de pestañas (Resumen, Subir, Categorías y Perfil) con «Subir cartola» (T5a: elegir archivo, vista previa, contraseña de PDF y «Subir tal cual»; T5b: «Revisar y editar» con el catálogo de categorías y la reclasificación por fila).

## Qué es XcodeGen y por qué lo usamos

Un proyecto de Xcode (`.xcodeproj`) es un archivo enorme y difícil de revisar en un PR. [XcodeGen](https://github.com/yonaskolb/XcodeGen) lo genera a partir de `project.yml`, que es corto y legible. El `.xcodeproj` está en `.gitignore`: **nunca se edita ni se commitea**; si necesitas cambiar un ajuste del proyecto, edita `project.yml` y regenera. Detalle de la decisión en [ADR-048](../../docs/adr/ADR-048-base-app-iphone.md).

## Requisitos

- Xcode (desde la App Store) con el simulador de iOS instalado.
- XcodeGen: `brew install xcodegen`.

## Generar y abrir el proyecto

```bash
cd apps/ios
./scripts/generate.sh      # equivale a `xcodegen generate`
open Mirach.xcodeproj
```

Vuelve a generar cada vez que cambie `project.yml` o agregues/borres archivos fuente.

## Ejecutar en el simulador

1. En Xcode, arriba elige el esquema `Mirach` y un destino, por ejemplo `iPhone 18 Pro`.
2. Pulsa Cmd+R (Run).

La primera consulta puede tardar hasta ~1 minuto: la API gratuita de Render "duerme" tras un rato sin uso. La app espera hasta 90 s y ofrece un botón "Reintentar".

## Ejecutar en un iPhone físico

1. Conecta el iPhone por cable y desbloquéalo; acepta "Confiar en este ordenador".
2. En el iPhone activa el modo desarrollador: Ajustes > Privacidad y seguridad > Modo de desarrollador (pide reiniciar).
3. En Xcode, selecciona tu iPhone como destino. La firma es automática con el equipo `SUX4J95Z5F` (ya configurado en `project.yml`); inicia sesión con tu Apple ID en Xcode > Settings > Accounts si hace falta.
4. Cmd+R. La primera vez iOS bloqueará la app: en el iPhone ve a Ajustes > General > VPN y gestión de dispositivos, elige tu perfil de desarrollador y pulsa "Confiar".

## Cliente de la API generado

El cliente se genera desde `apps/api/openapi.json` con [swift-openapi-generator](https://github.com/apple/swift-openapi-generator) de Apple y **se commitea** en `Mirach/Core/API/Generated/` (no usamos el plugin de build: así el diff de un cambio de contrato se ve en el PR y la compilación no depende de correr un plugin).

```bash
cd apps/ios
./scripts/generate-api.sh
```

- **Cuándo regenerar:** cada vez que cambie `apps/api/openapi.json` (el CI falla si el cliente commiteado quedó desactualizado).
- **Determinismo:** la versión del generador está fijada en `scripts/openapi-generator/Package.swift` (1.13.1) y la configuración en `scripts/openapi-generator-config.yaml` (tipos y cliente, acceso `internal`). La primera ejecución compila el generador (unos minutos); las siguientes son rápidas. El runtime (`swift-openapi-runtime` 1.12.2) y el transporte (`swift-openapi-urlsession` 1.3.2) se fijan en `project.yml`.
- **Las pantallas no usan los tipos generados:** dependen del protocolo `MirachAPI` (`Mirach/Core/API/MirachAPI.swift`), cuya implementación `OpenAPIMirachAPI` envuelve el cliente generado, traduce sus errores y expone solo lo que las pantallas necesitan. Para sumar un endpoint: agrega el método al protocolo y a la implementación, con su prueba.
- **Forma de OpenAPI que necesita el generador:** `apps/api/openapi.json` se emite como OpenAPI **3.0.3**, no 3.1. El generador (1.13.1) no soporta las propiedades anulables escritas en 3.1 como `anyOf: [T, {type: "null"}]`: avisa `Schema "null" is not supported` y las omite del tipo generado (27 propiedades, p. ej. `estadoGlobal`, `estadoSemaforo`, `porcentajeBp`). En 3.0 zod-openapi las escribe como `nullable: true`, que sí soporta. Además exige `required: true` en los cuerpos `multipart/form-data` (`/api/ingestas*`); el contrato ya lo declara. Si la API vuelve a 3.1, `GeneratedNullableFieldsTests` falla al compilar o decodificar. Un aviso nuevo del generador (`warning:` en la salida de `generate-api.sh`) significa que se está omitiendo algo del contrato: no lo ignores.

## Tokens de diseño

Colores, textos de bucket y semáforo, familias tipográficas y radios salen de `design/tokens.json` (fuente única, ver `design/README.md`). El script `scripts/generate-ios-tokens.mjs` (Node, sin dependencias) los convierte, de forma determinista, en dos cosas que **se commitean**:

- `Mirach/Resources/Tokens.xcassets`: un color set por token, en una carpeta por grupo (`Base`, `Bucket`, `Pie`, `Ingreso`, `Semaforo`, `Feedback`) con espacio de nombres (`Bucket/deseos`). El valor claro es la apariencia "Any" y el oscuro la apariencia `luminosity: dark`, en sRGB.
- `Mirach/Core/Design/GeneratedTokens.swift`: accesores tipados. `Color.Mirach.<Grupo>.<token>` (por ejemplo `Color.Mirach.Bucket.deseos`), `MirachCopy.Bucket.deseos` (textos), `MirachFont` (familias), `MirachRadius` (radios) y el modificador `.mirachFigures()` (cifras con dígitos tabulares).

```bash
cd apps/ios
./scripts/generate-tokens.sh
```

- **Cuándo regenerar:** cada vez que cambie `design/tokens.json`. El CI falla si lo commiteado quedó desactualizado. Nunca edites los archivos generados a mano.
- **Claro y oscuro:** los colores se adaptan solos a la apariencia del sistema; ninguna vista decide un color según el tema.
- **Reglas que los tokens no expresan:** el color nunca va solo (siempre con etiqueta o glifo) y los rellenos de bucket no se usan como color de texto.

```swift
Text(MirachCopy.Bucket.deseos)
    .foregroundStyle(Color.Mirach.Base.foreground)
Text(total).mirachFigures()
```

## Clave de la API y sesión

Toda llamada a `/api` necesita el header `x-api-key` (clave pública del cliente, ADR-047) y, después de iniciar sesión, `Authorization: Bearer <sesión>`. Lo agrega `APIAuthMiddleware` (`Mirach/Core/API/`), que **nunca** toca rutas fuera de `/api` (como `/version`) y no envía un header vacío.

La clave **no está en el repo**. Para configurarla:

```bash
cd apps/ios
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # está en .gitignore
# edita Config/Secrets.xcconfig y pon el valor real en MIRACH_API_KEY
./scripts/generate.sh
```

`Config/Base.xcconfig` define `MIRACH_API_KEY` vacía e incluye `Secrets.xcconfig` si existe; `project.yml` la publica en `Info.plist` y `AppConfiguration.apiKey` la lee. Sin el archivo la app compila igual (la clave queda vacía), pero **no arranca normal**: al iniciar, `ConfigurationCheck` detecta la clave vacía y

- en Debug registra el error y lanza `assertionFailure` (la app se detiene en el simulador para que no pase inadvertido; las pruebas unitarias lo omiten);
- en Release muestra la pantalla «La app no está configurada correctamente» en lugar de un bucle de inicio de sesión.

Si el servidor rechaza la clave (401 `API_KEY_INVALIDA`) se muestra la misma pantalla y la sesión guardada se conserva.

## Inicio de sesión y sesión

- **Qué espera el servidor** (`POST /api/auth/apple/token`): `identityToken` (el JWT de Apple, con audiencia `app.mirachbudget.ios`), `nonce` y, solo la primera vez que ese Apple ID autoriza la app, `nombre`. El `nonce` es obligatorio: la app genera un valor aleatorio crudo por intento, le da a Apple su SHA-256 en hexadecimal (`request.nonce`) y envía al API el valor crudo; el servidor lo vuelve a hashear y lo compara con el claim del token (`AppleNonce`, `SignInViewModel`).
- **Código de autorización:** la app lee `ASAuthorizationAppleIDCredential.authorizationCode` (Data a UTF-8; si falta o no decodifica se omite) y lo envía como `authorizationCode` junto al token y el nonce. Es de un solo uso y vale 5 minutos: el servidor lo canjea por un refresh token (guardado cifrado) para revocarlo al eliminar la cuenta; el inicio de sesión funciona igual sin él. Nunca se registra en logs. Esta rama debe mergearse DESPUÉS del PR del API `feat/api-apple-revocation`, cuyo `openapi.json` trae el campo (el chequeo de CI regenera el cliente desde ahí).
- **Sesión:** la respuesta (`token`, `userId`, `expiresAt`) se guarda en el Keychain (`KeychainSessionStore`: servicio `app.mirachbudget.ios.session`, accesible tras el primer desbloqueo y solo en este dispositivo) detrás del protocolo `SessionStore`; las pruebas usan `InMemorySessionStore`. `SessionController` (`@Observable`) guarda la fase (`validating`, `signedOut`, `signedIn`, `connectionFailed`, `misconfigured`) y `RootView` solo dibuja esa fase.
- **Arranque:** sin token va al inicio de sesión; con token valida con `GET /api/auth/me`: 200 entra, 401 descarta la sesión y va al inicio de sesión, y un fallo de red muestra «Reintentar» **sin borrar la sesión**.
- **401 en cualquier llamada autenticada:** `OpenAPIMirachAPI` lo detecta en un solo lugar; si el código es `SESION_INVALIDA` avisa al `SessionController` (por `SessionExpiryRelay`), que borra la sesión y vuelve al inicio de sesión, sin reintento. Un `API_KEY_INVALIDA` no cuenta como sesión vencida.
- **Cerrar sesión** (pestaña Perfil, `SessionController.signOutRemotely`): primero llama a `POST /api/auth/logout` (el token todavía viaja en esa petición) y después borra el token local. La llamada es de mejor esfuerzo: si falla (sin red, 5xx) o no responde en 5 s (el servidor gratuito tarda hasta ~50 s en despertar), la persona queda igualmente sin sesión y no ve ningún error; el token podría seguir vigente en el servidor hasta que venza.
- **Eliminar cuenta** (Perfil, pantalla propia con campo de texto): el botón «Eliminar definitivamente» solo se habilita con el texto exacto `ELIMINAR` y esa misma cadena viaja en `DELETE /api/cuenta` (`{"confirmacion":"ELIMINAR"}`). En 204 se borra la sesión del Keychain y, por el gancho `SessionController.onSessionEnded`, la copia de la cartola en preparación y su contraseña; se vuelve al inicio de sesión con el aviso «Tu cuenta y tus datos se eliminaron». Un 400 `CONFIRMACION_INVALIDA` o un fallo de red/5xx dejan la cuenta y la sesión intactas y ofrecen reintentar; un 401 pasa por el relé único y no afirma que se borrara nada, salvo en el reintento de un intento que terminó sin respuesta (timeout o 5xx): ahí el 401 prueba que el servidor sí borró (la sesión ya no existe) y se muestra el aviso de cuenta eliminada.
- **Pendiente antes de publicar en la App Store:** la revocación de los tokens de Sign in with Apple al eliminar la cuenta sigue siendo un no-op en el servidor (`NoopRevocadorIdentidadExterna`; fase 5 T4 del plan, brecha 6 del catálogo). Apple la exige junto con la eliminación en la app (guía 5.1.1(v)), así que sin ella la función no debe enviarse a revisión.
- La app es solo en español (`CFBundleLocalizations: es`), así el botón de Apple dice «Continuar con Apple». El botón del sistema cambia de estilo (negro/blanco) al lanzar la app, no en vivo si cambias la apariencia con la app abierta.

### Probar el inicio de sesión

- **Simulador:** Sign in with Apple necesita un Apple ID con sesión iniciada en el simulador (Ajustes > Iniciar sesión en el iPhone). Hace falta además `Secrets.xcconfig` con la clave real. Cancelar la hoja no muestra error.
- **iPhone físico:** firma automática con el equipo `SUX4J95Z5F`; funciona con tu Apple ID del dispositivo. Para repetir la primera autorización (con nombre) revoca la app en Ajustes > tu nombre > Contraseña y seguridad > Inicia sesión con Apple.
- **Sin red ni Apple ID:** las pruebas de interfaz usan los argumentos `-uiTestStubbedClient`, `-uiTestSavedSession` (arranca con sesión guardada) y `-uiTestMissingAPIKey` (simula la clave vacía).

### Subir cartola (T5a)

- **Archivo:** el selector del sistema (`.fileImporter`) limitado a `.xlsx` y `.pdf`. Antes de llamar al API se valida la extensión y los 10 MB; si pasa, se copia a una carpeta temporal propia (`tmp/cartolas/<uuid>/`) con acceso *security-scoped*, porque `commit` necesita el archivo otra vez. La copia se borra al terminar la importación, al descartar, al cambiar de archivo, al cerrar sesión y al arrancar la app (restos de una ejecución interrumpida).
- **Contraseña de PDF:** solo en memoria (propiedad privada del view model, fuera de `state`), nunca en disco ni en registros; se reenvía en la vista previa y en `commit` y se descarta al descartar, cambiar de archivo, terminar o cerrar sesión.
- **Errores:** el adaptador traduce los códigos del contrato (`PDF_PROTEGIDO`, `PDF_PASSWORD_INCORRECTA`, `SIN_MOVIMIENTOS`, 409 `CATALOGO_INCOMPLETO`, 503 `CATALOGO_NO_DISPONIBLE`, 500, 400 genérico con su `message`) a `IngestaError`. Un 400 cuyo cuerpo el cliente generado no puede decodificar (un `code` desconocido) conserva su `message`.
- **Pruebas de interfaz:** XCUITest no maneja el selector del sistema. Solo en Debug, `-uiTestFixturePath <archivo>` muestra un botón «Usar archivo de prueba» que elige ese archivo; los fixtures están en `MirachUITests/Fixtures/` (copias de `apps/api/test/fixtures/`). Con el cliente de prueba, un archivo cuyo nombre contiene «protegida» pide la contraseña `correcta`.

### Revisar y editar (T5b)

- **Catálogo:** `GET /api/categorias` se carga al llegar a la decisión. Si falla, «Subir tal cual» sigue disponible y «Revisar y editar» queda deshabilitada con «Reintentar».
- **Lista:** todas las filas, agrupadas por bucket y categoría (Necesidades, Deseos, Ahorro), con las ya cargadas aparte al final («Ya cargados», no editables). Cada fila muestra su clasificación «Bucket · Categoría» (la sugerida; sin sugerencia, «Deseos · Desconocido»). La lista es perezosa (`LazyVStack` con cabeceras fijas), pensada para cientos de filas.
- **Edición:** tocar una fila abre una hoja modal con las categorías agrupadas por bucket. La elección se guarda en memoria como `{rowIndex, categoriaId}`; solo viajan las filas tocadas y nunca un `categoriaId` nulo. Elegir de nuevo la categoría que el servidor ya sugería deshace la edición (la fila vuelve a clasificarla el servidor). El texto de `edits` se limita a 256 KB: una edición que lo superaría se rechaza con un aviso.
- **Errores:** un 400 en un `commit` con ediciones vuelve a la revisión con un mensaje genérico, recarga el catálogo y descarta las ediciones cuyas categorías ya no existen (el contrato no distingue un 400 por `edits` de uno por archivo; el archivo ya había pasado la vista previa). Otros errores conservan las ediciones y «Reintentar» las reenvía; «Volver a revisar» regresa a la lista.
- **Salir de la pantalla:** cambiar de pestaña conserva la revisión en memoria (el view model vive en `AppEnvironment`), así que no se pierde nada y no se pide confirmación; solo «Descartar» (con confirmación) y cerrar sesión la borran.
- **Cliente de prueba:** con `-uiTestStubbedClient`, el commit con ediciones responde `totalTransacciones` = número de ediciones recibidas y rechaza (400) una fila duplicada o una categoría fuera del catálogo, para que XCUITest verifique lo que llegó.

### Crear categoría desde una fila (T5c)

- **Entrada:** la hoja de categorías de una fila editable tiene «Crear categoría», que abre el formulario dentro de la misma hoja: nombre, grupo (Necesidades, Deseos o Ahorro, una fila rotulada cada uno con marca de selección, no solo color) y un patrón opcional que viene con la descripción de la fila (hasta 200 caracteres) y se puede editar o vaciar.
- **Petición:** `POST /api/categorias` con `{nombre, bucket, patrones: [{patron, matchType: "CONTAINS"}]}`; sin patrón, sin `patrones`. Nunca se envía `icono`.
- **Al crear:** la fila queda con la categoría nueva (una edición más), se refresca el catálogo y se repite la vista previa con el mismo archivo y contraseña («Actualizando la vista previa con la nueva categoría…»). Las ediciones manuales se conservan. El aviso es ««X» se aplicó a N filas más»; N cuenta las filas cuya sugerencia ahora es la categoría nueva, **sin** la fila de origen, las filas con edición manual ni los duplicados (sin cambios: «Categoría «X» creada.»). Si la vista previa repetida falla, la revisión sigue con las filas anteriores, la categoría nueva y las ediciones, con un aviso y «Reintentar».
- **Errores:** cada `code` (`NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `ICONO_INVALIDO`, `PATRON_INVALIDO`, `MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA`, `NOMBRE_DUPLICADO`, `PATRON_DUPLICADO`; `indice` en los anidados) aparece junto a su campo; un código desconocido muestra el `message` del servidor; 401 va por el relé único.
- **Aplazado:** selector de ícono (la lista de 25 valores no está en el contrato y habría que asociar cada uno a un símbolo) y tipos de coincidencia distintos de «contiene» (empieza con, expresión regular).

### Detalle de bucket (T7)

- **Entrada:** cada fila de bucket del Resumen es un `NavigationLink` (`BucketRoute`: bucket y mes que se ven). Volver conserva el mes del Resumen; la tarea de carga del Resumen ya no se repite al volver (solo con un token nuevo, p. ej. tras importar).
- **Datos:** `GET /api/buckets/{bucket}/detalle?periodo=AAAA-MM` (`BucketDetalleMapper`; dinero por `Money.pesos`, nunca `Double`; una fila mal formada falla en vez de mostrar una cifra). Cabecera (total, % del ingreso o «—», «Meta: N%» solo si existe, cantidades), un grupo por categoría con ícono, subtotal y conteo, y sus movimientos (descripción, fecha corta en UTC, banco o «Manual», monto). El orden es el que manda el API: subtotal descendente, empates por nombre y «Sin categoría» al final.
- **Íconos:** `CategoryIcon` asocia los 25 valores de la lista permitida (ADR-045) a SF Symbols; `null` o un valor desconocido usa la etiqueta genérica, sin error. Una prueba verifica que cada símbolo existe en el sistema.
- **Reclasificar:** tocar un movimiento abre la hoja de categorías (`CategorySheet`, la misma de «Revisar y editar») con el catálogo de `GET /api/categorias` (se carga la primera vez; con «Reintentar» si falla). Elegir una categoría envía `PATCH /api/transacciones/{id}/categoria` con `{"categoriaId": ...}`, siempre el id y nunca el nombre (ADR-042). Si la categoría es de otro bucket, antes se pide confirmación («Este movimiento pasará de Deseos a Necesidades y cambiará el cálculo del mes.»; Cancelar revierte la elección). Elegir la categoría que ya tiene solo cierra la hoja.
- **Después:** se cierra la hoja, se muestra y se anuncia a VoiceOver «Movida a {bucket} · {categoría}» con lo que respondió el servidor, se repite el detalle y el Resumen repite su consulta para el mes que muestra. Errores: 400 deja el movimiento, avisa en la hoja y recarga el catálogo; 404 cierra la hoja, avisa y recarga el detalle; sin red avisa en la hoja; 401 va por el relé único sin mensaje.
- **Crear categoría:** «Crear categoría» en la hoja abre el mismo formulario de T5c sin el campo de patrón (los patrones se agregan después desde la categoría); la categoría creada queda elegida y sigue el camino normal (con confirmación si es de otro bucket).
- **Aplazado:** tocar la porción del gráfico del Resumen y el atajo de deslizar sobre una fila (la acción existe como botón accesible). El encabezado de grupo ya abre «Detalle de categoría» (T10). El semáforo no se muestra (decisión de producto, 2026-10-05).

### Categorías y Detalle de categoría (T10)

- **Pestaña Categorías:** `GET /api/categorias` agrupado en los tres buckets (siempre los tres; «Sin categorías» si uno está vacío), con ícono (SF Symbol o la etiqueta genérica), nombre, «N movimientos · N patrones» y, si el API la marca `esInterna`, «Categoría del sistema» para VoiceOver. El orden es el del API (por nombre); una categoría creada se coloca con la misma regla. Tirar para refrescar; si falla, la lista se queda y avisa.
- **Crear:** «Nueva categoría» abre el formulario de T5c (nombre, grupo, ícono opcional) sin patrón. `POST /api/categorias` con `icono` solo si se eligió. Cada `code` (`NOMBRE_INVALIDO`, `NOMBRE_DUPLICADO`, `BUCKET_NO_ASIGNABLE`, `ICONO_INVALIDO`) cae en su campo y el formulario no se cierra. Las categorías son únicas por `(usuario, bucket, nombre)` (ADR-042): el mismo nombre en otro bucket es válido.
- **Selector de ícono:** `CategoryIcon.options` guarda los 25 valores en el orden del catálogo, con su símbolo y su nombre hablado. La lista permitida **no está en `openapi.json`** (el catálogo la copia de `icono-categoria.ts`); si el API la cambia, hay que actualizar esa tabla. Un ícono ya puesto se puede reemplazar pero **no quitar**: el cliente generado no puede enviar `"icono": null` en el `PATCH` (la propiedad nullable opcional se omite al codificar).
- **Detalle de categoría** (desde la lista y desde el encabezado de grupo del detalle de bucket; la ruta lleva el `id`, nunca el nombre): el API no tiene un `GET` por categoría, así que lee el catálogo y toma la entrada por `id` («Esa categoría ya no existe» si falta). Edición en la misma pantalla con «Guardar» en la barra: el `PATCH` lleva solo los campos que cambiaron y no se envía un cuerpo vacío. Cambiar de bucket pide confirmación con los movimientos afectados, **también con cero** (ADR-038: el caso cero suaviza la frase, no salta la confirmación; el catálogo dice que con cero no se pide). Eliminar pide confirmación que nombra la consecuencia («Sus N movimientos pasarán a «Desconocido» de {bucket}. También se eliminarán sus M patrones.»). Salir con cambios sin guardar pregunta (el botón de retroceso del sistema se reemplaza mientras hay cambios). Una categoría `esInterna`, o una que responde 403 `CATEGORIA_INTERNA`, muestra el aviso y deshabilita edición y eliminación.
- **Patrones:** lista con el tipo rotulado (Contiene, Empieza con, Expresión regular), «Agregar patrón» y editar en una hoja (sin autocorrección ni mayúscula automática, aviso de que distingue tildes). `POST /api/patrones` lleva `categoriaId`, texto y tipo (sin prioridad); el `PATCH`, solo lo que cambió. `PATRON_INVALIDO`, `REGEX_INVALIDA`, `PATRON_DUPLICADO` y `MATCH_TYPE_INVALIDO` salen bajo el campo y la hoja no se cierra. Eliminar un patrón pide confirmación (el catálogo dice «inmediato» en la pantalla y «confirmación explícita» en las reglas globales; se aplicó la segunda). Un botón visible en cada fila, además de la acción para VoiceOver.
- **Después de una escritura:** el cambio sube a `SignedInView`, que sube un contador (`catalogRevision`): la lista de Categorías se vuelve a leer (con aviso «El cambio se aplicó, pero…» si falla), el Resumen repite su consulta sin cambiar de mes, el detalle de bucket abierto relee sus grupos y su catálogo de la hoja, y la revisión de una cartola en curso relee el catálogo y descarta las ediciones cuya categoría ya no existe.
- **Aplazado:** quitar un ícono (límite del cliente generado, arriba) y la prioridad de los patrones (el catálogo no la envía en la v1).

## Pruebas

Desde Xcode: Cmd+U (corre unitarias y de interfaz).

Desde la terminal:

```bash
xcodebuild -project Mirach.xcodeproj -scheme Mirach \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test
```

- `MirachTests`: pruebas unitarias con Swift Testing (`@Test`, `#expect`) de los view models y del `SessionController` (con un `MirachAPI` y un `SessionStore` falsos), del adaptador (con un transporte falso que alimenta el cliente generado real) y de una ida y vuelta real contra el Keychain del simulador.
- `MirachUITests`: pruebas de interfaz con XCUITest. Lanzan la app con `-uiTestStubbedClient` (API con respuesta fija, sin red) y cubren: sin sesión aparece el botón de Apple, con sesión guardada aparece el Resumen con los tres buckets (sin el menú temporal de la barra), Perfil muestra nombre y correo y «Cerrar sesión» vuelve al inicio, editar el nombre habilita y confirma «Guardar», eliminar la cuenta exige escribir `ELIMINAR` y vuelve al inicio con el aviso (y cancelar no cierra la sesión), retroceder dos meses llega al mes vacío, la clave vacía muestra el error de configuración, y el flujo de Subir cartola (pestaña, instrucciones, vista previa, «Subir tal cual», descartar con confirmación y PDF protegido) con el archivo inyectado. Sign in with Apple en sí no se puede automatizar.

## Integración continua

El job `ios` de `.github/workflows/ci.yml` corre en `macos-26` (imagen estable con Xcode 26.6, Swift 6.2 y simuladores iPhone 17; Xcode 27 aún es preview en los runners). Solo se ejecuta si cambia `apps/ios/**`, `apps/api/openapi.json`, `design/**`, el validador y el generador de tokens o el propio workflow (en `main` corre siempre), y un job omitido cuenta como éxito en `CI success`. Pasos:

1. Instala XcodeGen 2.46.0 (binario del release, versión fija).
2. Regenera el cliente (`./scripts/generate-api.sh`) y falla si difiere de lo commiteado: avisa que cambió `openapi.json` sin regenerar.
3. `node scripts/check-design-tokens.mjs` (equivale a `pnpm design:check`, sin instalar dependencias).
4. `node --test scripts/generate-ios-tokens.test.mjs`, regenera los tokens (`./scripts/generate-tokens.sh`) y falla si difieren de lo commiteado.
5. Crea un `Secrets.xcconfig` de relleno desde el ejemplo y genera el proyecto.
6. `xcodebuild test` en el primer simulador iPhone disponible, con firma ad hoc para el simulador (`CODE_SIGN_IDENTITY=-`): el CI no tiene certificados, y una compilación sin firmar no tiene entitlements, así que el Keychain la rechaza (`-34018`) y fallan los tests que lo usan. Corre en cuatro runners a la vez: el job `ios checks` hace los chequeos de código generado y corre los tests de unidad, y el job `ios` es una matriz `shard: [0, 1, 2]` donde `scripts/ui-test-shard.mjs` reparte los tests de UI de a uno por shard, en un orden estable, y cada runner corre solo los suyos con `-only-testing`. Al agregar un test de UI no hay que tocar nada: el script lo encuentra y lo asigna. Para correr un shard en local: `node scripts/ui-test-shard.mjs <índice> 3` da los argumentos. Límite: 60 minutos por shard (los clones del simulador en un mismo runner no acortaron el tiempo; los runners separados sí).

## Estructura

```
apps/ios/
  project.yml            fuente de verdad del proyecto (XcodeGen)
  scripts/generate.sh    genera el .xcodeproj
  scripts/generate-api.sh  regenera el cliente de la API desde openapi.json
  scripts/generate-tokens.sh  regenera los tokens de diseño desde design/tokens.json
  Config/                Base.xcconfig y Secrets.example.xcconfig (Secrets.xcconfig no se commitea)
  Mirach/
    App/                 punto de entrada (@main) y composición de dependencias
    Features/InicioDeSesion/  pantalla de inicio de sesión con Apple (una carpeta por pantalla del catálogo)
    Features/Sesion/     RootView (elige pantalla según la sesión) y error de configuración
    Features/Resumen/    Resumen del mes: vista, view model, gráfico y filas de bucket
    Features/DetalleBucket/ Detalle de bucket: vista, view model, hoja de reclasificación e íconos
    Features/Categorias/    Categorías y Detalle de categoría: vistas, view models, selector de íconos y textos
    Features/Perfil/        Perfil: vista (con la pantalla de eliminar cuenta), view model y textos
    Features/SubirCartola/  Subir cartola: vista, view model (máquina de estados) y textos
    Core/Staging/        copia temporal del archivo elegido y reglas de validación
    Core/Formatting/     formatos del catálogo (dinero, puntos base, meses), sin depender del idioma del dispositivo
    Features/Inicio/     línea discreta con la versión del API (`GET /version`)
    Core/Session/        Session, SessionStore (Keychain), SessionController
    Core/API/            protocolo MirachAPI, adaptador y cliente generado (Generated/)
    Core/Networking/     configuración: URL base y timeout
    Core/Design/         tokens de diseño generados (GeneratedTokens.swift)
    Resources/           assets (icono, color de acento y Tokens.xcassets generado)
  MirachTests/           pruebas unitarias
  MirachUITests/         pruebas de interfaz
```

`Info.plist` y `Mirach.entitlements` también los escribe XcodeGen desde `project.yml` en cada `generate` (incluye la capacidad "Sign in with Apple"), así que están en `.gitignore` y no se commitean: la versión (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`) y los permisos tienen una sola fuente y no pueden divergir. XcodeGen no necesita que existan de antemano; basta con ejecutar `./scripts/generate.sh` tras clonar.

## Conceptos de SwiftUI de la primera pantalla (versión del API)

- **`@main`**: marca el punto de entrada. `MirachApp` describe la app y su `WindowGroup`, que muestra la primera vista.
- **`View`**: una vista es un `struct` con una propiedad `body` que *describe* la interfaz. SwiftUI la vuelve a calcular cuando cambia el estado.
- **`@Observable`**: macro que hace que una clase (nuestro view model) avise a las vistas cuando cambian sus propiedades. La vista lo guarda con `@State`.
- **`@MainActor`**: obliga a que ese código corra en el hilo principal, el único que puede tocar la interfaz. Con Swift 6 el compilador lo verifica.
- **`async/await`**: permite esperar una respuesta de red sin bloquear la app; `await` marca el punto de espera.
- **`.task`**: modificador que lanza una tarea `async` cuando la vista aparece y la cancela cuando desaparece.

El view model tiene un estado (`idle`, `loading`, `loaded`, `failed`) y la vista simplemente dibuja según ese estado. El inicio de sesión sigue el mismo patrón (`SignInViewModel.State`) y `RootView` lo aplica a toda la app con `SessionController.phase`.
