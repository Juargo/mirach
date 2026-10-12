# Mirach para Android

App nativa (Kotlin + Jetpack Compose, Android 8.0 / API 26 o superior) de Mirach. Es un cliente delgado de la API (ADR-046 D9). Estado actual: inicio de sesión (Google y, solo para la revisión de la tienda, correo y contraseña), sesión guardada cifrada, validación con `GET /api/auth/me` al abrir y una pantalla provisoria con «Cerrar sesión» (el Resumen llega después). Las decisiones de base están en [ADR-052](../../docs/adr/ADR-052-base-app-android.md).

## Requisitos

- **JDK 17** (por ejemplo Temurin): `java -version` debe decir 17.
- **SDK de Android** con la plataforma `android-37.0` y las build-tools. Se instala con Android Studio o, desde la terminal, con `sdkmanager "platforms;android-37.0" "build-tools;36.0.0" "platform-tools"`.
- **Android Studio** es opcional: todo se puede hacer desde la terminal con `./gradlew`. Si lo usas, abre la carpeta `apps/android/` (no la raíz del repo).

No hace falta instalar Gradle: el *wrapper* (`./gradlew`) descarga la versión fijada la primera vez.

## Configuración local (una sola vez)

1. **Ruta del SDK.** Gradle necesita saber dónde está el SDK. Crea `apps/android/local.properties` (git lo ignora; Android Studio lo crea solo):

   ```properties
   sdk.dir=/Users/tu-usuario/Library/Android/sdk
   ```

   Alternativa: exportar la variable `ANDROID_HOME` con esa misma ruta.

2. **Clave pública del API.** Copia la plantilla y pon la `API_KEY` del API (ADR-047):

   ```bash
   cd apps/android
   cp secrets.example.properties secrets.properties
   # edita secrets.properties y reemplaza el valor de MIRACH_API_KEY
   ```

   `secrets.properties` está en `.gitignore`: **nunca se commitea**. Sin clave la app compila, pero al abrirla muestra «La app no está configurada correctamente.» (y en Debug lo anota en Logcat con la etiqueta `MirachConfiguration`).

3. **Inicio de sesión con Google (opcional para compilar).** Pon en `secrets.properties` el `GOOGLE_WEB_CLIENT_ID`: el ID del cliente OAuth de tipo **Web** del proyecto de Google Cloud (el mismo proyecto de la app de iPhone). Credential Manager lo usa como `serverClientId`, por lo que ese valor queda como `aud` del ID token. Sin él la app compila y funciona, pero el botón «Continuar con Google» no aparece (Debug lo anota en Logcat, etiqueta `MirachConfiguration`). Para que Google funcione de punta a punta hacen falta además:

   - En Render, `GOOGLE_CLIENT_ID_ANDROID` debe contener **ese mismo ID de cliente Web** (no el de tipo Android): el API compara el `aud` del token con esa variable.
   - En el mismo proyecto de Google Cloud, un cliente OAuth de tipo **Android** con el paquete `app.mirachbudget.android` y la huella SHA-1 de la llave con la que se firma el APK: la de depuración (`./gradlew signingReport`), la llave de subida y la llave de firma de Play (App integrity en Play Console). Sin ese cliente Credential Manager falla con un error de configuración.
   - Si la cuenta de Google no está en el emulador (necesita imagen con Google Play) el selector no ofrece cuentas.

   El correo y la contraseña de la cuenta de revisión (ADR-051) solo aparecen si el API los habilita (`passwordLoginEnabled`).

## Ejecutar en el emulador

1. En Android Studio: Device Manager > Create Device (por ejemplo un Pixel con una imagen de sistema reciente) y arráncalo. Desde la terminal: `avdmanager` y `emulator -avd <nombre>`.
2. Con el emulador encendido:

   ```bash
   cd apps/android
   ./gradlew installDebug
   adb shell am start -n app.mirachbudget.android/.MainActivity
   ```

   En Android Studio basta con elegir la configuración `app` y pulsar Run.

La primera consulta puede tardar hasta ~1 minuto: la API gratuita de Render «duerme» tras un rato sin uso. La app espera hasta 90 s y ofrece «Reintentar».

## Ejecutar en un teléfono físico

1. En el teléfono activa las **opciones de desarrollador**: Ajustes > Acerca del teléfono > toca 7 veces «Número de compilación».
2. En Opciones de desarrollador activa **Depuración por USB**.
3. Conecta el teléfono por cable y acepta «¿Permitir depuración por USB?». Comprueba que aparece con `adb devices`.
4. `./gradlew installDebug` desde `apps/android/` (o Run en Android Studio con el teléfono como destino).

## Pruebas y comprobaciones

```bash
cd apps/android
./gradlew testDebugUnitTest      # pruebas unitarias (JUnit + coroutines test), sin emulador
./gradlew assembleDebug lint     # compila el APK de debug y corre Android Lint
```

Es lo mismo que corre el job `android` de CI. Los reportes quedan en `app/build/reports/`.

## Publicar en Google Play

La guía para el dueño (cuenta de Play Console, clientes OAuth, formularios, prueba cerrada de 14 días) está en [`docs/publicar-en-play.md`](docs/publicar-en-play.md). Lo que hace el repositorio:

1. **Llave de subida (una sola vez).** `./scripts/create-upload-key.sh` crea `~/.config/mirach/android-upload.jks` y `android-upload.properties` (claves `storeFile`, `storePassword`, `keyAlias`, `keyPassword`; permisos 600), con una contraseña aleatoria que no se imprime, y muestra las huellas SHA-1 y SHA-256 del certificado. Se niega a sobrescribir archivos existentes. **Respalda ambos archivos fuera del repo.** Otra ruta: variable `MIRACH_ANDROID_SIGNING` (apunta al `.properties`).
2. **Versión.** `mirach.versionCode` y `mirach.versionName` en `gradle.properties`. Play rechaza una subida cuyo `versionCode` no sea mayor al de todas las anteriores: súbelo antes de **cada** subida.
3. **Compilar.** `./gradlew bundleRelease` genera el AAB firmado con R8 en `app/build/outputs/bundle/release/app-release.aab`; `./gradlew assembleRelease` genera el APK en `app/build/outputs/apk/release/app-release.apk` (firmado si existe el archivo de claves, sin firmar si no). Sin el archivo de claves todo lo demás (debug, pruebas, lint, CI) funciona y `bundleRelease` falla con un mensaje que nombra el archivo que falta.
4. Las reglas de R8 están en `app/proguard-rules.pro`; la verificación de un release real se hace instalando el APK firmado en un emulador con imagen de Google Play.

## Estructura

- `app/src/main/kotlin/app/mirachbudget/android/core/`: configuración (`config/`), sesión (`session/`: `SessionController`, almacenamiento cifrado con Android Keystore), red (`networking/`: `MirachApi`, su adaptador, el interceptor de credenciales, el aviso único de sesión vencida) y el cliente generado (`api/generated/`, no se edita a mano).
- `app/src/main/kotlin/app/mirachbudget/android/features/<pantalla>/`: un `ViewModel` que expone un `StateFlow` y un composable sin estado.
- `AppEnvironment.kt`: raíz de composición (qué dependencias concretas usa la app).
- `gradle/libs.versions.toml`: catálogo de versiones. Se eligen versiones con al menos dos semanas desde su publicación.

## Cliente de la API generado

El cliente se genera desde `apps/api/openapi.json` con [OpenAPI Generator](https://openapi-generator.tech) (generador `kotlin`, librería `jvm-retrofit2`, kotlinx.serialization y corrutinas) y **se commitea** en `app/src/main/kotlin/app/mirachbudget/android/core/api/generated/` (no se genera durante el build: así el diff de un cambio de contrato se ve en el PR).

```bash
cd apps/android
./scripts/generate-api.sh
```

- **Cuándo regenerar:** cada vez que cambie `apps/api/openapi.json`. **Un cambio de contrato debe regenerar los dos clientes** (`apps/ios/scripts/generate-api.sh` y este); el job `android` de CI ejecuta el script y falla si el diff no está vacío.
- **Determinismo:** el script fija la versión del generador (7.25.0) y la suma SHA-256 de su jar, que descarga a `~/.cache/mirach/openapi-generator/` la primera vez (necesita JDK 17 y `curl`). Solo copia `src/main`; no genera pruebas, documentación ni archivos de Gradle.
- **Las pantallas no usan los tipos generados:** dependen de `MirachApi` (`core/networking/MirachApi.kt`), cuya implementación `GeneratedMirachApi` envuelve el cliente generado y expone solo lo que las pantallas necesitan. Para sumar un endpoint: agrega el método a la interfaz y al adaptador, con su prueba (MockWebServer).
- **Credenciales:** `ApiAuthInterceptor` agrega `x-api-key` y, si hay sesión, `Authorization: Bearer` únicamente en rutas `/api`; `/version` no recibe nada. El token sale de `AuthTokenProvider` (hoy devuelve `null`).
- **Errores y cancelación:** el adaptador no captura excepciones: timeout (`SocketTimeoutException`), sin conexión (`IOException`), cuerpo inválido (`SerializationException`) y 5xx (`ApiException`) los traduce el `ViewModel`; la cancelación de la corrutina cancela la llamada de red y sigue siendo `CancellationException`. El timeout es de 90 s (Render duerme la instancia gratuita).
- **Particularidades del contrato:** `openapi.json` es OpenAPI 3.0.3; las propiedades anulables (`estadoGlobal`, `estadoSemaforo`, `porcentajeBp`...) se generan como tipos `?` y los cuerpos `multipart/form-data` de `/api/ingestas*` como `@Part`. El script pasa `--skip-validate-spec` porque el validador rechaza `contentEncoding` (palabra clave de 3.1) en esos `file`. La spec no declara `operationId`, así que los métodos se llaman por ruta (`apiAuthMeGet`); es estable, pero renombrar una ruta renombra el método. Cualquier otro `WARN` del generador hace fallar el script: significa que se está omitiendo algo del contrato.
- **Limitación conocida:** el generador emite `@DELETE` con `@Body` para `DELETE /api/cuenta`, y Retrofit lo rechaza al llamarlo (`Non-body HTTP method cannot contain @Body`). Para la pantalla de eliminar cuenta (T7) hay que declarar a mano ese endpoint con `@HTTP(method = "DELETE", hasBody = true)`.

## Tokens de diseño

Los colores (tema claro y oscuro), textos, tipografía y radios salen de `design/tokens.json`, la misma fuente que usa la app de iPhone. `scripts/generate-android-tokens.mjs` (Node, sin dependencias) escribe `app/src/main/kotlin/app/mirachbudget/android/core/design/GeneratedTokens.kt`, que **se commitea** y no se edita a mano.

```bash
apps/android/scripts/generate-tokens.sh
```

- **Cuándo regenerar:** cada vez que cambie `design/tokens.json`. El job `android` de CI ejecuta el script y falla si el diff no está vacío; también corre `node --test scripts/generate-android-tokens.test.mjs`.
- **Uso en pantallas:** `MirachTheme { ... }` (ya aplicado en `MainActivity`) sigue el tema del sistema. Los colores se leen con `MirachTheme.colors.<grupo>.<token>` (por ejemplo `bucket.deseos`, `feedback.errorText`), los textos con `MirachCopy`, las cifras con `.mirachFigures()` (dígitos tabulares) y las esquinas con `MirachRadius`. Los colores Material 3 (`MaterialTheme.colorScheme`) se derivan de los tokens donde existe un rol equivalente.
- **Reglas de los tokens:** los colores de `bucket` son solo relleno, nunca texto, y siempre van con una etiqueta; el bucket del 30% se llama «Deseos».

## Notas

- El `applicationId` (`app.mirachbudget.android`) no puede cambiar una vez subida la primera versión a Google Play.
- Las pantallas no usan el cliente generado: dependen de la interfaz `MirachApi` (ver «Cliente de la API generado»).
