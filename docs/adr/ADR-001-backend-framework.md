---
tags:
  - adr
  - fase-diseño
  - backend
proyecto: MoneyDiary
estado: ⛔ Supersedido por ADR-028
fecha_creacion: 2026-05-16
fecha_actualizacion: 2026-07-23
supersedido_por: ADR-028
---

# ADR-001 — Lenguaje y Framework Backend

## Estado

⛔ **Supersedido por ADR-028 Migración Backend a Express** (2026-07-23) — en cuanto al **framework**: NestJS se reemplaza por Express + TypeScript porque su magia (DI, decoradores) terminó tapando los fundamentos que este ADR buscaba enseñar. El **lenguaje** (TypeScript sobre Node.js) que decidió este ADR se mantiene vigente.

> Registro histórico. La decisión original (NestJS) se documenta abajo tal como se tomó el 2026-05-16.

---

## Contexto

Se necesita un backend que exponga una API REST para el módulo de Ingesta de Datos. Las responsabilidades principales son: recibir archivos `.xls`/`.xlsx`, parsearlos, validarlos, normalizarlos y persistirlos en la Base de datos.

**Perfil del desarrollador:** experiencia sólida en frontend con JavaScript. Sin experiencia previa en backends estructurados. Objetivo del proyecto: aprender el proceso completo de ingeniería de software, no solo codificar.

**Restricción futura conocida:** existe la posibilidad de migrar el módulo de parseo/lectura de archivos XLSX a Python en el futuro, por su ecosistema más maduro para manipulación de datos (`pandas`, `openpyxl`). La arquitectura debe facilitar ese reemplazo.

---

## Opciones Evaluadas

### Opción A — Express.js
Framework minimalista y flexible. El más popular del ecosistema Node.

**Pros:**
- Curva de aprendizaje baja para alguien con experiencia en JavaScript
- Ecosistema enorme, muchos recursos
- Sin restricciones de estructura: total libertad

**Contras:**
- Total libertad = responsabilidad total de definir la arquitectura
- Sin guía sobre cómo organizar módulos, servicios y controladores
- Fácil de crear código desorganizado sin experiencia en backend

### Opción B — Fastify
Framework moderno enfocado en performance. Alternativa más limpia a Express.

**Pros:**
- Más rápido que Express en benchmarks
- TypeScript como ciudadano de primera clase
- Mejor estructura de plugins que Express

**Contras:**
- Comunidad más pequeña que Express
- Igualmente poco opinionado en cuanto a arquitectura de la aplicación
- No agrega valor pedagógico significativo respecto a Express para este proyecto

### Opción C — NestJS ✅ (elegida)
Framework opinionado construido sobre Express/Fastify. Impone una arquitectura de módulos, controladores y servicios inspirada en Angular.

**Pros:**
- Arquitectura explícita: módulos, controladores, servicios, DTOs — los mismos patrones que se usan en equipos reales
- TypeScript obligatorio, lo cual añade seguridad de tipos en una app financiera
- Inyección de dependencias incluida: facilita testing y separación de responsabilidades
- ORM de primera clase con TypeORM y Prisma
- Alto valor pedagógico: obliga a pensar en capas y contratos entre módulos
- La separación en módulos facilita reemplazar el módulo de parseo XLSX en el futuro (restricción futura conocida)

**Contras:**
- Curva de entrada más pronunciada que Express
- Más boilerplate inicial
- Puede sentirse como sobreingeniería para un proyecto personal

> [!note] Nota sobre sobreingeniería
> Para un proyecto personal puro, Express o Fastify serían suficientes. NestJS se elige conscientemente por su valor de aprendizaje: sus patrones (módulos, servicios, controladores, DTOs) son los que se estudian formalmente en ingeniería de software y los que se encuentran en proyectos de equipos reales.

---

## Decisión

**Lenguaje:** TypeScript sobre Node.js  
**Framework:** NestJS

---

## Consecuencias

**Positivas:**
- El código estará organizado en módulos independientes desde el inicio, lo que facilita el mantenimiento y el aprendizaje de separación de capas.
- TypeScript obliga a definir tipos explícitos para las entidades financieras, reduciendo errores en tiempo de desarrollo.
- La separación modular permite reemplazar el módulo de ingesta por un microservicio Python en el futuro sin afectar el resto del sistema.

**A tener en cuenta:**
- Los primeros sprints tendrán más overhead de configuración respecto a Express. Se acepta este trade-off conscientemente.
- Será necesario estudiar los conceptos de NestJS (módulos, providers, decoradores) antes o durante el Sprint 1.

---

## Referencias

- Design Doc — Ingesta de Datos
- ADR-002 Base de Datos

---

*Fecha de decisión: 2026-05-16*
