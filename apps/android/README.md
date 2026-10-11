# Mirach para Android

App nativa (Kotlin + Jetpack Compose, Android 8.0 / API 26 o superior) de Mirach. Es un cliente delgado de la API (ADR-046 D9). Estado actual: esqueleto con una pantalla que consulta `GET /version` (con carga, error y «Reintentar»). Las decisiones de base están en [ADR-052](../../docs/adr/ADR-052-base-app-android.md).

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

## Estructura

- `app/src/main/kotlin/app/mirachbudget/android/core/`: configuración (`config/`) y red (`networking/`).
- `app/src/main/kotlin/app/mirachbudget/android/features/<pantalla>/`: un `ViewModel` que expone un `StateFlow` y un composable sin estado.
- `AppEnvironment.kt`: raíz de composición (qué dependencias concretas usa la app).
- `gradle/libs.versions.toml`: catálogo de versiones. Se eligen versiones con al menos dos semanas desde su publicación.

## Notas

- El `applicationId` (`app.mirachbudget.android`) no puede cambiar una vez subida la primera versión a Google Play.
- El cliente HTTP actual es mínimo y está detrás de la interfaz `VersionApi`; se reemplaza por el cliente generado desde `apps/api/openapi.json` en la tarea siguiente.
