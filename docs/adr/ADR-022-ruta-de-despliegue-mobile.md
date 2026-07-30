---
tags:
  - adr
  - fase-diseño
  - mobile
  - devops
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-14
fecha_actualizacion: 2026-07-14
---

# ADR-022 — Ruta de Despliegue Mobile: distribución interna (EAS) antes que store

## Estado

✅ **Decidido** — reemplaza la ruta implícita "publicar en stores" que ADR-010 App Mobile dejó como decisión futura. El despliegue **web no cambia** (ADR-004 Hosting sigue vigente: Vercel + Render + GitHub Actions).

---

## Contexto

ADR-004 Hosting resolvió el despliegue de web y backend. ADR-010 App Mobile decidió el stack mobile (React Native + Expo dev-client) pero dejó explícitamente fuera la **distribución** (App Store / Play Store / EAS), a definirse "al planificar la construcción real". Ese momento llegó, y el contexto cambió:

**Cambio de prioridad (Máster):** el objetivo inmediato es **presentar el producto funcionando** para cerrar el Máster. La presentación **no exige** que la app esté publicada en un store. Exige poder **demostrar su uso en un ambiente controlado, idealmente desde un celular físico**, ante el desarrollador y los evaluadores.

**La ruta store se encareció:** Google Play exige a las cuentas personales creadas después de nov-2023 un **closed test con mínimo 12 testers opted-in durante 14 días continuos** antes de poder solicitar acceso a producción. Para un solo desarrollador con plazo de Máster, eso convierte la publicación en Play Store en un proyecto en sí mismo — con riesgo de calendario que la demo no necesita correr. En iOS ni siquiera hay cuenta: Apple Developer cuesta USD 99/año y sin ella no existe distribución ad-hoc a terceros.

**Restricciones concretas:**

- Audiencia de la demo: **el desarrollador + evaluadores del Máster** → se necesita un artefacto **instalable por terceros** (no basta el dev server en el teléfono propio).
- Cuentas disponibles: **Google Play (USD 25, pago único) ya pagada**; Apple Developer no.
- Presupuesto: capa gratuita en todo lo demás (coherente con ADR-004 Hosting).
- El estudio de la publicación en stores **continúa** como objetivo de aprendizaje — solo deja de ser prioridad y deja de bloquear la demo.

---

## Opciones Evaluadas

### Opción A — Demo por dev server (Metro + dev-client en el teléfono propio)

Correr `expo start` en el laptop y abrir la app desde el development build en el teléfono del desarrollador.

✅ Cero configuración adicional — es el flujo de desarrollo diario.
✅ Hot reload durante la demo.
❌ **No es instalable por los evaluadores** — la app vive atada al Metro bundler del laptop.
❌ Frágil como formato de demo: depende de la red local/tunnel y del laptop encendido.
❌ No demuestra un "despliegue": es el entorno de desarrollo disfrazado.

### Opción B — Publicar en Play Store (ruta original)

Subir el AAB a Google Play y distribuir por el store.

✅ Es la meta final y el mayor aprendizaje de proceso.
✅ La cuenta (USD 25) ya está pagada.
❌ **Closed test obligatorio: 12 testers × 14 días continuos** antes de producción (cuentas personales post nov-2023). Bloquea el calendario del Máster con un requisito que la presentación no pide.
❌ Revisión de Google + políticas de apps financieras: fricción y tiempos no controlables.
❌ Riesgo alto de acoplar la nota del Máster a un proceso externo.

### Opción C — EAS Build con distribución interna ✅ (elegida)

Compilar en la nube con EAS Build usando `"distribution": "internal"`: produce un **APK firmado** y una **URL/QR de instalación** que cualquier Android puede abrir e instalar directamente (habilitando "instalar apps de fuentes desconocidas").

✅ **Instalable por los evaluadores** con solo abrir un link/QR — sin store, sin revisión, sin testers mínimos.
✅ Free tier de EAS suficiente: **15 builds Android/mes**, más que suficiente para el ciclo de demo.
✅ Firma (keystore) **gestionada por EAS** — cero fricción de firma para quien nunca ha desplegado mobile.
✅ Mismo comando y misma config (`eas.json`) que se usará después para el store: **todo lo aprendido transfiere** a la Opción B futura.
✅ Coherente con ADR-010 App Mobile: el perfil interno genera un build standalone del mismo proyecto dev-client.
⚠️ El link de instalación debe tratarse como **secreto de facto** (ver Seguridad).
⚠️ Requiere cuenta Expo (gratuita) y aceptar que el build corre en infraestructura de Expo.

### Opción D — Build local (`eas build --local` / `expo run:android --variant release`)

Compilar el APK en la máquina propia con el Android SDK.

✅ Sin límite de builds ni dependencia de la nube de Expo.
✅ Útil como plan B si se agota el free tier o EAS está caído el día de la demo.
❌ Exige instalar y mantener Android SDK/Gradle localmente — justo la fricción nativa que ADR-010 App Mobile eligió evitar.
❌ La distribución a evaluadores queda manual (pasar el APK por otro canal).
→ **Se adopta como respaldo**, no como ruta principal.

### iOS — diferido

Sin cuenta Apple Developer no hay distribución ad-hoc ni TestFlight; la firma personal gratuita expira a los 7 días y solo sirve para el dispositivo propio. **La demo iOS, si se necesita, se hace en el simulador de Xcode.** iOS físico queda condicionado a pagar la cuenta (USD 99/año), decisión que se toma después del Máster.

---

## Decisión

**La ruta de despliegue mobile para la demo del Máster es EAS Build con distribución interna sobre Android: APK firmado por EAS, compartido a los evaluadores vía URL/QR. La publicación en stores se mantiene como objetivo de estudio continuo pero deja de ser prioridad y no bloquea nada.**

| Pieza | Decisión |
|---|---|
| Plataforma de demo | **Android físico** (teléfono del desarrollador + evaluadores) |
| Build | EAS Build, perfil `preview` con `"distribution": "internal"` → APK |
| Distribución | URL/QR de instalación que genera EAS por cada build |
| Firma | Keystore Android **gestionado por EAS** (no vive en el repo ni en el laptop) |
| Backend de la demo | El entorno desplegado de ADR-004 Hosting (Render + Supabase prod/demo) — la app instalada consume la API real por HTTPS |
| iOS | Diferido; simulador si hace falta mostrarlo |
| Play Store | **Diferida, no descartada**: pista *internal testing* (hasta 100 testers, sin requisito de 14 días) como siguiente paso de aprendizaje; producción (closed test 12×14) post-Máster |

### Configuración objetivo (`apps/mobile/eas.json`)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

- `development` → dev-client para el día a día (ADR-010 App Mobile).
- `preview` → **el perfil de esta decisión**: APK standalone instalable para la demo.
- `production` → AAB para Play Store; queda definido pero sin uso hasta retomar la Opción B.

### Flujo de demo

```
pnpm --filter @moneydiary/mobile exec eas build --profile preview --platform android
        │
        ▼
EAS compila y firma → URL/QR de instalación
        │
        ├── Desarrollador: instala en su Android
        └── Evaluadores: escanean QR → instalan APK
                │
                ▼
        App consume GET /api/resumen, /api/movimientos
        contra el backend de Render (ADR-004)
```

---

## Seguridad

- **El link de instalación es un canal de distribución sin autenticación:** se comparte solo con los evaluadores, nunca se publica. Un APK de una app financiera circulando libre es superficie de ataque gratuita.
- **Keystore fuera del repo:** la firma la custodia EAS. Nunca commitear keystores ni credenciales de firma (RNF-SEC-005, control I-05 del Threat Model — App de Finanzas Personales).
- **Sin secretos en el build:** el APK solo conoce la `baseUrl` pública de la API. Autenticación y token viven en `expo-secure-store` en runtime (ADR-010 App Mobile, ADR-012 packages api-client). Variables de build sensibles → EAS environment variables, no `eas.json`.
- **Datos de la demo:** el ambiente controlado usa **cuenta/datos demo**, no cartolas personales reales del desarrollador, en línea con ADR-013 Cifrado de Datos en Reposo y el scrubbing de montos ya implementado en el backend.
- **"Fuentes desconocidas":** instalar por APK exige que los evaluadores habiliten instalación fuera de Play. Es aceptable en ambiente controlado y con dispositivos de los propios evaluadores; es exactamente el caso de uso para el que existe la distribución interna.
- **OTA updates (EAS Update):** fuera del alcance de la demo. Si se habilitan después, aplica la nota de ADR-010 App Mobile: canales controlados y firmados.

---

## Consecuencias

**Positivas:**
- **La demo del Máster deja de depender de procesos externos** (revisión de Google, 12 testers × 14 días): el camino crítico vuelve a estar bajo control del desarrollador.
- **Los evaluadores usan la app en su propio celular** — mejor evidencia de producto que un video o un emulador, y alimenta la validación de ADR-014 Técnicas de Validación de Requisitos (demo + usabilidad).
- **Todo el trabajo transfiere al store:** `eas.json`, la cuenta Expo, el flujo de build y la disciplina de firma son los mismos que exigirá Play Store. No es un desvío, es la primera etapa de la misma ruta.
- **Costo cero adicional:** free tier de EAS (15 builds/mes) + cuenta Play ya pagada esperando su momento.

**A tener en cuenta:**
- **15 builds Android/mes** en el free tier: los builds de demo se hacen con intención, no en cada commit. Respaldo: build local (Opción D).
- **iOS queda sin demo en dispositivo físico** hasta pagar Apple Developer. Riesgo aceptado: la presentación se cubre con Android + simulador.
- **La pista de producción de Play sigue pendiente** y el requisito 12×14 seguirá ahí post-Máster; conviene arrancar el closed test con tiempo cuando se retome.
- **Dependencia de la nube de EAS** el día que se genera el build: generar el APK de la demo **con días de anticipación**, no la mañana de la presentación.
- `apps/mobile` aún no está scaffoldeado (ADR-017 Testing Mobile lo excluyó del workspace): esta decisión fija la ruta de despliegue **antes** del scaffolding, para que `eas.json` nazca con los perfiles correctos.

---

## No incluido en este ADR (decisiones futuras)

- **Publicación real en Play Store** (closed test 12×14, ficha, políticas de apps financieras): post-Máster.
- **iOS en dispositivo físico / TestFlight:** condicionado a la cuenta Apple Developer.
- **EAS Update (OTA)** y canales de actualización.
- **CI/CD del build mobile** (integrar `eas build` a GitHub Actions, ADR-004 Hosting): cuando el build sea recurrente, no para la demo.
- **Estrategia de autenticación mobile** (pendiente desde ADR-010 App Mobile).

---

## Referencias

- ADR-004 Hosting — despliegue web/backend, que no cambia y sirve de backend a la demo
- ADR-010 App Mobile — stack mobile; dejó la distribución como decisión futura → resuelta aquí
- ADR-012 packages api-client — cliente HTTP que la app instalada usa contra la API desplegada
- ADR-013 Cifrado de Datos en Reposo — datos demo, no reales, en el ambiente controlado
- ADR-014 Técnicas de Validación de Requisitos — la demo instalada alimenta demos/usabilidad
- [Expo — Internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Expo — Build APKs for Android devices](https://docs.expo.dev/build-reference/apk/)
- [Expo — Tutorial: internal distribution builds](https://docs.expo.dev/tutorial/eas/internal-distribution-builds/)
- [Google Play — App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google Play — Set up an open, closed, or internal test](https://support.google.com/googleplay/android-developer/answer/9845334)

---

*Fecha de decisión: 2026-07-14*
