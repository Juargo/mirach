---
tags:
  - adr
  - fase-diseño
  - toolchain
  - dx
  - seguridad
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-12
fecha_actualizacion: 2026-07-27
---

# ADR-020 — Git Hooks en el monorepo: Husky + lint-staged + commitlint (config a nivel raíz)

## Estado

✅ **Decidido** — aplicable desde ya en `apps/api` y `apps/web`; `apps/mobile` se suma a las mismas reglas al scaffoldearse (post-MVP, ADR-010 App Mobile).

✅ **Implementado** — esta decisión quedó documentada pero sin construir hasta que se convirtió en **precondición del Slice A** del change SDD `versioning-release-automation` (ADR-030 Versionado y Automatización de Releases): Husky v9 (solo raíz) + commitlint + lint-staged, más un job `commitlint` en CI que corre el mismo gate. Mergeado a `main` vía PR #118 (2026-07-27).

---

## Contexto

MoneyDiary es un monorepo `pnpm workspaces` con tres sub-proyectos: `apps/api` (NestJS), `apps/web` (React) y `apps/mobile` (React Native, post-MVP). El proyecto ya define convenciones que hoy se aplican **a mano**: Conventional Commits (`feat:`, `fix:`, …), ESLint/Prettier, `tsc --noEmit` y tests con Vitest (ADR-016 Testing Framework Vitest). Nada impide commitear código que rompa el lint, no tipe o use un mensaje de commit fuera de convención.

Se quiere automatizar esas verificaciones con **git hooks** que corran localmente antes de commitear/pushear, de forma que los errores triviales se detecten en el momento y no en CI ni en code review.

**El reto específico del monorepo:** git tiene **un solo directorio `.git` en la raíz**, así que **los hooks son globales al repo** — no existen hooks "por workspace" de forma nativa. Hay que instalar la herramienta de hooks **solo en la raíz** (instalarla también dentro de cada `apps/*` los deja sin efecto) y, desde ese único punto, **enrutar cada verificación al workspace correcto** según qué archivos cambiaron.

---

## Aclaración importante — los hooks NO son un control de seguridad

Los git hooks se saltan con `git commit --no-verify` / `git push --no-verify` y solo corren en la máquina del desarrollador. Por eso:

> **Los hooks son una *conveniencia* (feedback temprano), no una *garantía*.** El gate real de calidad y seguridad es **CI** (ADR-004 Hosting y Despliegue, GitHub Actions), que debe re-ejecutar las **mismas** verificaciones (lint, typecheck, tests, y el checklist de seguridad de ADR-015 Técnicas de Verificación de Requisitos) para que un `--no-verify` no cuele nada. Los hooks adelantan el fallo; CI lo impide.

---

## Opciones Evaluadas

### Opción A — Husky + lint-staged + commitlint ✅ (elegida)

Combo estándar de facto en el ecosistema Node (~5M descargas/semana Husky).

✅ **Estándar y muy documentado**; curva mínima para un solo dev.
✅ `lint-staged` resuelve limpiamente el reto del monorepo: **enruta archivos staged por glob** (`apps/api/**`, `apps/web/**`) a la config de cada workspace, sin escribir lógica shell a mano.
✅ `commitlint` + `@commitlint/config-conventional` **hace cumplir los Conventional Commits** que el proyecto ya usa.
✅ Todo el stack es **TypeScript/Node** → la dependencia de Node de Husky es un no-problema aquí.
✅ Dependencias dev en npm → cubiertas por `pnpm audit` / `minimum-release-age` (ADR-006 Package Manager).
❌ Ejecución **secuencial** (bash); en repos enormes puede ser lento (irrelevante a esta escala).
❌ La config queda **repartida** (`.husky/`, `lint-staged` en package.json, `commitlint.config`) — hay que mirar varios archivos para entender qué corre.

### Opción B — Lefthook

Binario único en Go, ejecución en paralelo, monorepo-aware, una sola config YAML.

✅ Más rápido (paralelo por defecto) y con *scoping* por directorio nativo — pensado para monorepos.
✅ Una sola fuente de config (`lefthook.yml`), sin `prepare` script ni `node_modules` para correr.
✅ Sin dependencia de Node — ventaja real **si** hubiera servicios en Go/Python.
❌ **Esa ventaja clave (multi-lenguaje sin Node) no aplica**: MoneyDiary es 100% TS/Node.
❌ Menor comunidad (~400K vs ~5M/semana) y menos ejemplos "llave en mano" con commitlint/lint-staged.
❌ Introduce un binario nativo fuera del árbol npm → un canal más que auditar frente a la disciplina de ADR-006 Package Manager.
→ Buena opción; se descarta **por ahora** solo porque su diferencial no aporta a este stack. Reconsiderar si el repo crece mucho o suma otro lenguaje.

### Opción C — simple-git-hooks / hooks nativos a mano

✅ Cero o casi cero dependencias.
❌ Sin el ecosistema de `lint-staged`/`commitlint`; habría que reimplementar el routing y la validación de mensajes a mano.
❌ Más frágil y menos mantenible para el objetivo de aprender buenas prácticas.
→ Descartada.

---

## Decisión

**Husky v9 + lint-staged + commitlint, instalados y configurados únicamente en la raíz del monorepo.** Un solo `.husky/` gobierna los tres workspaces; el routing por workspace lo hace `lint-staged` vía globs.

### Instalación (solo raíz)

```bash
# en la raíz del monorepo, con -w (workspace root)
pnpm add -D -w husky lint-staged @commitlint/cli @commitlint/config-conventional
pnpm exec husky init      # crea .husky/ y el script prepare
```

> **No** instalar husky/lint-staged dentro de `apps/*`: en un monorepo eso los deja sin efecto. Van solo en el `package.json` raíz.

`package.json` (raíz):

```jsonc
{
  "scripts": {
    "prepare": "husky"           // Husky v9: hook de instalación
  }
}
```

### Hooks

**`.husky/pre-commit`** → verifica solo lo staged, enrutado por workspace:

```bash
pnpm lint-staged
```

`lint-staged` (raíz, en `package.json` o `.lintstagedrc`):

```jsonc
{
  "apps/api/**/*.ts":        ["pnpm --filter @moneydiary/api exec eslint --fix"],
  "apps/web/**/*.{ts,tsx}":  ["pnpm --filter @moneydiary/web exec eslint --fix"],
  "**/*.{json,md,yml}":      ["prettier --write"]
}
```

- **Typecheck**: `tsc` es por-proyecto, no por-archivo. Se ejecuta el typecheck del workspace **solo si cambiaron archivos suyos** (comando por-workspace disparado desde la entrada de `lint-staged` correspondiente, p. ej. `pnpm --filter @moneydiary/web typecheck`). Se evita typechequear todo el repo en cada commit.
- Cuando entre `apps/mobile`, se añade su glob (`apps/mobile/**/*.{ts,tsx}` → su ESLint, incl. `eslint-plugin-react-native-a11y` de ADR-018 Testing Accesibilidad y UX).

**`.husky/commit-msg`** → Conventional Commits:

```bash
pnpm exec commitlint --edit "$1"
```

`commitlint.config.cjs` (raíz): `{ extends: ['@commitlint/config-conventional'] }`.

**`.husky/pre-push`** (recomendado, ligero) → tests de los workspaces afectados antes de subir:

```bash
pnpm -r --filter "...[origin/main]" test
```

> Se mantiene el pre-push **acotado a lo afectado** (no toda la suite) para no penalizar el push. Si resulta molesto para un solo dev, puede quedar como opcional y delegar los tests completos a CI.

### Reparto de responsabilidades

| Hook | Qué corre | Alcance |
|---|---|---|
| `pre-commit` | ESLint `--fix` + Prettier + typecheck del workspace tocado | Solo archivos/paquetes staged |
| `commit-msg` | commitlint (Conventional Commits) | Mensaje del commit |
| `pre-push` | Tests de workspaces afectados (Vitest) | Solo lo afectado vs `origin/main` |
| **CI (gate real)** | Lint + typecheck + tests **completos** + checklist seguridad | Todo el repo — ADR-015 Técnicas de Verificación de Requisitos |

---

## Consecuencias

**Positivas:**

- **Feedback inmediato**: lint/format/typecheck y validación de mensaje fallan en el commit, no en review.
- **Refuerza convenciones existentes**: los Conventional Commits pasan de "acuerdo" a regla ejecutable; el estilo de código queda uniforme antes de subir.
- **Resuelve el monorepo limpiamente**: una sola config en la raíz; `lint-staged` enruta por workspace sin shell frágil.
- **Coste de operación bajo**: stack all-Node, dependencias dev auditadas por `pnpm audit`.
- **Escalable a mobile**: `apps/mobile` se engancha añadiendo su glob, sin rediseñar nada.

**A tener en cuenta:**

- **Hooks ≠ enforcement**: `--no-verify` los salta. **CI debe re-correr las mismas verificaciones** o la garantía es ilusoria. Esto es un requisito, no un detalle.
- **Config repartida** (`.husky/`, `lint-staged`, `commitlint`): documentar en el `CLAUDE.md`/`00 Metodología` dónde vive cada pieza.
- **`prepare` en instalaciones de CI/producción**: asegurar `--frozen-lockfile` y que `husky` no rompa en entornos sin git (Husky v9 lo tolera; si hiciera falta, guardar con `is-ci`).
- **Instalar solo en la raíz**: un error común es añadir husky a un `apps/*` y que "no corra"; queda documentado que va únicamente en el root.
- **pre-push puede molestar**: si el ciclo de un solo dev se resiente, degradarlo a opcional y confiar los tests completos a CI.
- **Lefthook queda como puerta abierta**: si el repo crece o suma otro lenguaje, su modelo paralelo/multi-lenguaje justificaría reconsiderar esta decisión.

---

## Referencias

- [Husky — npm](https://www.npmjs.com/package/husky)
- [lint-staged](https://github.com/lint-staged/lint-staged)
- [commitlint — Conventional Commits](https://commitlint.js.org/)
- [Husky vs Lefthook vs lint-staged (2026)](https://www.pkgpulse.com/guides/husky-vs-lefthook-vs-lint-staged-git-hooks-nodejs-2026)
- [Enforce Git Hooks in Monorepos with Husky](https://dev.to/mimafogeus2/enforce-git-hooks-in-monorepos-with-husky-but-how-3fma)
- ADR-004 Hosting y Despliegue
- ADR-006 Package Manager
- ADR-015 Técnicas de Verificación de Requisitos
- ADR-016 Testing Framework Vitest
- ADR-018 Testing Accesibilidad y UX

---

*Fecha de decisión: 2026-07-12 · Última actualización: 2026-07-12*
