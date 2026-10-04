# Mirach para iPhone

App nativa (Swift + SwiftUI, iOS 17+) de Mirach. Es un cliente delgado de la API (ADR-046 D9). El estado actual es un esqueleto: una pantalla temporal que consulta `GET /version` a través del cliente generado y muestra versión y commit, para comprobar que todo el circuito funciona.

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
- **Limitaciones conocidas del generador con este contrato:** las propiedades anuladas (`anyOf` con `type: "null"`, OpenAPI 3.1) se omiten del tipo generado, y los cuerpos `multipart/form-data` opcionales (`/api/ingestas*`) no se generan. Hay que resolverlo (en el contrato o a mano) antes de usar esas pantallas.

## Clave de la API y sesión

Toda llamada a `/api` necesita el header `x-api-key` (clave pública del cliente, ADR-047) y, después de iniciar sesión, `Authorization: Bearer <sesión>`. Lo agrega `APIAuthMiddleware` (`Mirach/Core/API/`), que **nunca** toca rutas fuera de `/api` (como `/version`) y no envía un header vacío.

La clave **no está en el repo**. Para configurarla:

```bash
cd apps/ios
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # está en .gitignore
# edita Config/Secrets.xcconfig y pon el valor real en MIRACH_API_KEY
./scripts/generate.sh
```

`Config/Base.xcconfig` define `MIRACH_API_KEY` vacía e incluye `Secrets.xcconfig` si existe; `project.yml` la publica en `Info.plist` y `AppConfiguration.apiKey` la lee. Sin el archivo la app compila igual (la clave queda vacía). La sesión (token) llegará con el inicio de sesión con Apple (T4).

## Pruebas

Desde Xcode: Cmd+U (corre unitarias y de interfaz).

Desde la terminal:

```bash
xcodebuild -project Mirach.xcodeproj -scheme Mirach \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test
```

- `MirachTests`: pruebas unitarias con Swift Testing (`@Test`, `#expect`) del view model (con un `MirachAPI` falso) y del adaptador (con un transporte falso que alimenta el cliente generado real).
- `MirachUITests`: pruebas de interfaz con XCUITest. Lanzan la app con el argumento `-uiTestStubbedClient`, que hace que use una API con respuesta fija; así no dependen de la red.

## Estructura

```
apps/ios/
  project.yml            fuente de verdad del proyecto (XcodeGen)
  scripts/generate.sh    genera el .xcodeproj
  scripts/generate-api.sh  regenera el cliente de la API desde openapi.json
  Config/                Base.xcconfig y Secrets.example.xcconfig (Secrets.xcconfig no se commitea)
  Mirach/
    App/                 punto de entrada (@main) y composición de dependencias
    Features/Inicio/     la primera pantalla (una carpeta por pantalla del catálogo)
    Core/API/            protocolo MirachAPI, adaptador y cliente generado (Generated/)
    Core/Networking/     configuración: URL base y timeout
    Resources/           assets (icono y color de acento)
  MirachTests/           pruebas unitarias
  MirachUITests/         pruebas de interfaz
```

`Info.plist` y `Mirach.entitlements` también los escribe XcodeGen desde `project.yml` en cada `generate` (incluye la capacidad "Sign in with Apple"), así que están en `.gitignore` y no se commitean: la versión (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`) y los permisos tienen una sola fuente y no pueden divergir. XcodeGen no necesita que existan de antemano; basta con ejecutar `./scripts/generate.sh` tras clonar.

## Conceptos de SwiftUI de la primera pantalla

- **`@main`**: marca el punto de entrada. `MirachApp` describe la app y su `WindowGroup`, que muestra la primera vista.
- **`View`**: una vista es un `struct` con una propiedad `body` que *describe* la interfaz. SwiftUI la vuelve a calcular cuando cambia el estado.
- **`@Observable`**: macro que hace que una clase (nuestro view model) avise a las vistas cuando cambian sus propiedades. La vista lo guarda con `@State`.
- **`@MainActor`**: obliga a que ese código corra en el hilo principal, el único que puede tocar la interfaz. Con Swift 6 el compilador lo verifica.
- **`async/await`**: permite esperar una respuesta de red sin bloquear la app; `await` marca el punto de espera.
- **`.task`**: modificador que lanza una tarea `async` cuando la vista aparece y la cancela cuando desaparece.

El view model tiene un estado (`idle`, `loading`, `loaded`, `failed`) y la vista simplemente dibuja según ese estado.
