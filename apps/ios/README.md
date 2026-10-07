# Mirach para iPhone

App nativa (Swift + SwiftUI, iOS 17+) de Mirach. Es un cliente delgado de la API (ADR-046 D9). El estado actual: inicio de sesión con Apple, sesión guardada en el Keychain y y el Resumen del mes (solo lectura): mes, estado global, ingreso, gráfico de distribución del gasto y una fila por bucket, con selector de mes, y una barra de pestañas (Resumen y Subir) con «Subir cartola» (T5a: elegir archivo, vista previa, contraseña de PDF y «Subir tal cual»; T5b: «Revisar y editar» con el catálogo de categorías y la reclasificación por fila).

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
- **Sesión:** la respuesta (`token`, `userId`, `expiresAt`) se guarda en el Keychain (`KeychainSessionStore`: servicio `app.mirachbudget.ios.session`, accesible tras el primer desbloqueo y solo en este dispositivo) detrás del protocolo `SessionStore`; las pruebas usan `InMemorySessionStore`. `SessionController` (`@Observable`) guarda la fase (`validating`, `signedOut`, `signedIn`, `connectionFailed`, `misconfigured`) y `RootView` solo dibuja esa fase.
- **Arranque:** sin token va al inicio de sesión; con token valida con `GET /api/auth/me`: 200 entra, 401 descarta la sesión y va al inicio de sesión, y un fallo de red muestra «Reintentar» **sin borrar la sesión**.
- **401 en cualquier llamada autenticada:** `OpenAPIMirachAPI` lo detecta en un solo lugar; si el código es `SESION_INVALIDA` avisa al `SessionController` (por `SessionExpiryRelay`), que borra la sesión y vuelve al inicio de sesión, sin reintento. Un `API_KEY_INVALIDA` no cuenta como sesión vencida.
- **Cerrar sesión** borra el token local. Llamar a `POST /api/auth/logout` llegará con la pantalla de Perfil.
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

## Pruebas

Desde Xcode: Cmd+U (corre unitarias y de interfaz).

Desde la terminal:

```bash
xcodebuild -project Mirach.xcodeproj -scheme Mirach \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test
```

- `MirachTests`: pruebas unitarias con Swift Testing (`@Test`, `#expect`) de los view models y del `SessionController` (con un `MirachAPI` y un `SessionStore` falsos), del adaptador (con un transporte falso que alimenta el cliente generado real) y de una ida y vuelta real contra el Keychain del simulador.
- `MirachUITests`: pruebas de interfaz con XCUITest. Lanzan la app con `-uiTestStubbedClient` (API con respuesta fija, sin red) y cubren: sin sesión aparece el botón de Apple, con sesión guardada aparece el Resumen con los tres buckets y «Cerrar sesión» (menú de la barra) vuelve al inicio, retroceder dos meses llega al mes vacío, la clave vacía muestra el error de configuración, y el flujo de Subir cartola (pestaña, instrucciones, vista previa, «Subir tal cual», descartar con confirmación y PDF protegido) con el archivo inyectado. Sign in with Apple en sí no se puede automatizar.

## Integración continua

El job `ios` de `.github/workflows/ci.yml` corre en `macos-26` (imagen estable con Xcode 26.6, Swift 6.2 y simuladores iPhone 17; Xcode 27 aún es preview en los runners). Solo se ejecuta si cambia `apps/ios/**`, `apps/api/openapi.json`, `design/**`, el validador y el generador de tokens o el propio workflow (en `main` corre siempre), y un job omitido cuenta como éxito en `CI success`. Pasos:

1. Instala XcodeGen 2.46.0 (binario del release, versión fija).
2. Regenera el cliente (`./scripts/generate-api.sh`) y falla si difiere de lo commiteado: avisa que cambió `openapi.json` sin regenerar.
3. `node scripts/check-design-tokens.mjs` (equivale a `pnpm design:check`, sin instalar dependencias).
4. `node --test scripts/generate-ios-tokens.test.mjs`, regenera los tokens (`./scripts/generate-tokens.sh`) y falla si difieren de lo commiteado.
5. Crea un `Secrets.xcconfig` de relleno desde el ejemplo y genera el proyecto.
6. `xcodebuild test` en el primer simulador iPhone disponible, con firma ad hoc para el simulador (`CODE_SIGN_IDENTITY=-`): el CI no tiene certificados, y una compilación sin firmar no tiene entitlements, así que el Keychain la rechaza (`-34018`) y fallan los tests que lo usan. Límite: 60 minutos (la suite de UI crece con cada pantalla y el runner es varias veces más lento que una Mac local; correrla en paralelo no acortó el tiempo).

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
