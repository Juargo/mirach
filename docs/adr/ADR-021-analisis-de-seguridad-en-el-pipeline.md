---
tags:
  - adr
  - fase-diseño
  - toolchain
  - seguridad
  - devsecops
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-12
fecha_actualizacion: 2026-07-12
---

# ADR-021 — Análisis automatizado de seguridad en el pipeline (SCA + DAST + SAST + secretos)

## Estado

✅ **Decidido** — herramientas OSS/gratuitas sobre GitHub Actions (ADR-004 Hosting y Despliegue). Se aplican en `apps/api` y `apps/web` con el MVP; `apps/mobile` se suma al scaffoldearse (post-MVP, ADR-010 App Mobile).

---

## Contexto

MoneyDiary maneja datos financieros (montos, RUT, cuentas, tokens) y tiene la seguridad como valor central. Hoy las verificaciones de seguridad son mayormente **manuales**: `pnpm audit` a mano, el checklist de peer review de ADR-015 Técnicas de Verificación de Requisitos y las defensas de instalación de ADR-006 Package Manager (`minimum-release-age`, `block-exotic-subdeps`, `overrides`). No hay **análisis automatizado en CI** que bloquee un merge por una dependencia vulnerable, un endpoint inseguro, un patrón de código riesgoso o un secreto commiteado.

Se decide incorporar **análisis automatizado en el pipeline** cubriendo cuatro capas complementarias, todas con herramientas **open source / gratuitas** integradas en **GitHub Actions**:

1. **SCA** (dependencias) — vulnerabilidades y supply-chain.
2. **DAST** (endpoints) — la API corriendo, dirigido por el contrato OpenAPI.
3. **SAST** (código) — patrones inseguros en el fuente.
4. **Secret scanning** — credenciales/tokens que no deben commitearse.

**Habilitador clave:** el **contrato OpenAPI** (ADR-011 Contrato-first OpenAPI) permite escaneo de endpoints *dirigido por el esquema* (importar `openapi.json` y derivar los casos), en vez de configurar rutas a mano.

**Principio rector:** ninguna capa sola basta; se combinan. Y —crucial— **estas herramientas son gates de CI, no un sustituto** de los tests de aislamiento por `user_id` ni del peer review de ADR-015 Técnicas de Verificación de Requisitos.

---

## Dos límites que la decisión fija de entrada

1. **El DAST necesita la app corriendo → NUNCA contra Supabase real.** El escaneo activo fuzzea endpoints y **muta/contamina datos**. Debe correr contra un **entorno efímero con BD de test** (levantado en el job de CI), igual que el e2e de `api` (mismo riesgo ya identificado en los quality gates). Apuntarlo a producción o a la BD real está prohibido.

2. **La autorización a nivel de objeto (BOLA/IDOR — OWASP API #1) NO la detecta bien el DAST genérico.** El aislamiento por `user_id` (RNF-SEC-006) se verifica con **tests de integración dedicados** (ADR-015 Técnicas de Verificación de Requisitos), no con ZAP. El DAST **complementa**; no reemplaza esos tests.

---

## Opciones Evaluadas (por capa, filosofía OSS/gratis-first)

### Capa 1 — SCA (dependencias)

- **Dependabot** ✅ — gratis y nativo de GitHub; alertas + **PRs automáticos de parche**. Es el "arreglar". No hace reachability ni SBOM, pero cubre el loop de actualización sin coste.
- **`pnpm audit --audit-level=high` como job de CI** ✅ — convierte la auditoría manual de ADR-006 Package Manager en **gate bloqueante**. Es el "hacer cumplir".
- **Socket.dev (GitHub App, free tier)** ✅ opcional-recomendado — detecta **paquetes maliciosos por comportamiento** (install scripts, exfiltración), no solo CVEs. Encaja de lleno con la postura anti-supply-chain del proyecto y va más allá del heurístico de edad.
- **Trivy** (OSS) — diagnóstico profundo + SBOM; se deja como opción para generar SBOM si se requiere, no como gate primario.
- **Snyk** — descartado como primario: su valor (BD propia, reachability) vive tras plan de pago; contradice el criterio gratis-first.

### Capa 2 — DAST (endpoints, dirigido por OpenAPI)

- **OWASP ZAP – API Scan** ✅ (GitHub Action) — importa `openapi.json`, fuzzea contra el OWASP API Top 10 (inyección, headers, auth, misconfig). Perfil *baseline* (rápido, en cada PR) + *full/active* (semanal, más lento).
- **Schemathesis** ✅ (OSS) — tests **property-based** generados desde el OpenAPI; encuentra edge-cases y rupturas de contrato. Encaja con el enfoque contract-first (ADR-011 Contrato-first OpenAPI) y corre como test más.
- **Escaneo estático del `openapi.json`** (p. ej. 42Crunch free / reglas propias) — barato, detecta problemas en el **propio contrato** antes de levantar la app.
- **StackHawk** — descartado como primario (SaaS free-tier) por la elección gratis-first; ZAP cubre lo mismo con más configuración.

### Capa 3 — SAST (código)

- **Semgrep (OSS)** ✅ — reglas para inyección, authz, secretos hardcodeados, malas prácticas TS/Node/React; **gratis vía CLI/Action también en repos privados**. Elegido como SAST primario.
- **CodeQL** ✅ condicional — gratis y nativo **si el repo es público** (o si se dispone de GitHub Advanced Security). Añadirlo cuando aplique; si el repo es privado sin GHAS, quedarse con Semgrep.
- **Bearer** — alternativa OSS enfocada a flujos de datos sensibles/PII; se menciona como candidata futura (útil por el perfil financiero).

### Capa 4 — Secret scanning

- **gitleaks (OSS)** ✅ — detecta credenciales/tokens en el código y el historial; corre como **job de CI** y, opcionalmente, como **hook pre-commit** (ADR-020 Git Hooks Husky Monorepo) para atajar el secreto antes del commit.
- **GitHub secret scanning + push protection** ✅ condicional — gratis en repos públicos; activarlo si aplica. En privado sin GHAS, gitleaks es la vía gratis.

---

## Decisión

**Cuatro capas OSS/gratuitas en GitHub Actions, ubicadas según su coste de ejecución:**

| Capa | Herramienta (elegida) | Rol |
|---|---|---|
| **SCA** | Dependabot + `pnpm audit --audit-level=high` (+ Socket.dev opcional) | Parche automático + gate de vulnerabilidades + supply-chain |
| **DAST** | OWASP ZAP API scan + Schemathesis (desde `openapi.json`) | Fuzzing de endpoints contra entorno efímero |
| **SAST** | Semgrep (CodeQL si el repo es público/GHAS) | Patrones inseguros en el código |
| **Secretos** | gitleaks (+ GitHub secret scanning si público) | Credenciales/tokens fuera del repo |

### Ubicación en el pipeline

| Momento | Qué corre | Por qué ahí |
|---|---|---|
| **pre-commit** (local, ADR-020) | gitleaks (rápido) | Atajar el secreto antes de que entre al historial |
| **En cada PR** (CI) | `pnpm audit` gate · Semgrep · gitleaks (full) · ZAP *baseline* + Schemathesis contra **entorno efímero** | Feedback por PR sin penalizar demasiado |
| **Programado** (nightly/weekly) | Dependabot (updates) · ZAP *full/active scan* | Escaneos lentos fuera del camino crítico |
| **Gate real** | Todo lo anterior en CI + tests de aislamiento `user_id` + peer review | La seguridad no depende de hooks locales (ADR-020 Git Hooks Husky Monorepo) |

### Reglas de severidad (evitar el ruido)

- **Bloquean el merge:** vulnerabilidades `high`/`critical` de SCA, hallazgos `high` de SAST, cualquier secreto detectado, y fallos de contrato/`5xx` inesperados del DAST.
- **Advierten (no bloquean):** `moderate`/`low`, para no ahogar a un solo desarrollador en falsos positivos. Se triagean, no se ignoran.
- Los umbrales se afinan; empezar estricto en secretos y dinero, tolerante en el resto (coherente con el énfasis risk-based de ADR-015 Técnicas de Verificación de Requisitos).

#### Enmienda 2026-09-04 — indisponibilidad ≠ hallazgo

`pnpm audit` sale con exit 1 tanto si **encuentra** vulnerabilidades como si **no puede
consultar** el feed de advisories. Tratar ambos casos como "bloquea el merge" hace que una
caída de npm frene el trunk sin que exista ningún hallazgo: el 2026-09-04 el endpoint
`/-/npm/v1/security/advisories/bulk` devolvió `503` durante horas y bloqueó el PR #557 en dos
corridas consecutivas.

La regla se precisa así:

- **Hallazgo `high`/`critical` → bloquea.** Sin cambios respecto de la decisión original.
- **Registry inalcanzable → reintenta (3 intentos, backoff 60s/120s) y, si nunca responde,
  degrada a `::warning::` y deja pasar.**

El segundo caso es un **degradado abierto deliberado**: el job termina en verde sin haber
verificado el SCA, y el warning queda visible en el summary. Se asume porque la alternativa
—trunk bloqueado por la disponibilidad de un tercero— es peor, y porque las defensas de
instalación de ADR-006 (`minimum-release-age`, `block-exotic-subdeps`, `overrides`) siguen
activas aunque el audit no corra. Si la indisponibilidad se vuelve frecuente, la respuesta
correcta es **cachear el feed de advisories**, no ampliar el degradado a otras causas de fallo.

#### Enmienda 2026-09-04 — el DAST pasa de advisory a bloqueante

El job `dast` nació con `continue-on-error: true` a propósito: la decisión de
`dast-ci-wiring` (tarea 4.1) fue arrancar en modo advisory y promover *después de
un período de rodaje*, porque un DAST nuevo es ruidoso y ADR-021 pide triage antes
de bloquear. El rodaje terminó, pero no como se esperaba: el escaneo estuvo **roto
un mes** (una dependencia transitiva rompió Schemathesis y el `continue-on-error`
se tragó el exit 1 — ver #565). Reparado eso, tres corridas consecutivas en `main`
dieron idéntico y limpio: `✅ Fuzzing`, 15/35 operaciones, 825 casos generados y
pasados, 0 `Runtime Error`; ZAP con `FAIL-NEW: 0 · WARN-NEW: 4 · PASS: 115`.

La promoción **separa severidad** en vez de prender un interruptor:

- **Bloquean el merge:** exit≠0 de Schemathesis (5xx / no-conformidad con el
  contrato), **malfunción del scanner** (`Runtime Error` — la herramienta se
  rompió, esas operaciones no se escanearon), **no-op** de cualquiera de los dos
  (`Selected: 0/`, reporte de ZAP sin sitios) y alertas **High** de ZAP.
- **Advierten:** los `WARN` de ZAP. Hoy son 4, todos de headers (`X-Powered-By`,
  `X-Content-Type-Options`, CORP, content-types inesperados). Coherente con la
  regla de arriba: moderate/low se triagean, no bloquean.

Detalle que no es obvio: el step de ZAP conserva `fail_action: false`. La acción
falla ante `WARN` igual que ante `FAIL`, así que activarla convertiría los cuatro
warnings de headers en un bloqueo — justo lo que esta ADR dice que no debe pasar.
La severidad se gatea en un step aparte que lee `zap-report.json` y solo falla con
`riskcode >= 3`. **Sin ese step, ZAP no podría fallar nunca y su aporte al gate
sería decorativo**: exactamente el modo de falla que el mes anterior demostró que
es el más caro, porque no se ve.

#### Enmienda 2026-09-05 — la capa SAST entra en CI (Semgrep), bloqueante desde el día uno

La capa 3 estaba decidida pero sin cablear. Se agrega el job `sast`: Semgrep OSS
por `uvx` con versión pinneada (1.175.0), igual patrón que Schemathesis en `dast`.
Rulesets `p/typescript` + `p/owasp-top-ten`, cubriendo lo que esta ADR pedía —
inyección, authz, secretos hardcodeados y malas prácticas TS/Node/React.

**Nace bloqueante, no advisory.** El escaneo sobre el árbol actual da **0
hallazgos en 1052 archivos**, así que no hay ruido que triagear antes de gatear.
Un gate advisory sobre una base limpia es la peor combinación: no protege nada y
se degrada sin que nadie lo note — que es literalmente lo que le pasó al DAST
durante un mes.

El gate separa **tres** desenlaces que un exit code solo no distingue:

- **malfunción** (semgrep no produjo reporte) → bloquea
- **no-op** (escaneó 0 archivos) → bloquea
- **hallazgos**: `ERROR` bloquea, `WARNING` advierte

Los archivos que semgrep no logra parsear se reportan como `::warning::` con su
conteo. Hoy son 3 (huecos conocidos del parser de TS con genéricos en `.tsx` y
un tipo `import()`); no bloquean, pero quedan visibles para que el número no
crezca en silencio dejando superficie sin cubrir.

**Los dos hallazgos del primer escaneo fueron falsos positivos**, y se
documentan porque el triage es parte de la decisión, no un trámite:

- `gcm-no-tag-length` en `aes-gcm-crypto.service.ts` — la regla asume el Node ≤10
  que aceptaba auth tags truncados. Verificado empíricamente que Node ≥11 los
  rechaza con `ERR_CRYPTO_INVALID_AUTH_TAG` sin necesidad de la opción. Se agrega
  igual `authTagLength: 16` porque cuesta cero y vuelve el invariante explícito
  en vez de heredado del default de la versión — **es endurecimiento, no el
  arreglo de una vulnerabilidad viva**.
- `cors-misconfiguration` en `cors.middleware.ts` — la regla marca reflejar
  `origin` en `Access-Control-Allow-Origin`, pero la línea está guardada por una
  allowlist cerrada (`allowed.has(origin)`). Suprimido con `nosemgrep` **y su
  justificación escrita al lado**: una supresión sin motivo es la misma clase de
  deuda que los comentarios envejecidos del baseline de SCA.

**CodeQL**: esta ADR lo dejó como "✅ condicional — si el repo es público". El
repo **es público**, así que la condición se cumple y CodeQL está disponible y
gratis. Queda como trabajo aparte; Semgrep es el primario y ya cubre la capa.

---

## Consecuencias

**Positivas:**

- **DevSecOps real y a coste cero:** las cuatro capas corren en GitHub Actions sin licencias, coherente con el proyecto TFM.
- **Automatiza lo que hoy es manual:** `pnpm audit`, revisión de secretos y patrones inseguros pasan de "acuerdo/checklist" a **gate ejecutable**.
- **Aprovecha el contrato OpenAPI:** el DAST se dirige solo desde `openapi.json` — sinergia directa con ADR-011 Contrato-first OpenAPI.
- **Supply-chain reforzado:** Dependabot + Socket.dev cubren tanto CVEs conocidas como paquetes maliciosos, extendiendo las defensas de instalación de ADR-006 Package Manager al tiempo de ejecución del pipeline.
- **Defensa en capas:** secretos atajados en pre-commit y re-verificados en CI; dependencias en install-time (ADR-006) y en CI.

**A tener en cuenta:**

- **El DAST exige un entorno efímero con BD de test** (nunca Supabase real). Montar ese job es trabajo de CI no trivial; hasta tenerlo, el DAST activo queda deshabilitado (no se apunta a la BD real "provisionalmente").
- **BOLA/IDOR no lo cubre el DAST:** el aislamiento por `user_id` se sigue verificando con tests de integración (ADR-015 Técnicas de Verificación de Requisitos). El ADR no debe dar falsa sensación de cobertura.
- **Ruido/falsos positivos:** con un solo desarrollador, hay que **triagear** y ajustar severidades, o los gates se vuelven ignorables. Empezar con pocas reglas de alto valor.
- **CodeQL/GitHub secret scanning dependen de que el repo sea público o de GHAS;** en privado sin GHAS, Semgrep + gitleaks cubren el hueco gratis.
- **Tiempo de CI:** ZAP full y Schemathesis alargan los jobs → por eso el *full scan* va programado, no en cada PR.
- **Mantenimiento de reglas:** Semgrep/ZAP requieren mantener/ajustar rulesets; es trabajo recurrente, no "instalar y olvidar".

---

## Referencias

- [OWASP ZAP — API Scan (GitHub Action)](https://github.com/zaproxy/action-api-scan)
- [Schemathesis](https://schemathesis.readthedocs.io/)
- [Semgrep](https://semgrep.dev/)
- [gitleaks](https://github.com/gitleaks/gitleaks)
- [Dependabot](https://docs.github.com/en/code-security/dependabot)
- [Socket.dev](https://socket.dev/)
- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- ADR-004 Hosting y Despliegue
- ADR-006 Package Manager
- ADR-011 Contrato-first OpenAPI
- ADR-013 Cifrado de Datos en Reposo
- ADR-015 Técnicas de Verificación de Requisitos
- ADR-020 Git Hooks Husky Monorepo

---

*Fecha de decisión: 2026-07-12 · Última actualización: 2026-07-12*
