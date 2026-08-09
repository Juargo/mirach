# Runbook — Activación de "Ingresar con Google" en mobile (ADR-035, M1)

Runbook de activación en producción (o cualquier ambiente) para el flujo
"Ingresar con Google" de `apps/mobile` (Android, ADR-035). El código del change
`auth-google-login-mobile` (slices A1–C2) queda **inerte** al mergear: sin la
configuración externa descrita acá, el endpoint responde 404 y el botón nunca
se renderiza, en cualquier ambiente incluida producción. No hay migración de
datos ni cambio de esquema — `User.googleSub` ya existe (ADR-034).

Este gate es manual y no automatizable en CI: requiere crear un OAuth client
en Google Cloud Console, configurar variables de entorno en Render/EAS y
correr el flujo real en un dispositivo Android.

## Prerrequisitos

1. El change `auth-google-login-mobile` está mergeado a `main` (slices A1, A2,
   B1, B2, B3, C1, C2 — código completo, incluidos los 3 gates manuales de
   dispositivo de la slice C2).
2. Acceso a: Google Cloud Console (mismo proyecto OAuth que el client web de
   ADR-034), Render (dashboard del servicio `moneydiary-api`), EAS
   (`eas login` con la cuenta del proyecto).
3. Un dispositivo Android físico o un emulador para el checklist final.

## Pasos

1. **Leer el SHA-1 del keystore de producción.** Desde `apps/mobile/`:

   ```bash
   eas credentials -p android
   ```

   Elegir el build profile de destino → Keystore → copiar el **SHA-1
   Fingerprint**. El keystore es el mismo para los builds `development`,
   `preview` y `production` de EAS (gestionado por EAS, un solo keystore
   cubre los tres perfiles).

2. **Crear el client OAuth Android en Google Cloud Console.** Ir al **mismo
   proyecto OAuth que el client web** (ADR-034) → Credentials → Create OAuth
   client ID → tipo **Android** → package name `cl.moneydiary.app` → pegar el
   SHA-1 del paso 1. Copiar el client ID resultante
   (`....apps.googleusercontent.com`).

3. **(Opcional, solo desarrollo local)** repetir el paso 1 y 2 con el keystore
   de debug para poder probar el flujo sin un build de EAS:

   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore \
     -alias androiddebugkey -storepass android
   ```

   Esto genera un client Android adicional, exclusivo para desarrollo local
   contra el API que se esté usando en ese momento — no se usa en producción.

4. **Confirmar el consentimiento OAuth.** La pantalla de consentimiento ya
   fue configurada por el change web (ADR-034) y debe otorgar los scopes
   `openid`, `email`, `profile`. No crear una pantalla nueva.

5. **Configurar Render.** Dashboard del servicio `moneydiary-api` →
   Environment → agregar `GOOGLE_CLIENT_ID_ANDROID=<client id del paso 2>` →
   guardar → esperar el restart automático.

6. **Configurar EAS.** En `apps/mobile/eas.json`, agregar al bloque `env` del
   build profile de destino (`production` para el rollout real; `preview`
   para pruebas internas — ver el perfil `preview` ya existente como
   referencia):

   ```json
   "EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID": "<mismo client id del paso 2>"
   ```

   No es un secreto — es un identificador público de OAuth — por lo tanto
   NO usar EAS Secrets, va directo en `eas.json`.

7. **Verificación por API (antes y después).** Antes de completar el paso 5:

   ```bash
   curl -s -H "x-api-key: $API_KEY" https://api.moneydiary.cl/api/auth/capabilities
   # esperado: "googleLoginMobileEnabled": false

   curl -s -o /dev/null -w '%{http_code}\n' -X POST \
     -H "x-api-key: $API_KEY" https://api.moneydiary.cl/api/auth/google/token
   # esperado: 404
   ```

   Después de completar los pasos 5 y 6, repetir ambos comandos:

   ```bash
   curl -s -H "x-api-key: $API_KEY" https://api.moneydiary.cl/api/auth/capabilities
   # esperado: "googleLoginMobileEnabled": true

   curl -s -o /dev/null -w '%{http_code}\n' -X POST \
     -H "x-api-key: $API_KEY" https://api.moneydiary.cl/api/auth/google/token
   # esperado: 401 (la ruta ya está montada; un body vacío/inválido cae en el
   # camino genérico de credenciales inválidas, ya no en el 404 estructural)
   ```

8. **Build e instalación.** Generar el APK interno con el perfil de EAS
   configurado en el paso 6 e instalarlo en el dispositivo/emulador. Correr
   el checklist manual del design §11.4 del change (equivalente a las tareas
   C2.7–C2.9 de `tasks.md`):
   1. Inicio de sesión con una cuenta Google que coincide con un usuario
      existente → llega al resumen, token en SecureStore.
   2. Inicio de sesión con una cuenta Google que **no** coincide con ningún
      usuario → error genérico; confirmar en la base de datos que no se creó
      ninguna fila de usuario.
   3. Cancelar en la pantalla de consentimiento → error genérico, sin token
      escrito.
   4. Ensayo del kill switch (ver paso 9) → el botón desaparece y el
      password login sigue funcionando sin cambios.

   Pegar el resultado de este checklist en el PR o en el ticket de rollout
   correspondiente antes de dar la activación por completa.

9. **Kill switch.** Render → quitar `GOOGLE_CLIENT_ID_ANDROID` → restart. El
   endpoint vuelve a responder 404 y el botón desaparece en el siguiente
   fetch de capacidades de la app — sin necesidad de un nuevo build ni cambio
   de datos. El login por password no se ve afectado.

   Nota sobre el boot assertion: `assertGoogleAuthMobileActivationConsistency`
   solo hace fallar el arranque cuando la variable de entorno está presente
   **pero** `container.googleAuthMobile` no llegó a construirse (indica un
   bug de composición, no una desactivación intencional). Quitar la variable
   por completo es el camino esperado y seguro — nunca dispara ese assertion.

## Troubleshooting

- **El botón de Google nunca aparece en el dispositivo, aunque los pasos 1–7
  ya estén confirmados.** Causa silenciosa conocida (hallazgo de la revisión
  de la slice C1): el fetch del discovery document de Google
  (`useAutoDiscovery`) puede fallar al montar la pantalla de login, y la
  librería no reintenta automáticamente. Reiniciar la pantalla o la app
  suele resolverlo — vale la pena probarlo antes de sospechar de la
  configuración de Google Cloud Console o de las variables de entorno.

## Rollback

Ejecutar el kill switch (paso 9) o revertir la configuración de Render/EAS.
No hay cambios de esquema ni de datos que revertir — el rollback es
instantáneo y no requiere un nuevo deploy del backend.
