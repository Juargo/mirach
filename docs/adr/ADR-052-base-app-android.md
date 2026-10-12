---
tags:
  - adr
  - fase-diseño
  - mobile
  - android
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-11
fecha_actualizacion: 2026-10-11
---

# ADR-052 — Base de la app de Android

## Estado

✅ **Decidido** (2026-10-11) — fase 8 del plan. Registra las decisiones tomadas antes de crear el
proyecto de Android. Las decisiones sobre el cliente de API, la estructura y las pruebas se toman tarea
por tarea y quedan en `odd/tasks/app-android.md`; este ADR solo guarda lo que ya está decidido.

## Contexto

La app de Android de Mirach se escribe desde cero en Kotlin y Jetpack Compose (ADR-046, D1 y D8) como
cliente delgado de la API (D9), después de la app de iPhone (ADR-048). El dueño del producto no tiene
experiencia previa en apps nativas y gran parte del trabajo se hace desde la terminal con un asistente,
revisado en pull requests. El identificador de la aplicación no puede cambiar una vez subida la primera
versión a Google Play.

La cuenta de Play Console es **personal y fue creada en 2026**. Google exige para ese tipo de cuenta una
prueba cerrada con al menos 12 testers inscritos durante 14 días consecutivos antes de poder solicitar
acceso a producción ([Ayuda de Play Console](https://support.google.com/googleplay/android-developer/answer/14151465)).
Ese plazo de 14 días es el camino más largo del plan.

## Decisión

1. **Gradle con Kotlin DSL y Jetpack Compose.** Un solo módulo `app`, versiones centralizadas en el
   catálogo `gradle/libs.versions.toml` y wrapper de Gradle versionado en el repositorio, de modo que
   compilar no requiere instalar Gradle. Material 3 como base de la interfaz.
2. **Ubicación: `apps/android/`**, fuera del workspace de pnpm (su build es el de Gradle, no el de pnpm),
   igual que `apps/ios/`.
3. **`applicationId` y `namespace` `app.mirachbudget.android`** (misma raíz que `app.mirachbudget.ios`,
   ADR-048). Es inmutable después de la primera subida a Play.
4. **`minSdk` 26** (Android 8.0): cubre prácticamente todos los dispositivos en uso y evita el *core
   library desugaring* para `java.time`.
5. **`targetSdk` 36 (Android 16).** Desde el 31 de agosto de 2026 las apps nuevas y sus actualizaciones
   deben apuntar a API 36 o superior ([política de Google Play](https://support.google.com/googleplay/android-developer/answer/11926878)).
   `compileSdk` es 37 porque las versiones actuales de las bibliotecas de AndroidX lo exigen; compilar
   contra un SDK más nuevo que el `targetSdk` no cambia el comportamiento en ejecución.
6. **Inicio de sesión con Google (ADR-047) y, solo para la revisión, con contraseña (ADR-051).**
   **No hay Inicio de sesión con Apple en Android**: no existe un flujo nativo y ofrecerlo por web
   añadiría una superficie que ADR-046 evita. Limitación aceptada: una persona que en el iPhone solo
   usó Apple no podrá entrar a la app de Android en la v1.
7. **Clave pública y URL del API en tiempo de compilación.** La URL (`https://mirach-api.onrender.com`)
   y la `x-api-key` (pública, ADR-047) entran en `BuildConfig`; la clave se lee de
   `apps/android/secrets.properties`, que git ignora (`secrets.example.properties` es la plantilla).
   Una clave vacía se detecta al iniciar: Debug lo registra en el log y Release muestra «La app no está
   configurada correctamente.». La clave se envía solo a rutas `/api`.
8. **Cuenta personal de Play → prueba cerrada con 12 testers durante 14 días** antes de solicitar
   producción. La primera versión mínima debe llegar a la pista de prueba cerrada lo antes posible para
   que el plazo corra mientras se construyen las demás pantallas.

## Consecuencias

- Quien compile necesita JDK 17 y el SDK de Android (Android Studio es opcional); `./gradlew` descarga
  la versión de Gradle fijada en `gradle/wrapper/gradle-wrapper.properties` (con su suma SHA-256).
- Una clave ausente se detecta en ejecución y no al compilar, para que CI y quien aún no tiene la clave
  puedan compilar y correr las pruebas.
- Las llaves de firma (de subida) nunca se versionan; viven fuera del repositorio.
- Hay que crear en el mismo proyecto de Google Cloud un cliente OAuth de tipo Android (paquete y SHA-1 de
  la llave de subida y de la llave de firma de Play) y configurar `GOOGLE_CLIENT_ID_ANDROID` en Render
  con el cliente de tipo web usado como `serverClientId` (su `aud` es el que llega en el ID token).
- CI compila y prueba la app en Ubuntu (`./gradlew testDebugUnitTest assembleDebug lint`) con una clave de
  relleno, sin secretos.
- Android no tiene un equivalente al login de Apple: los textos de la tienda deben aclarar que el acceso
  es con Google.

## Alternativas consideradas

- **Kotlin Multiplatform / compartir código con iOS.** Descartado en ADR-046 (D1): dos apps nativas
  delgadas generadas desde `openapi.json`.
- **Vistas XML en lugar de Compose.** Más material histórico, pero es la tecnología en retirada; Compose
  es lo que Google enseña y mantiene.
- **Groovy DSL en Gradle.** Sin ventaja; Kotlin DSL da autocompletado y errores de tipo.
- **`minSdk` 24 o 21.** Más dispositivos antiguos a costa de desugaring y de probar versiones que casi
  nadie usa; **`minSdk` 29 o superior** descartaría teléfonos aún comunes.
- **Cuenta de organización en Play** (sin el requisito de los 14 días): exige una empresa registrada y
  verificación D-U-N-S, que el proyecto no tiene.
