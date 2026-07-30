---
tags:
  - adr
  - fase-diseño
  - base-de-datos
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-05-16
fecha_actualizacion: 2026-05-16
---

# ADR-002 — Base de Datos: PostgreSQL + Supabase + Prisma

## Estado

✅ **Decidido**

---

## Contexto

Se necesita persistir transacciones bancarias normalizadas, sesiones de ingesta, cuentas y bancos. Los datos son altamente relacionales: una transacción pertenece a una cuenta, que pertenece a un banco, registrada dentro de una sesión de ingesta.

Al ser una aplicación financiera, la integridad de los datos es crítica. No es aceptable que una ingesta quede en estado inconsistente si ocurre un error a mitad del proceso.

**Restricciones previas:**
- La Base de datos debe estar en la nube (definido en el Threat Model)
- El backend es NestJS + TypeScript (ADR-001)
- Se requiere cifrado en reposo (control I-01 del Threat Model)

---

## Opciones Evaluadas

### Tipo de base de datos: Relacional vs NoSQL

Los datos de MoneyDiary tienen un esquema fijo y relaciones claras entre entidades. Se requieren garantías ACID para las operaciones de ingesta (si falla la persistencia de una transacción, no debe quedar ninguna del mismo lote). NoSQL no agrega valor en este contexto y sacrifica integridad referencial.

**Decisión preliminar:** base de datos relacional SQL.

---

### Motor SQL

**PostgreSQL ✅ (elegido)**
El estándar de la industria para aplicaciones modernas. Robusto, open source, soporte excelente de tipos de datos, transacciones ACID completas, y primera clase en el ecosistema de herramientas elegidas (Supabase, Prisma). Es el motor más utilizado en proyectos de equipos profesionales hoy.

**MySQL / MariaDB**
Válido pero sin ventajas sobre PostgreSQL para este proyecto. PostgreSQL supera a MySQL en soporte de tipos avanzados, manejo de JSON, y compatibilidad con el ecosistema moderno.

**SQLite**
Base de datos embebida sin servidor. Apropiada para prototipos o apps de escritorio, no para una app con backend separado y Base de datos en la nube.

---

### Servicio cloud

**Supabase ✅ (elegido)**
Plataforma gestionada que ofrece PostgreSQL como servicio. Incluye capa gratuita generosa, cifrado en reposo habilitado por defecto (cumple control I-01 del Threat Model), backups automáticos, dashboard visual para inspeccionar datos durante el desarrollo, y autenticación integrada que puede aprovecharse en el futuro.

**Railway**
Simple y rápido de configurar, pero con menor ecosistema y sin las herramientas adicionales de Supabase.

**Neon**
PostgreSQL serverless. Buena opción técnica, pero Supabase ofrece más herramientas de desarrollo integradas para un proyecto de aprendizaje.

**AWS RDS**
Robusto y escalable, pero con overhead operativo y de costos innecesario para un proyecto personal en esta etapa.

---

### ORM

**Prisma ✅ (elegido)**
ORM moderno y schema-first. Define el modelo de datos en un archivo `.prisma` y genera los tipos TypeScript automáticamente. Experiencia de desarrollo superior: las queries son type-safe, el cliente generado es fácil de leer y las migraciones están integradas. Tiene soporte oficial para NestJS.

**TypeORM**
El ORM histórico de NestJS. Más verboso, decoradores en las entidades, y la experiencia de desarrollo es inferior a Prisma en proyectos nuevos. Se mantiene como legacy en muchos proyectos pero Prisma es la elección más moderna.

---

## Decisión

| Componente | Elección |
|---|---|
| Motor | PostgreSQL |
| Servicio cloud | Supabase |
| ORM | Prisma |

---

## Consecuencias

**Positivas:**
- Prisma genera tipos TypeScript desde el schema, lo que elimina una clase entera de errores en tiempo de desarrollo.
- Supabase provee cifrado en reposo por defecto, satisfaciendo el control de seguridad I-01 del Threat Model sin configuración adicional.
- Las migraciones de Prisma permiten evolucionar el esquema de forma controlada y documentada, lo cual es importante cuando el modelo de datos aún puede cambiar.
- El dashboard de Supabase permite inspeccionar datos directamente durante el desarrollo sin necesidad de cliente de BD externo.
- Esta combinación (PostgreSQL + Prisma) es compatible con un eventual módulo Python de parseo: Python accede a PostgreSQL nativamente con `psycopg2` o `SQLAlchemy`.

**A tener en cuenta:**
- Prisma requiere aprender el lenguaje de schema de Prisma (`.prisma`) antes de poder definir el modelo de datos. Es simple pero es un paso adicional.
- Supabase en capa gratuita tiene límites de almacenamiento y conexiones simultáneas. Para un proyecto personal son más que suficientes.
- El ADR-003 (Frontend) deberá decidir si se usa el cliente de Supabase directamente desde el frontend o si toda la comunicación pasa por el backend de NestJS. **Recomendación:** toda la comunicación debe pasar por el backend para mantener el control de autorización definido en el Threat Model.

---

## Referencias

- ADR-001 Backend Framework
- ADR-003 Frontend
- Threat Model — App de Finanzas Personales — controles I-01, T-02

---

*Fecha de decisión: 2026-05-16*
