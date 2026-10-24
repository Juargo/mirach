---
tipo: adr
proyecto: Mirach
estado: Propuesto
fecha: 2026-10-24
requisitos: [RNF-FIA-003, RNF-SEC-001, RNF-SEC-004, PUB-06]
---

# ADR-008 — CI/CD, estrategia de ramas y releases

## Estado

Propuesto (2026-10-24). Ramas, CI, hooks, release-please y deploy automático del API y la
landing están funcionando (**vigente**). El chequeo de compatibilidad del contrato, la
automatización de builds móviles y el lanzamiento escalonado son **nuevos**.

## Contexto

- Un desarrollador, a veces con varios agentes de código en paralelo.
- Tres artefactos con ciclos distintos: el API se despliega en minutos; las apps pasan por
  la revisión de las tiendas y conviven con versiones viejas instaladas.
- Los hooks locales se pueden saltar con `--no-verify`: el control real tiene que estar
  en CI.

## Decisión

### 1. Ramas: GitHub Flow (vigente)

- `main` es la única rama de larga vida, protegida: PR obligatorio, checks `CI success` y
  `Commitlint` en verde, rama al día con `main`, sin force-push ni borrado, también para
  administradores.
- Ramas cortas `tipo/descripcion` (`feat/perfil-presupuesto`, `fix/clave-duplicado`).
- Trabajo en paralelo con `git worktree`, una rama por worktree.
- Commits con Conventional Commits, validados por commitlint en local y en CI.

### 2. Hooks locales (vigente, conveniencia)

| Hook | Qué corre |
|------|-----------|
| `pre-commit` | lint-staged: ESLint con `--fix` en los archivos tocados |
| `commit-msg` | commitlint |
| `pre-push` | Pruebas de los workspaces afectados |

### 3. Integración continua (vigente)

GitHub Actions con filtros por ruta: un PR paga solo por lo que toca, y un push a `main`
corre todo. El job `CI success` agrega el resultado de todos.

| Job | Qué verifica | Bloquea |
|-----|--------------|---------|
| Commitlint | Mensajes de commit | Sí |
| API | `tsc`, ESLint, `.env.example` derivado del esquema, `openapi.json` al día, pruebas unitarias, build de producción | Sí |
| Integración y e2e | Pruebas contra PostgreSQL efímero, con llave de cifrado generada por corrida | Sí |
| DAST | El API compilado contra base efímera: Schemathesis (fuzzing autenticado desde el contrato) y ZAP | Sí, ante fallas de Schemathesis y alertas altas de ZAP |
| SAST | Semgrep (`p/typescript`, `p/owasp-top-ten`) | Sí, ante hallazgos de severidad ERROR |
| Seguridad | `pnpm audit --audit-level=high`, gitleaks | Sí |
| Landing | `astro check`, build, búsqueda de secretos en el bundle, smoke test | Sí |
| iOS | Cliente generado y tokens al día, build y pruebas en simulador (runners macOS, en paralelo) | Sí |
| Android | Tokens al día, pruebas unitarias, `assembleDebug`, Android Lint | Sí |

Las acciones de terceros se fijan por SHA y el workflow corre con permisos mínimos.

**Nuevo:**

- `oasdiff` compara `openapi.json` del PR con el de `main` y falla ante un cambio
  incompatible (ADR-005).
- Chequeo de paridad: falla si un escenario `APP-*` marcado para ambas plataformas no tiene
  prueba en una de ellas (ADR-010).
- Verificación de límites entre módulos del API (ADR-001).

### 4. Versionado y releases (vigente)

- Versión semver independiente por paquete. release-please lee los Conventional Commits,
  abre el PR de release con el changelog y crea la etiqueta `<paquete>-vX.Y.Z`.
- Hoy cubre `apps/api` y `apps/landing`. **Nuevo:** sumar `apps/ios` y `apps/android`; la
  versión visible la decide release-please y el número de build se incrementa en cada
  subida a la tienda.

### 5. Despliegue continuo

| Artefacto | Cómo llega a producción | Rollback |
|-----------|-------------------------|----------|
| API | Render despliega cada push a `main` que toca `apps/api` (filtro de build) y valida el health check antes de cambiar el tráfico | Volver al deploy anterior en Render; seguro porque las migraciones son expandir y contraer |
| Migraciones | Hoy a mano, antes del merge (expandir) o después del deploy (contraer). Con plan pagado, `prisma migrate deploy` como comando previo al deploy (ADR-004) | Migración inversa explícita |
| Landing | Vercel despliega `main`; cada PR tiene vista previa | Promover el deploy anterior |
| App iPhone | Hoy: archivo manual en Xcode y subida a TestFlight. **Nuevo:** lane de fastlane (o Xcode Cloud) que compila, firma y sube a TestFlight al crear la etiqueta `ios-v*` | No se puede retirar una versión instalada; se publica una corrección y se sube la versión mínima en `GET /api/config` |
| App Android | Hoy: `bundleRelease` manual y subida a Play Console. **Nuevo:** lane que sube el AAB a la pista interna al crear la etiqueta `android-v*` | Detener el lanzamiento escalonado y publicar corrección |

**Lanzamiento a producción de las apps (nuevo):**

1. TestFlight y prueba cerrada de Play con el grupo de prueba (PUB-06).
2. Publicación escalonada: lanzamiento por fases de Apple (7 días) y lanzamiento escalonado
   de Play (10 % → 50 % → 100 %).
3. Se avanza solo si la tasa de sesiones sin crash es ≥ 99,5 % (ADR-011).

### 6. Secretos

- Variables del API en el panel de Render (`sync: false` en `render.yaml`).
- Llaves de firma de Android y certificados de Apple fuera del repo; en CI como GitHub
  Secrets cuando se automaticen los builds.
- `secrets.properties` (Android) y la configuración local de iOS están en `.gitignore`.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| GitFlow | Ramas `develop` y `release` sobran con un desarrollador y chocan con release-please y el deploy desde `main`. |
| Trunk-based sin PR | Incompatible con la protección de `main` y con la revisión de seguridad por PR. |
| Desplegar el API por etiqueta | El deploy por push a `main` ya es seguro con el CI bloqueante, y es más rápido. |
| EAS u otra plataforma de builds de terceros | Las apps son nativas; fastlane o Xcode Cloud son las herramientas estándar. |

## Consecuencias

- Nada llega a `main` sin pasar todas las verificaciones bloqueantes.
- Los minutos de macOS en GitHub Actions son el costo de CI más alto; si se agotan, mover
  los builds de iOS a Xcode Cloud.
- Hasta automatizar los builds móviles, publicar una app depende de pasos manuales; una
  lista de verificación por release reduce el riesgo.

## Referencias

- ADR-004, ADR-005, ADR-009, ADR-010, ADR-011
- `.github/workflows/ci.yml`, `.github/workflows/release-please.yml`, `render.yaml`
- Serie anterior: ADR-020, ADR-021, ADR-030, ADR-031
