---
tags:
  - adr
  - fase-diseño
  - toolchain
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-05-22
fecha_actualizacion: 2026-05-22
---

# ADR-006 — Package Manager: pnpm

## Estado

✅ **Decidido**

---

## Contexto

El proyecto usa Node.js tanto en el backend (NestJS) como en el frontend (React + Vite). Ambos workspaces necesitan un package manager para instalar dependencias, gestionar el lockfile y ejecutar scripts.

El package manager es una decisión de seguridad además de una decisión de tooling. En 2025–2026 el ecosistema npm ha experimentado ataques de supply chain sin precedentes:

- **454.648 paquetes maliciosos** fueron publicados en npm solo en 2025 (Sonatype, 2026).
- El gusano **Shai-Hulud** (septiembre 2025) fue el primer malware auto-replicante del ecosistema: comprometió la cuenta del maintainer de `chalk`, `debug`, `ansi-styles` y `strip-ansi` — 2.600 millones de descargas semanales afectadas.
- **Axios comprometido** (marzo 2026): credenciales de publicación robadas para inyectar `plain-crypto-js` con un hook `postinstall` que robaba tokens. La ventana de exposición fue ~5 horas.
- **TanStack attack** (13 mayo 2026): más de 84 paquetes comprometidos via exploit en GitHub Actions, con exfiltración de secretos. Relevante para el frontend del proyecto si se adopta TanStack Query o Router.

Además, se identificaron **tres CVEs críticos en pnpm** durante 2025 que afectan versiones anteriores a la v11:

| CVE | Impacto | Versiones afectadas | Fix |
|-----|---------|---------------------|-----|
| CVE-2025-69264 | RCE — dependencias git-hosted ejecutan código arbitrario en `pnpm install` | 10.0.0 – 10.25.x | 10.26.0 |
| CVE-2025-69263 | HTTP tarballs sin hash de integridad — servidor puede servir contenido diferente en cada install | ≤ 10.26.1 | 10.26.2 |
| CVE-2025-69262 | Command injection via variables de entorno en `.npmrc` con `tokenHelper` | 6.25.0 – 10.26.x | 10.27.0 |

Los tres CVEs están resueltos en **pnpm v11** (lanzado el 28 de abril de 2026).

**Opciones disponibles en el ecosistema Node.js:** `npm`, `yarn` (classic y berry), `pnpm`.

---

## Opciones Evaluadas

### Opción A — npm

El package manager oficial de Node.js. Viene incluido sin instalación adicional.

**Pros:**
- Sin instalación adicional — ya está en Node.js
- Documentación ubícua: todos los tutoriales usan npm

**Contras:**
- `node_modules` plano (*flat*): cualquier paquete puede acceder a dependencias que no declaró — problema conocido como **phantom dependencies**.
- No tiene `minimum-release-age` ni `strictDepBuilds` — instalará cualquier versión recién publicada sin cuarentena.
- Lockfile (`package-lock.json`) sin las garantías de integridad de pnpm.
- No ha incorporado defensas de supply chain en respuesta a los ataques de 2025.

### Opción B — Yarn Classic (v1)

**Contras:**
- En modo *mantenimiento* desde 2020 — sin nuevas funcionalidades de seguridad.
- Mismo modelo de `node_modules` plano que npm.
- No ha respondido a los ataques de supply chain de 2025 con nuevas defensas.

### Opción C — pnpm v11 ✅ (elegida)

Package manager moderno con **security by default** desde v11, el único que ha respondido activamente a los ataques del ecosistema de 2025.

**Pros:**
- **`node_modules` no-plano (strict):** cada paquete solo accede a lo que declaró en su `package.json`. Elimina phantom dependencies y reduce la superficie de ataque.
- **Verificación de integridad obligatoria:** `pnpm-lock.yaml` incluye checksums para cada paquete. Detecta si el contenido de un paquete en el registry cambia post-instalación.
- **`--frozen-lockfile` por defecto en CI:** falla explícitamente si hay discrepancias con el lockfile.
- **Minimum Release Age (24h por defecto en v11):** no instala versiones publicadas hace menos de 24 horas. Habría bloqueado completamente el ataque de Axios.
- **`blockExoticSubdeps: true` por defecto:** subdependencias solo pueden venir de registries verificados.
- **`strictDepBuilds: true` por defecto:** bloquea install scripts de dependencias; el vector más común de entrega de payload en ataques reales. Requiere `allowBuilds` explícito y auditado.
- **Almacenamiento content-addressable:** store global compartido con hard links. Instalaciones más rápidas y menor uso de disco.
- **Soporte nativo de workspaces:** relevante si el monorepo crece (frontend + backend en el mismo repo).

**Contras:**
- Requiere instalación por separado y Node.js 22+.
- Algunos scripts viejos asumen npm y pueden necesitar ajuste menor.
- La estructura no-plana puede fallar con paquetes que tienen phantom dependencies mal declaradas (culpa del paquete, no de pnpm — se resuelve con `public-hoist-pattern` como excepción documentada).

> [!warning] pnpm v11 requiere Node.js 22+
> Verificar la versión de Node.js instalada antes del setup del proyecto. `node --version` debe retornar v22.x.x o superior. Si no, actualizar via `nvm` antes de continuar.

---

## Decisión

**Package manager:** `pnpm`
**Versión mínima requerida:** pnpm v11+ (los CVEs 2025-69262/63/64 están en versiones anteriores)
**Runtime requerido:** Node.js 22+
**Activación:** via `corepack` para fijar la versión exacta en el repositorio

```json
// package.json
{
  "packageManager": "pnpm@11.x.x"
}
```

```bash
# Verificar Node.js 22+
node --version

# Activar corepack (incluido en Node.js 16+)
corepack enable

# Instalar dependencias (usa pnpm-lock.yaml si existe)
pnpm install

# Agregar dependencia de producción
pnpm add <paquete>

# Agregar dependencia de desarrollo
pnpm add -D <paquete>

# Auditar vulnerabilidades conocidas
pnpm audit --audit-level=high
```

### Configuración `.npmrc` recomendada para MoneyDiary

```ini
# .npmrc — configuración de seguridad para MoneyDiary

# Cuarentena de 7 días en lugar de los 24h por defecto
# El ataque de Axios tuvo una ventana de ~5h — 7 días bloquea incluso ataques lentos
minimum-release-age=10080

# Fallar si hay vulnerabilidades HIGH o CRITICAL en pnpm audit
audit-level=high

# Bloquear subdependencias de fuentes exóticas (default en v11, explícito aquí para claridad)
block-exotic-subdeps=true
```

> [!note] Sobre `minimum-release-age=10080`
> pnpm v11 usa 1440 minutos (24h) por defecto. Se sube a 10080 (7 días) porque en una aplicación financiera la estabilidad importa más que adoptar la última versión al instante. El ataque de Axios habría sido bloqueado incluso con el valor de 24h, pero 7 días da margen para que la comunidad detecte ataques más lentos. Para desbloquear una versión específica antes del período, usar `minimumReleaseAgeExclude` en `pnpm-workspace.yaml`.

---

## Consecuencias

**Positivas:**
- Las tres clases de ataque más comunes de 2025 (phantom deps, postinstall scripts, versiones recién comprometidas) están mitigadas por los defaults de pnpm v11 + la configuración `.npmrc` de este ADR.
- La estructura no-plana detectará en tiempo de instalación cualquier dependencia accedida implícitamente, forzando declaraciones explícitas.
- Las instalaciones en CI serán deterministas y más rápidas que con npm.

**A tener en cuenta:**
- **Node.js 22+ es un requisito duro.** Documentar en el README del proyecto.
- El lockfile es `pnpm-lock.yaml` (no `package-lock.yaml`). Este archivo **debe** commitearse — es parte de la auditoría de seguridad.
- Con `strictDepBuilds: true`, algunos paquetes legítimos que usan install scripts fallarán en el primer `pnpm install`. La solución es agregarlos explícitamente a `allowBuilds` en `pnpm-workspace.yaml` — esto es intencional: fuerza a revisar qué scripts se ejecutan.
- **TanStack:** si en el frontend se adopta TanStack Query o Router, verificar que la versión sea posterior al incidente del 13 mayo 2026 y que haya sido publicada por el equipo oficial post-auditoría.

---

## Referencias

- [pnpm 11.0 — Release Notes](https://pnpm.io/blog/releases/11.0)
- [pnpm — Mitigating Supply Chain Attacks](https://pnpm.io/supply-chain-security)
- [CVE-2025-69264 — RCE en pnpm](https://www.sentinelone.com/vulnerability-database/cve-2025-69264/)
- [CISA Alert — Widespread Supply Chain Compromise npm (Sept 2025)](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)
- [Unit42 — npm Threat Landscape (Updated May 2026)](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- [Huntress — Axios npm Supply Chain Compromise](https://www.huntress.com/blog/axios-npm-compromise)
- ADR-001 Backend Framework
- ADR-003 Frontend

---

*Fecha de decisión: 2026-05-22 · Última actualización: 2026-05-22*
