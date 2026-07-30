---
tags:
  - adr
  - fase-diseño
  - frontend
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-05-16
fecha_actualizacion: 2026-05-16
---

# ADR-003 — Frontend

## Estado

✅ **Decidido**

---

## Contexto

Se necesita una interfaz de usuario para el módulo de Ingesta de Datos. El flujo tiene múltiples estados (carga, validación, preview, confirmación, resultado) y debe comunicarse exclusivamente con la API REST del backend NestJS — sin conexión directa a Supabase desde el cliente (decisión de seguridad establecida en ADR-002).

**Perfil del desarrollador:** 4 años de experiencia con Angular. Sin experiencia previa con React. El objetivo del proyecto incluye contrastar conocimientos entre ambos frameworks para ampliar la perspectiva técnica.

---

## Opciones Evaluadas

### Arquitectura: full-stack vs frontend separado

**Next.js (full-stack)** — React con capacidades de servidor que podría absorber responsabilidades del backend. Descartado porque ya existe NestJS como backend (ADR-001) y combinar ambos crea duplicación de responsabilidades en routing, middleware y autenticación. La separación frontend/backend es intencional y refuerza el aprendizaje del contrato cliente-servidor.

**Frontend separado (SPA)** ✅ — Aplicación de una sola página que consume la API REST de NestJS. Separación clara de responsabilidades, coherente con la arquitectura elegida.

---

### Framework de UI

**Angular**
Framework con el que el desarrollador tiene 4 años de experiencia. Comparte filosofía con NestJS (módulos, inyección de dependencias, decoradores, TypeScript obligatorio). Descartado conscientemente: usar Angular no aportaría contraste de conocimiento ni aprendizaje nuevo en este proyecto.

**Vue**
Alternativa válida con buena experiencia de desarrollo. Menor presencia en el mercado laboral comparado con React. No agrega valor diferencial frente a React para este contexto de aprendizaje.

**React ✅ (elegido)**
El framework de UI más utilizado en la industria. A diferencia de Angular, React es poco opinionado: no impone estructura de carpetas, manejo de estado, ni routing. Esto obliga al desarrollador a tomar decisiones arquitectónicas que en Angular vienen resueltas por el framework — lo que resulta en un aprendizaje más profundo y en un contraste directo con la experiencia previa en Angular.

---

### Lenguaje

**TypeScript ✅** — Consistente con el backend (NestJS + TypeScript). Permite compartir tipos de entidades entre capas en el futuro y mantiene la seguridad de tipos en una aplicación financiera.

---

### Herramienta de build

**Vite ✅** — El estándar actual para proyectos React. Significativamente más rápido que Create React App (deprecado). Configuración mínima para arrancar.

---

### Librería de estilos

Decisión pendiente de menor impacto. Las opciones más comunes con React + TypeScript son **Tailwind CSS** (utility-first, muy popular) o **shadcn/ui** (componentes pre-construidos sobre Tailwind). Ambas son válidas y no bloquean el desarrollo inicial.

---

## Decisión

| Componente | Elección |
|---|---|
| Arquitectura | SPA separada, consume API REST de NestJS |
| Framework | React |
| Lenguaje | TypeScript |
| Build tool | Vite |
| Estilos | Por definir (Tailwind CSS recomendado) |

---

## Consecuencias

**Positivas:**
- React contrasta directamente con Angular: menos magia, más decisiones explícitas. El desarrollador experimentará de primera mano qué resuelve un framework opinionado vs uno minimalista.
- TypeScript en el frontend mantiene consistencia con el backend y facilita la detección de errores en tiempo de desarrollo.
- La arquitectura SPA + API REST refuerza el contrato definido en el Design Doc y mantiene toda la lógica de autorización en el backend (control E-01 del Threat Model).
- Vite permite arrancar rápido sin configuración compleja.

**A tener en cuenta:**
- React requiere decidir por separado el manejo de estado (Context API, Zustand, Redux) y el routing (React Router). En Angular estas decisiones vienen incluidas. Esto es intencional — es parte del aprendizaje — pero implica decisiones adicionales antes del primer sprint.
- **Restricción de seguridad heredada de ADR-002:** el SDK de Supabase para JavaScript no debe usarse desde el frontend. Toda comunicación con la Base de datos debe pasar por el backend NestJS. Usar el SDK de Supabase directamente desde el cliente expone las credenciales de la Base de datos al navegador.

---

## Contraste Angular vs React — referencia de aprendizaje

| Concepto | Angular | React |
|---|---|---|
| Estructura | Impuesta por el framework | El desarrollador la define |
| Estado | Services + RxJS | Context API / Zustand / Redux |
| Routing | Angular Router (incluido) | React Router (librería externa) |
| Formularios | Reactive Forms / Template Forms | React Hook Form / Formik |
| TypeScript | Obligatorio | Opcional (elegido aquí) |
| Filosofía | "Todo incluido" | "Solo la vista" |

---

## Referencias

- ADR-001 Backend Framework
- ADR-002 Base de Datos — restricción de no usar SDK de Supabase desde el frontend
- Design Doc — Ingesta de Datos — wireframes pendientes (sección 7)

---

*Fecha de decisión: 2026-05-16*
