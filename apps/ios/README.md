# Mirach para iPhone

App nativa (Swift + SwiftUI, iOS 17+) de Mirach. Es un cliente delgado de la API (ADR-046 D9). El estado actual es un esqueleto: una pantalla temporal que consulta `GET /version` y muestra versión y commit, para comprobar que todo el circuito funciona.

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

## Pruebas

Desde Xcode: Cmd+U (corre unitarias y de interfaz).

Desde la terminal:

```bash
xcodebuild -project Mirach.xcodeproj -scheme Mirach \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test
```

- `MirachTests`: pruebas unitarias con Swift Testing (`@Test`, `#expect`) del view model, con un cliente HTTP falso.
- `MirachUITests`: pruebas de interfaz con XCUITest. Lanzan la app con el argumento `-uiTestStubbedClient`, que hace que use un cliente HTTP con respuesta fija; así no dependen de la red.

## Estructura

```
apps/ios/
  project.yml            fuente de verdad del proyecto (XcodeGen)
  scripts/generate.sh    genera el .xcodeproj
  Mirach/
    App/                 punto de entrada (@main) y composición de dependencias
    Features/Inicio/     la primera pantalla (una carpeta por pantalla del catálogo)
    Core/Networking/     capa HTTP: protocolo HTTPClient, URL base y timeout
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
