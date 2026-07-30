---
tags:
  - adr
  - fase-diseño
  - mobile
  - ingesta
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-19
fecha_actualizacion: 2026-07-19
---

# ADR-026 — Ingesta desde mobile: la app gana una única capacidad de escritura (subir cartola), acotada

## Estado

✅ **Decidido** (2026-07-19, planning de Sprint-8) — enmienda el alcance de ADR-010 App Mobile. Habilita US-033. La **construcción** ocurre en Sprint 8; esta decisión desbloquea esa construcción (US-033 CA-05).

> [!info] Relación con ADR-010
> No reemplaza a ADR-010 App Mobile (stack y arquitectura mobile siguen vigentes). **Revisa una sola premisa** suya: que "la captura de cartolas seguirá siendo un flujo mayormente de escritorio". A partir de aquí, mobile también puede capturar — pero **solo** eso.

---

## Contexto

ADR-010 App Mobile definió la app Expo alrededor de la **consulta** ("una app de finanzas se consulta desde el teléfono") y asumió que la **captura de cartolas** sería "un flujo mayormente de escritorio". El MVP del Sprint-3 concretó esa premisa shippeando la app como **solo-lectura**: consume `GET /api/resumen` y nada más.

El Sprint-8 cambia esa premisa por decisión de producto: la sección de "subir archivo de transacciones" se pide **en web y en mobile** (no solo web). El motivo es real, no cosmético:

- La cartola bancaria muchas veces **llega al teléfono** — el usuario la exporta desde la app del banco o la recibe por correo en el celular. Obligarlo a pasar al escritorio para subirla rompe el flujo justo donde está.
- El backend de ingesta (`POST /api/ingestas`) ya está **atado a sesión** (`@CurrentUser()`) y acepta `.xlsx`/`.pdf`. Mobile ya tiene sesión Bearer (Slice 4 de Sprint-6). **No falta backend ni transporte** — solo falta habilitar la superficie de captura en el cliente mobile.

El punto de decisión es de **alcance**, no de tecnología: ¿mobile pasa a escribir "un poco" (solo ingesta) o "en serio" (también editar transacciones/categorías)? Escribir sin acotar erosiona la frontera limpia que ADR-010 defendió (consulta en el teléfono, escritura pesada en escritorio).

---

## Opciones Evaluadas

### Opción A — Mantener mobile solo-lectura; subir solo en web

Dejar ADR-010 intacto; la ingesta vive únicamente en `apps/web`.

✅ Cero cambio de arquitectura mobile; frontera de ADR-010 sin tocar.
✅ Menos superficie nativa (sin document picker, sin FormData en RN).
❌ **No cumple el requisito de producto** del Sprint 8 (subir "tanto en demo como en la app", con mobile incluido por decisión de PO).
❌ Ignora que la cartola a menudo ya está en el teléfono — fricción real para el usuario.

### Opción B — Paridad de escritura completa en mobile

Mobile puede subir cartola **y** editar transacciones/categorías (US-013) como la web.

✅ Experiencia mobile "completa".
❌ **Scope creep grave** (YAGNI): edición inline ni siquiera está hecha en web todavía (US-013 pendiente). Duplicar una superficie que aún no existe es construir sobre arena.
❌ Superficie nativa y de UX mucho mayor (formularios, validación inline, estados de edición) para un solo desarrollador.
❌ Diluye la frontera de ADR-010 sin una necesidad demostrada.

### Opción C — Escritura acotada: solo ingesta ✅ (elegida)

Mobile gana **una** capacidad de escritura: subir cartola vía `POST /api/ingestas`. Todo lo demás sigue siendo consulta.

✅ Cumple el requisito de producto (captura donde está el usuario) con el **mínimo** cambio de superficie.
✅ Reusa endpoint, contrato y transporte existentes — **sin API nueva ni credencial nueva**.
✅ Mantiene la frontera de ADR-010 casi intacta: la única grieta es explícita y pequeña (ingesta), no un portón abierto a "mobile hace todo".
✅ Coherente con KISS/YAGNI: se habilita lo que se pidió, no lo que "podría hacer falta".
⚠️ Introduce `expo-document-picker` y `FormData` en RN — superficie nativa nueva, aunque acotada.

---

## Decisión

**La app mobile gana una única capacidad de escritura: subir una cartola bancaria (`.xlsx`/`.pdf`) mediante `POST /api/ingestas`. Toda otra escritura (editar transacciones, categorías, gestión de ingestas) queda fuera y sigue siendo consulta.**

Reglas que fija esta decisión:

1. **Selector nativo acotado:** `expo-document-picker` (Expo SDK 57), limitado a `.xlsx`/`.pdf`. El filtro del picker es conveniencia; el backend sigue siendo la **autoridad** de validación (extensión, tamaño ≤10 MB, estructura).
2. **Mismo endpoint, mismo transporte:** `POST /api/ingestas` con `Authorization: Bearer <token>` + `x-api-key`. No se crea endpoint mobile-específico ni una segunda ruta de credenciales.
3. **Frontera de ADR-010 preservada:** se comparte **solo el contrato HTTP** (ADR-011/012). La pantalla de subida mobile es UI propia (NativeWind), no compartida con web.
4. **Escritura acotada a ingesta:** editar transacciones/categorías (US-013) **no** entra por esta puerta. Si algún día se quiere, es otro ADR con su propia justificación.
5. **Sin modo demo en mobile:** la subida mobile es solo autenticada; el modo demo (Sprint 7) es una superficie web.

---

## Seguridad

- **Sin credencial nueva:** el token de sesión ya vive en `expo-secure-store` (ADR-010 / Slice 4 de Sprint-6) y la `x-api-key` ya viaja en el build mobile vía EAS Secrets (nunca hardcodeada). La subida **reusa** ambos; no abre una superficie de secretos nueva.
- **El backend valida, no el cliente:** el filtro `.xlsx`/`.pdf` del picker es UX; extensión, tamaño y estructura los impone `POST /api/ingestas` (defensa en profundidad). Un archivo malicioso renombrado no pasa la validación de servidor.
- **Archivo en tránsito, no en reposo:** el archivo se envía como multipart desde el `uri` del picker; la app no lo persiste localmente más allá del temporal del sistema.
- **Aislamiento por `userId`:** la ingesta queda bajo el usuario autenticado (RNF-SEC-006), igual que en web — sin ruta anónima.
- **Sin PII nueva expuesta:** la subida no lee de vuelta datos sensibles; el riesgo aceptado 11.6 (cifrado de columna, ADR-013) no cambia con este ADR.

---

## Consecuencias

**Positivas:**
- **Cierra la brecha de captura:** el teléfono deja de ser solo un visor; puede **onboardear datos** justo donde la cartola suele llegar. Es la funcionalidad que más acerca el "momento semáforo" (RN-MET-001) al lugar real del usuario.
- **Costo mínimo:** al reusar endpoint, contrato y auth, el cambio es casi todo UI mobile (picker + estados + resultado). No toca dominio, API ni web.
- **Frontera todavía nítida:** la excepción a ADR-010 es única y nombrada (ingesta), no una erosión difusa de "mobile ahora escribe".

**A tener en cuenta:**
- **Superficie nativa nueva:** `expo-document-picker` puede requerir config/permiso en algún target; verificar en dispositivo real (Maestro manual, ADR-017). `FormData` con `uri` de archivo en RN tiene particularidades (nombre/tipo MIME explícitos).
- **La premisa de ADR-010 queda parcialmente revisada:** "captura mayormente de escritorio" pasa a "captura también posible en mobile". Documentado como enmienda, no como contradicción silenciosa.
- **Presión de scope futura:** habilitar ingesta invita a pedir "¿y editar también?". Este ADR fija el límite explícito para poder decir *no* con fundamento (ver Opción B).
- **Testing:** aplica ADR-017 (jest-expo + RNTL para la lógica de subida; Maestro manual para el picker nativo, que no corre en CI).

---

## No incluido en este ADR

- **Edición inline de transacciones/categorías en mobile** (US-013) — sigue fuera; la app solo gana ingesta.
- **Modo demo en mobile** — el demo (Sprint 7) es superficie web.
- **Barra de progreso de bytes real** — basta indicador indeterminado para el MVP (diferido).
- **Gestión/borrado de ingestas desde mobile** (US-018) — no entra por esta puerta.

---

## Referencias

- ADR-010 App Mobile — decisión que este ADR enmienda (premisa de captura de escritorio)
- ADR-011 Contrato-first OpenAPI / ADR-012 packages api-client — contrato único que la subida mobile reusa
- ADR-017 Testing Mobile — jest-expo + RNTL + Maestro (aplica a la subida)
- ADR-007 Libreria Parseo Excel / ADR-009 Libreria Parseo PDF — formatos aceptados por el backend de ingesta
- ADR-013 Cifrado de Datos en Reposo — riesgo aceptado 11.6 (no cambia con este ADR)
- US-033 / Sprint-8 — historia y sprint que originan la decisión
- [expo-document-picker](https://docs.expo.dev/versions/latest/sdk/document-picker/)

---

*Fecha de decisión: 2026-07-19*
