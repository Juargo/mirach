# ADR-005 — Empezar con Monolito Modular + Clean Architecture

| Campo         | Valor                            |
|---------------|----------------------------------|
| **ID**        | ADR-005                          |
| **Fecha**     | 2026-05-20                       |
| **Estado**    | Aceptado                         |
| **Autores**   | Jorge Retamala                   |
| **Revisores** | N/A (proyecto personal)          |

---

## Contexto

Se está iniciando el desarrollo de una aplicación de finanzas personales. El contexto relevante al tomar esta decisión es:

- **Equipo de uno:** el proyecto será desarrollado y mantenido por una sola persona, lo que elimina la necesidad inmediata de escalar equipos de forma independiente.
- **Requerimientos no consolidados:** no existe claridad total sobre el alcance final de la aplicación. Los casos de uso se irán descubriendo durante los primeros sprints.
- **Dominio financiero con lógica de negocio compleja:** la aplicación manipula transacciones, categorías, presupuestos y potencialmente reglas fiscales. Separar esta lógica de la infraestructura (base de datos, UI, importación de archivos) facilita testearla y modificarla de forma aislada.
- **Objetivo de aprendizaje explícito:** más allá del producto, el proyecto busca que el desarrollador practique y consolide buenas prácticas de ingeniería de software.
- **Sin necesidad de escala horizontal a corto plazo:** la aplicación no necesitará manejar múltiples instancias ni tráfico distribuido en el horizonte previsible.

Se evaluaron las siguientes alternativas:

| Alternativa                        | Razón de descarte                                                                                     |
|------------------------------------|-------------------------------------------------------------------------------------------------------|
| Arquitectura de Microservicios     | Overhead operacional muy alto para un solo dev; requiere infraestructura compleja (service mesh, deploys independientes, observabilidad distribuida). Sobre-ingeniería clara. |
| Monolito Tradicional (sin módulos) | Genera deuda técnica desde el inicio; mezcla capas y dominios, dificultando la evolución y el testing. |
| Clean Architecture pura sin módulos | Buena separación de capas, pero sin fronteras de dominio puede derivar en un "Big Ball of Mud" a medida que crece. |

---

## Decisión

**Se adoptará un Monolito Modular con Clean Architecture como estilo arquitectónico base del proyecto.**

### ¿Qué significa esto en la práctica?

**Monolito Modular** implica que el sistema se despliega como una sola unidad, pero su código interno se organiza en módulos con fronteras bien definidas. Cada módulo representa un subdominio del negocio (por ejemplo: `transactions`, `budgets`, `accounts`, `reporting`). Los módulos se comunican entre sí a través de interfaces explícitas (contratos), nunca accediendo directamente a las capas internas del otro.

**Clean Architecture** (inspirada en Robert C. Martin) implica que dentro de cada módulo las dependencias apuntan siempre hacia adentro, siguiendo este orden de capas:

```
┌──────────────────────────────────────────┐
│           Frameworks & Drivers           │  ← UI, Base de datos, APIs externas
│  ┌────────────────────────────────────┐  │
│  │      Interface Adapters            │  │  ← Controllers, Presenters, Gateways
│  │  ┌──────────────────────────────┐  │  │
│  │  │     Application Layer        │  │  │  ← Use Cases / Servicios de aplicación
│  │  │  ┌────────────────────────┐  │  │  │
│  │  │  │    Domain Layer        │  │  │  │  ← Entities, Value Objects, Domain Services
│  │  │  └────────────────────────┘  │  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
         Las dependencias apuntan hacia adentro →
```

La capa de **Dominio** no conoce nada del mundo exterior (ni la base de datos, ni el framework web). Los **Use Cases** orquestan la lógica de aplicación sin depender de detalles de infraestructura. Los **Adapters** traducen entre el mundo externo y el dominio.

### Estructura mínima de carpetas

```
src/
├── domain/                  # Test rápidos (sin dependencias externas)
│   ├── entities/            # Aquello que tiene identidad propia (ej: Transaction, Account)
│   │                        # Puede estar compuesta por varios Value Objects
│   ├── value-objects/       # Tipos de datos enriquecidos con lógica (ej: Money, IBAN)
│   └── events/              # Domain Events para comunicación entre módulos
│
├── application/             # Orquesta, NO calcula
│   ├── use-cases/           # Llaman a Entidades y Repos; testing con dobles In-Memory/fakes
│   ├── ports/               # Interfaces (contratos) que la infraestructura debe cumplir
│   └── dto/                 # Objetos de transferencia de datos (entrada/salida de use cases)
│
├── infrastructure/          # Acoplamiento con tecnologías concretas
│   │                        # Testing con contratos contra los puertos (port tests)
│   ├── persistence/         # ORM, repositorios concretos, migraciones
│   └── http/                # Controllers, routers, middlewares
│
├── composition/
│   └── container.ts         # Composition Root — ensamblado del grafo de dependencias (DI)
│
├── shared/
│   └── result.ts            # Tipo Result<T, E> para manejo funcional de errores
│
└── main.ts                  # Punto de entrada de la aplicación

tests/                       # Tests de integración y E2E (fuera de src)
```

---

## Consecuencias

### Positivas

- **Testabilidad alta:** la lógica de negocio en la capa de dominio es pura (sin dependencias externas), por lo que puede probarse con unit tests simples y rápidos, sin necesidad de base de datos.
- **Mantenibilidad a largo plazo:** los cambios en la base de datos, framework o UI no afectan el dominio. Es posible cambiar el ORM o migrar la UI sin reescribir la lógica de negocio.
- **Camino claro hacia microservicios (si alguna vez es necesario):** los módulos ya tienen fronteras bien definidas. Si en el futuro se requiere extraer uno, el esfuerzo es significativamente menor que partir de un monolito sin estructura.
- **Aprendizaje sólido:** la implementación forzará el dominio de conceptos como inversión de dependencias, inyección de dependencias, separación de responsabilidades y diseño orientado al dominio (DDD táctico).
- **Un solo deployment:** simplicidad operacional total. Una sola aplicación, un solo proceso, una sola base de datos.

### Negativas / Trade-offs

- **Curva de aprendizaje y tiempo inicial mayor:** requiere más estructura desde el inicio comparado con un CRUD simple. Para las primeras funcionalidades, se escribirá más código del necesario en el corto plazo.
  - *Mitigación:* aceptar que parte del tiempo es inversión de aprendizaje, no overhead puro.
- **Riesgo de sobre-diseño prematuro de módulos:** con requerimientos poco claros, trazar las fronteras de módulos incorrectamente puede generar refactorizaciones costosas.
  - *Mitigación:* comenzar con pocos módulos grandes y subdividir a medida que el dominio se comprende mejor. Preferir cohesión sobre granularidad al inicio.
- **No hay fuerza técnica que impida romper las fronteras:** a diferencia de los microservicios, un desarrollador descuidado podría acoplar módulos. Requiere disciplina.
  - *Mitigación:* establecer linting arquitectónico (herramientas como `dependency-cruiser` en Node.js o equivalentes) para validar que las dependencias respetan las reglas.
- **Es sobre-ingeniería para un CRUD básico:** si la aplicación nunca supera 3-4 entidades simples, esta estructura será más complejidad de la necesaria.
  - *Mitigación:* si el proyecto resulta más simple de lo esperado, se puede aplanar la estructura sin perder los principios clave.

---

## Notas sobre sobre-ingeniería

> **⚠️ Aviso honesto:** para un proyecto personal de una sola persona, esta arquitectura *es* sobre-ingeniería en términos de velocidad de entrega inicial. Un desarrollador experimentado podría entregar las primeras funcionalidades 2-3x más rápido con una arquitectura plana.
>
> Sin embargo, dado que el objetivo **explícito** del proyecto incluye aprender y practicar estas técnicas, el costo adicional está justificado. Si el objetivo cambia a "lanzar rápido y ver si la app tiene usuarios", se debería reconsiderar esta decisión y registrar un nuevo ADR.

---

## Referencias

- Martin, R.C. — *Clean Architecture: A Craftsman's Guide to Software Structure and Design* (2017)
- Newman, S. — *Monolith to Microservices* (2019) — Cap. 1: Just Enough Microservices
- Fowler, M. — [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html)
- Richards, M. — *Software Architecture Patterns* (2015) — Modular Monolith pattern

---

## Decisiones relacionadas

| ADR       | Título                              | Relación                                    |
|-----------|-------------------------------------|---------------------------------------------|
| ADR-002   | PostgreSQL + Supabase + Prisma      | Stack de datos compatible con esta arquitectura |
| ADR-016   | Testing framework (Vitest)          | Se apoya en la testabilidad que provee esta arquitectura |
| ADR-028   | Backend framework: NestJS → Express | Reescribió la capa HTTP sin tocar domain/application gracias a este aislamiento |
