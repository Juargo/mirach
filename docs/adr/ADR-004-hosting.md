---
tags:
  - adr
  - fase-diseño
  - hosting
  - devops
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-05-16
fecha_actualizacion: 2026-05-16
---

# ADR-004 — Hosting y Despliegue

## Estado

✅ **Decidido**

---

## Contexto

Se necesita una estrategia de despliegue para tres piezas independientes: el frontend (React SPA), el backend (NestJS) y la Base de datos (PostgreSQL vía Supabase, ya resuelta en ADR-002). Adicionalmente, se quiere incorporar un pipeline CI/CD que automatice la validación antes de cada despliegue, en línea con la métrica de Frecuencia de Despliegue documentada en el INDEX MONEYDIARY.

El objetivo es aprender el proceso completo de despliegue continuo, no solo publicar la app.

---

## Decisiones

### Frontend — Vercel ✅

**¿Por qué?**
Vercel es la plataforma de referencia para SPAs y sitios estáticos. Integración nativa con GitHub: cada push a `main` dispara un deploy automático. Cada pull request genera un entorno de preview con URL propia, lo que permite revisar cambios antes de fusionarlos. Capa gratuita suficiente para un proyecto personal. Es el servicio para el que Vite está optimizado.

**Alternativas descartadas:**
- *Netlify*: igualmente válido, pero Vercel tiene mejor integración con el ecosistema React/Vite y mayor presencia en la industria actualmente.
- *GitHub Pages*: más limitado, sin soporte nativo para SPAs con routing del lado del cliente.

---

### Backend — Render ✅

**¿Por qué?**
Render soporta servicios Node.js con estado (procesos persistentes), a diferencia de plataformas serverless que no son apropiadas para NestJS sin configuración adicional. Integración directa con GitHub, deploys automáticos, logs en tiempo real y capa gratuita disponible. Documentación clara para Node.js.

**Consideración importante — cold starts en capa gratuita:**
En la capa gratuita de Render, los servicios inactivos se "duermen" tras 15 minutos sin tráfico y tardan ~30 segundos en responder la primera solicitud. Para un proyecto personal de uso propio esto es aceptable. Si en el futuro el tiempo de respuesta inicial se vuelve molesto, se puede migrar al plan pagado o a Railway.

**Alternativas descartadas:**
- *Railway*: igualmente válido y ligeramente más rápido de configurar, pero Render tiene más documentación disponible para Node.js y es más conocido como plataforma de aprendizaje.
- *Fly.io*: buena opción técnica pero con mayor complejidad de configuración (requiere CLI y archivos de configuración adicionales).
- *Vercel para el backend*: NestJS no es serverless por diseño. Adaptarlo a funciones serverless de Vercel requiere configuración no trivial y va en contra de la arquitectura elegida.

---

### CI/CD — GitHub Actions ✅

**¿Por qué?**
GitHub Actions permite definir pipelines de integración continua directamente en el repositorio, sin herramientas externas. Es el estándar de facto para proyectos open source y el más utilizado en equipos que usan GitHub. Su valor pedagógico es alto: conecta directamente con la métrica de Frecuencia de Despliegue y enseña a pensar en la automatización como parte del proceso de desarrollo.

**Pipeline propuesto:**

```
Push a main / PR abierto
        │
        ▼
[GitHub Actions]
    ├── Instalar dependencias (npm ci)
    ├── Compilar TypeScript (tsc)
    ├── Ejecutar linter (eslint)
    ├── Ejecutar tests (jest)
    │
    └── Si todo pasa:
        ├── Frontend → deploy automático en Vercel
        └── Backend → deploy automático en Render
```

**Implementación por etapas:**
El pipeline completo se construirá incrementalmente. En el Sprint 1 se configura lo mínimo (compilación + lint). Los tests se agregan a medida que se implementa la cobertura definida en el INDEX MONEYDIARY (85-95% en lógica financiera).

---

## Estrategia de entornos

| Entorno | Frontend | Backend | Base de datos |
|---|---|---|---|
| **Local** | `localhost:5173` (Vite dev server) | `localhost:3000` (NestJS) | Supabase proyecto de desarrollo |
| **Preview** | URL automática de Vercel por PR | — | Supabase proyecto de desarrollo |
| **Producción** | Vercel (rama `main`) | Render (rama `main`) | Supabase proyecto de producción |

> [!warning] Dos proyectos en Supabase
> Se deben crear dos proyectos separados en Supabase: uno para desarrollo/testing y otro para producción. Nunca apuntar el entorno local o de preview a la Base de datos de producción.

---

## Gestión de secrets

Las variables de entorno sensibles (credenciales de Supabase, JWT secret, etc.) se gestionan así:

| Entorno | Mecanismo |
|---|---|
| Local | Archivo `.env` (en `.gitignore`, nunca en el repositorio) |
| GitHub Actions | GitHub Secrets (Settings → Secrets and variables → Actions) |
| Render | Variables de entorno en el dashboard de Render |
| Vercel | Variables de entorno en el dashboard de Vercel |

> [!success] Conexión con Threat Model
> Esta estrategia satisface el control I-05 (sin credenciales hardcodeadas en el código fuente) definido en el Threat Model como crítico para el Sprint 1.

---

## Consecuencias

**Positivas:**
- El pipeline de GitHub Actions disciplina el proceso de desarrollo: no se despliega código que no compila o que falla el linter.
- Los entornos de preview de Vercel permiten revisar cambios del frontend sin afectar producción.
- La separación de proyectos en Supabase protege los datos de producción durante el desarrollo.
- Todo el stack tiene capa gratuita suficiente para un proyecto personal, sin costo inicial.

**A tener en cuenta:**
- El cold start de Render en capa gratuita (~30s) es perceptible. Se acepta para esta etapa del proyecto.
- GitHub Actions tiene 2.000 minutos gratuitos por mes en repositorios privados. Para un proyecto personal el consumo será mínimo.
- Configurar GitHub Actions correctamente requiere tiempo en el Sprint 1. Se recomienda hacerlo antes de escribir la primera línea de lógica de negocio para establecer el hábito desde el inicio.

---

## Referencias

- ADR-001 Backend Framework — NestJS como proceso Node.js persistente
- ADR-002 Base de Datos — Supabase, dos proyectos (dev/prod)
- ADR-003 Frontend — React + Vite, SPA
- Threat Model — App de Finanzas Personales — control I-05 (secrets)

---

*Fecha de decisión: 2026-05-16*
