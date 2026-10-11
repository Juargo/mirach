# Publicar Mirach en Google Play (guía para quien publica por primera vez)

Guía paso a paso para la cuenta de desarrollador **personal creada en 2026**. Cubre desde las llaves y los clientes OAuth hasta pedir el acceso a producción. Lo que hace el repositorio (firma, versión, AAB) está en [`../README.md`](../README.md); aquí solo está lo que debes hacer tú en Play Console, Google Cloud y Render.

Cada afirmación sobre Play Console se verificó el 2026-10-11 contra la documentación de Google (enlaces al final de cada sección). Lo que no se pudo verificar está marcado **«No verificado»**. Play Console cambia de nombres y pantallas con frecuencia: si algo no se llama igual, busca el equivalente.

> **Bloqueos por el sitio web.** El landing (`apps/landing`, dominio `mirachbudget.app`) todavía no está desplegado. Marcado con **[BLOQUEA: landing]** lo que no puede completarse hasta que `https://mirachbudget.app/privacidad` y `/soporte` existan, y hasta que exista el recurso web de eliminación de cuenta (ver sección 6).

## 0. La regla que manda el calendario

Una cuenta personal creada después del 13 de noviembre de 2023 **no puede publicar en producción de inmediato**: debe correr una *prueba cerrada* con **al menos 12 testers que se mantengan con la opción activada (opt-in) de forma continua durante 14 días**. Si un tester sale y vuelve a entrar, los 14 días deben ser consecutivos para contar. Cumplido eso, se pulsa «Solicitar acceso a producción» (Apply for production) y Google responde normalmente en siete días o menos. Fuente: [Play Console Help 14151465](https://support.google.com/googleplay/android-developer/answer/14151465).

Consecuencia práctica: **el reloj de 14 días empieza cuando hay 12+ testers dentro de la prueba cerrada**, así que consigue los testers (sección 9) antes de publicar el AAB y no pierdas días. Recomendación: **15 o más** testers, porque algunos no aceptan la invitación o se salen.

## 1. Llave de subida y primer AAB (en tu máquina)

1. `apps/android/scripts/create-upload-key.sh` (una sola vez). Crea `~/.config/mirach/android-upload.jks` y `android-upload.properties` y muestra las huellas **SHA-1** y **SHA-256** del certificado de subida. **Respalda ambos archivos** en un lugar privado (gestor de contraseñas o disco cifrado); no van al repositorio.
2. Antes de cada subida, sube `mirach.versionCode` en `apps/android/gradle.properties` (Play rechaza un `versionCode` que no sea mayor a todos los ya subidos, en cualquier pista).
3. `cd apps/android && ./gradlew bundleRelease`. El AAB queda en `apps/android/app/build/outputs/bundle/release/app-release.aab`.

Huella de la llave de subida creada el 2026-10-11 (el SHA-1 va al cliente OAuth de Android, sección 4):

```
SHA-1:   2D:DE:87:C3:52:16:99:9B:62:E5:B3:F8:64:8D:5C:21:97:3E:23:B4
SHA-256: 74:F7:00:1B:B8:3C:24:D3:3B:DB:40:00:CD:99:08:2D:C5:3E:69:56:DB:A2:4C:AB:7E:DB:9E:49:47:69:74:5F
```

Si no estás en la máquina donde se creó, la huella se recupera con `keytool -list -v -keystore ~/.config/mirach/android-upload.jks -alias mirach-upload`.

## 2. Crear la app en Play Console

Play Console > **Crear app**:

- **Nombre de la app:** `Mirach`.
- **Idioma predeterminado:** `es-419` (español de Latinoamérica) o `es-CL`. Recomendado: **`es-419`**, porque cubre Chile y el resto de la región con una sola ficha; si prefieres la ficha específica de Chile, `es-CL` también sirve. El idioma predeterminado no se puede mezclar después sin agregar traducciones: elige y mantén los textos en ese idioma.
- **App o juego:** App.
- **Gratuita o de pago:** **Gratuita**. (Una app gratuita no puede pasar a ser de pago después.)
- Acepta las declaraciones (políticas del programa para desarrolladores y leyes de exportación de EE. UU.).

El identificador del paquete (`app.mirachbudget.android`) queda fijado al subir el primer AAB y no puede cambiar.

## 3. Play App Signing

Al subir el primer AAB, Play Console ofrece **Play App Signing**; para apps nuevas es el modo obligatorio. Funciona así: tú firmas el AAB con la **llave de subida** (la de la sección 1) y Google lo vuelve a firmar con la **llave de firma de la app**, que custodia él. Acepta la inscripción con la opción predeterminada (que Google genere la llave de firma de la app).

Después de subir el primer AAB, copia la huella de la llave de firma: Play Console > tu app > **Prueba y publicación > Integridad de la app > Firma de apps** (App integrity > App signing) > «Certificado de la clave de firma de la app» > **SHA-1**. La necesitas en la sección 4. *(Nombres de menú: No verificado en esta versión de la consola.)*

## 4. Inicio de sesión con Google: Google Cloud y Render

El inicio de sesión usa Credential Manager. Detalle importante (verificado en `crear-auth-google-mobile.ts`): el `aud` del ID token es el **cliente de tipo Web** que la app pasa como `serverClientId`, no el cliente de tipo Android. Por eso hacen falta **dos** clientes OAuth en el **mismo proyecto de Google Cloud** que ya usa la app de iPhone:

1. **Cliente OAuth de tipo «Aplicación web» (Web application).** Si ya existe uno para la app de iPhone puedes reutilizarlo; si no, créalo. No requiere URIs de redirección para este uso.
   - Su ID de cliente va en `apps/android/secrets.properties` como `GOOGLE_WEB_CLIENT_ID=...` (el archivo está ignorado por git) y se compila dentro de la app. Con el valor vacío el botón «Continuar con Google» no aparece.
   - En **Render** (servicio `mirach-api` > Environment), define `GOOGLE_CLIENT_ID_ANDROID` con **ese mismo ID de cliente Web**. El API compara el `aud` del token contra esa variable. Guarda y deja que Render reinicie.
2. **Cliente OAuth de tipo «Android».** Google Cloud > APIs y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth > Android:
   - Nombre del paquete: `app.mirachbudget.android`.
   - Huella SHA-1: la de la **llave de subida** (sección 1). Es necesaria para las instalaciones que firmas tú (APK local, prueba interna descargada con firma de subida).
   - Crea **otro** cliente de tipo Android igual con la **SHA-1 de la llave de firma de Play** (sección 3): las instalaciones que vienen de Play llevan esa firma. Si falta, Credential Manager falla con un error de configuración solo en las versiones de Play.
   - *(Opcional, para desarrollar:)* un tercero con la SHA-1 de depuración (`./gradlew signingReport`).
3. La **pantalla de consentimiento OAuth** debe estar configurada. Mientras esté en modo «Pruebas» solo entran las cuentas que agregues como usuarios de prueba; para que cualquier tester pueda iniciar sesión, publícala («En producción»). Con los alcances básicos (`openid`, correo, perfil) no requiere verificación de Google. *(Comportamiento de la consola de Google Cloud: No verificado.)*
4. Recompila (`./gradlew bundleRelease`) con `GOOGLE_WEB_CLIENT_ID` ya puesto: el valor se embebe en el AAB.

## 5. Configuración mínima de la app antes de CUALQUIER pista de pruebas

Play Console > **Política y programas > Contenido de la app** (App content). Fuente de la lista: [Play Console Help 9859455](https://support.google.com/googleplay/android-developer/answer/9859455). Hay que completar estas declaraciones antes de poder publicar incluso en una pista de pruebas:

| Elemento | Qué responder para Mirach |
| --- | --- |
| **Política de privacidad** | URL activa: `https://mirachbudget.app/privacidad`. **[BLOQUEA: landing]**. La página actual solo describe el inicio de sesión con Apple y la app de iPhone: **hay que actualizarla** para cubrir Android y el inicio de sesión con Google (qué recibimos de Google: ID de usuario, nombre y correo) antes de enviarla. Google exige la política en la ficha y dentro de la app (T12 agrega el enlace dentro de la app). |
| **Acceso a la app** (App access) | «Todas o algunas funciones están restringidas». Agrega instrucciones de acceso (hasta cinco conjuntos): *«Toca "Acceso con correo", ingresa el correo y la contraseña de la cuenta de revisión y pulsa Ingresar.»* con el correo y la contraseña de la cuenta de revisión (ADR-051; las credenciales están en el gestor del dueño, **no** en este repositorio). Indica que la cuenta es de uso exclusivo de revisión. |
| **Anuncios** | **No**, la app no contiene anuncios. |
| **Clasificación de contenido** | Completa el cuestionario de la categoría «Utilidad, productividad, comunicación u otra» (no es juego, sin violencia ni contenido sexual, sin apuestas, sin compras): resultado esperado «para todos». Sin cuestionario la app queda «Sin clasificar» y puede retirarse. |
| **Público objetivo** | **18 años o más** únicamente (finanzas personales); así no aplica la política de Familias. |
| **Funciones financieras** (Financial features) | Obligatoria para todas las apps, también en pistas de prueba ([Help 13849271](https://support.google.com/googleplay/android-developer/answer/13849271)). Mirach no ofrece préstamos, banca, pagos ni asesoría: marca que **no ofrece funciones financieras** y certifícalo. *(Decisión de interpretación: Mirach analiza gastos del usuario sin mover dinero; si Play pide otra categoría, responde según lo que ofrece la app.)* |
| **Seguridad de los datos** | Ver sección 6. |
| **Otras** (noticias, COVID-19, apps gubernamentales) | No aplica a ninguna. |
| **Permisos sensibles** | La app no declara permisos sensibles (solo `INTERNET`); no hay formularios de permisos. |

## 6. Formulario de seguridad de los datos (borrador de respuestas)

Play Console > Contenido de la app > **Seguridad de los datos**. Borrador basado en lo que la app realmente hace hoy (revisa de nuevo cuando salgan T6 a T11):

**Recopilación y uso compartido**
- ¿La app recopila o comparte datos del usuario? **Sí, recopila.**
- ¿Comparte datos con terceros? **No.** Render y Supabase son proveedores de alojamiento (procesan por cuenta nuestra) y no cuentan como «compartir» según la definición de Google (transferencia a un tercero para sus fines). *(Interpretación de la definición: No verificado; si dudas, la política de privacidad debe nombrarlos, como ya hace.)*

**Tipos de datos recopilados** (todos: «recopilado», **no** compartido, **obligatorio**, finalidad **Funcionalidad de la app**, y **Gestión de la cuenta** para los de cuenta):

| Categoría | Tipo | Detalle |
| --- | --- | --- |
| Información personal | **Nombre** | Se recibe de Google al iniciar sesión. |
| Información personal | **Dirección de correo electrónico** | Cifrado en la base de datos (AES-256-GCM, ADR-013). |
| Información personal | **ID de usuario** | Identificador de cuenta. |
| Información financiera | **Otra información financiera** | Movimientos de las cartolas que sube el usuario (fecha, descripción cifrada, monto, banco) y categorías. No se piden números de tarjeta ni credenciales bancarias. |

No recopila: ubicación, contactos, fotos o videos, audio, historial de navegación, identificadores de dispositivo o publicidad, datos de salud, ni mensajes. Los archivos de cartola se procesan en el servidor para extraer movimientos; confirma en la política si se conservan los archivos originales.

**Prácticas de seguridad**
- ¿Los datos se cifran en tránsito? **Sí** (HTTPS).
- ¿Los datos se cifran en reposo? Play no lo pregunta como casilla propia de forma garantizada; la política de privacidad lo declara (base cifrada y campos sensibles AES-256-GCM). *(No verificado si el formulario actual conserva esa casilla.)*
- **Eliminación de datos:** el usuario puede solicitar que se eliminen. Se marca «Sí» solo si de verdad existe: la eliminación dentro de la app llega con **T7** (Perfil > Eliminar cuenta con `ELIMINAR`, ya existe en la app de iPhone); el formulario puede completarse antes pero **no debe declararse hasta que exista el mecanismo real** o se contradice la ficha.
- **Recurso web de eliminación** [BLOQUEA: landing]: Google exige, para toda app que permita crear cuenta, (a) una vía dentro de la app y (b) un recurso web donde pedir la eliminación de la cuenta y los datos sin volver a la app ni reinstalarla; debe nombrar la app o al desarrollador tal como aparece en la ficha, y se puede apuntar a la sección de eliminación de la política de privacidad con un ancla ([Help 13327111](https://support.google.com/googleplay/android-developer/answer/13327111)). Hoy el landing solo explica la eliminación desde la app: hay que **agregar una sección «Eliminar tu cuenta»** (por ejemplo `https://mirachbudget.app/privacidad#eliminar-cuenta` o `/soporte#eliminar-cuenta`) que permita solicitarla por correo a `jorgeretamalaburto@gmail.com` indicando el correo de la cuenta, y la URL se escribe en el formulario. *(Que un correo basta como «recurso web» no está verificado; la documentación menciona formularios y alias de correo como mecanismos válidos para el formulario de seguridad: [Help 10787469](https://support.google.com/googleplay/android-developer/answer/10787469).)*
- Retención: indica que se conservan mientras exista la cuenta y se borran al eliminarla (lo que dice la política vigente).

## 7. Ficha de la tienda (mínimos)

Play Console > **Crecer > Presencia en la tienda > Ficha de Play Store principal**. Requisitos de gráficos ([Help 9866151](https://support.google.com/googleplay/android-developer/answer/9866151)):

- **Ícono:** PNG 32 bits con alfa, **512 × 512 px**, máx. 1024 KB.
- **Gráfico de funciones** (feature graphic): JPEG o PNG 24 bits **sin alfa**, **1024 × 500 px**.
- **Capturas de teléfono:** al menos **2** (JPEG o PNG 24 bits sin alfa; lado mínimo 320 px, máximo 3840 px; el lado largo no puede superar el doble del corto; hasta 8). Para ser elegible en formatos de recomendación Google sugiere 4 o más de 1080 × 1920 o mayores. Las capturas del emulador de esta guía sirven de base (1080 × 2400); cuando exista el Resumen, usa capturas con datos de demostración, nunca datos reales.
- **Descripción breve:** máximo **80 caracteres**. El título y la descripción completa tienen sus propios límites en la consola (en la práctica: 30 y 4000 caracteres; *No verificado en la documentación consultada*).

Borrador (es-419):

- **Nombre:** `Mirach`
- **Descripción breve (≤ 80):** `Ordena tus cartolas y mira tu presupuesto 50/30/20 en un solo lugar.` (68 caracteres)
- **Descripción completa:**

  > Mirach te ayuda a entender en qué se va tu plata. Importa tus cartolas de Banco de Chile, BancoEstado, BCI y Santander, clasifica tus movimientos y te muestra cómo va tu mes frente a la regla 50/30/20: Necesidades, Deseos y Ahorro.
  >
  > • Mira el resumen de cada mes y navega entre meses.
  > • Compara lo que gastas en cada grupo con su meta.
  > • Tus datos son tuyos: viajan por HTTPS, se guardan cifrados y puedes eliminar tu cuenta cuando quieras.
  >
  > Mirach no mueve dinero ni se conecta a tu banco: solo trabaja con las cartolas que tú subes. Sin anuncios.

  *(Ajusta a lo que la app ya hace: hoy solo existe el Resumen del mes; no prometas subir cartolas hasta T6.)*
- **Categoría:** Finanzas. **Correo de contacto** (obligatorio): `jorgeretamalaburto@gmail.com`. **Sitio web** y **política de privacidad:** `https://mirachbudget.app` [BLOQUEA: landing].

## 8. Subir a prueba interna primero (humo)

1. Play Console > **Pruebas > Pruebas internas** > **Crear versión nueva**. Acepta Play App Signing, sube `app-release.aab`, nombre de la versión (p. ej. `0.1.0 (1)`) y notas breves. Guardar > Revisar > **Iniciar lanzamiento**.
2. Pestaña **Testers**: crea una lista con tu propio correo de Google y copia el **enlace de adhesión**. La prueba interna está disponible en minutos y sin revisión larga.
3. Instala desde ese enlace en un teléfono o emulador **con Play Store** y comprueba: abre, aparece «Continuar con Google», el inicio de sesión funciona de punta a punta (esto valida la huella SHA-1 de Play de la sección 4) y llega al Resumen.
4. Si algo falla, corrige, **sube `mirach.versionCode`** y vuelve a subir.

## 9. Prueba cerrada y los 14 días

1. **Pruebas > Pruebas cerradas > Crear pista** (por ejemplo `Prueba cerrada`) > **Crear versión nueva** y sube el AAB aprobado en la prueba interna (puedes promoverlo desde la interna).
2. **Testers:** crea una lista de correos o usa un **Grupo de Google** (recomendado: agregas y quitas gente sin tocar Play Console; crea el grupo en groups.google.com y acepta miembros de fuera de tu organización). Reúne **15 o más** personas con cuenta de Google que **usen Android** (no vale iPhone). *(Aprobación del grupo como lista de testers: No verificado; la consola acepta listas de correos y Grupos de Google.)*
3. Publica la versión (pasa por una revisión de Google que puede tardar días la primera vez) y comparte el **enlace de adhesión** (opt-in link) de la pista. Cada tester debe **abrir el enlace, pulsar «Convertirse en tester» e instalar desde Play Store**. Lleva la cuenta de quién aceptó (pestaña Testers muestra los números).
4. **Mantén a 12 o más testers dentro 14 días seguidos.** Si alguien se sale, reemplázalo de inmediato con otro; los 14 días del conjunto deben ser continuos.
5. Pide a los testers que abran la app durante el periodo y manden comentarios; Google pregunta después sobre la participación.
6. Al cumplirse el plazo, el **Panel** (Dashboard) muestra **«Solicitar acceso a producción»** (Apply for production). Responde las tres secciones: sobre tu prueba cerrada (cómo reclutaste, qué comentarios recibiste, qué cambiaste), sobre la app y sobre la preparación para producción. Google responde normalmente en siete días o menos ([Help 14151465](https://support.google.com/googleplay/android-developer/answer/14151465)).
7. Aprobado el acceso, crea el lanzamiento en **Producción** con el AAB final.

## 10. Lista de verificación

- [ ] Llave de subida creada y respaldada; SHA-1 anotada.
- [ ] App creada en Play Console (Mirach, es-419, gratuita, app).
- [ ] Clientes OAuth Web y Android (subida + firma de Play) y `GOOGLE_CLIENT_ID_ANDROID` en Render; `GOOGLE_WEB_CLIENT_ID` en `secrets.properties`.
- [ ] Landing desplegado; política de privacidad actualizada para Android/Google y sección de eliminación de cuenta. **[BLOQUEA: landing]**
- [ ] Contenido de la app completo (privacidad, acceso con credenciales de revisión, anuncios, clasificación, público 18+, funciones financieras, seguridad de los datos).
- [ ] Ficha: ícono 512, gráfico 1024 × 500, 2+ capturas, descripciones.
- [ ] Humo en prueba interna con el inicio de sesión de Google funcionando.
- [ ] Prueba cerrada publicada, 15+ testers con opt-in, 14 días continuos.
- [ ] «Solicitar acceso a producción».

## Fuentes

- Requisitos de prueba cerrada y acceso a producción: https://support.google.com/googleplay/android-developer/answer/14151465
- Contenido de la app (declaraciones requeridas): https://support.google.com/googleplay/android-developer/answer/9859455
- Eliminación de cuentas (dentro de la app y recurso web): https://support.google.com/googleplay/android-developer/answer/13327111
- Formulario de seguridad de los datos y mecanismo de eliminación: https://support.google.com/googleplay/android-developer/answer/10787469
- Declaración de funciones financieras: https://support.google.com/googleplay/android-developer/answer/13849271
- Recursos gráficos de la ficha: https://support.google.com/googleplay/android-developer/answer/9866151
