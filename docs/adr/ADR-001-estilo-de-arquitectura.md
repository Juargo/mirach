---
tipo: adr
proyecto: Mirach
estado: Aceptado
fecha: 2026-10-24
requisitos: [RNF-EXA-001, RNF-EXA-002, RNF-FIA-001, RNF-FIA-002, RNF-SEC-002, IMP-10]
---

# ADR-001 — Estilo de arquitectura: monolito modular con Clean Architecture y clientes nativos delgados

## Estado

Aceptado (2026-10-25); propuesto el 2026-10-24. Formaliza lo que ya está construido en `apps/api`, `apps/ios` y
`apps/android` (**vigente**) y agrega la división en módulos y el uso acotado de eventos
(**nuevo**).

## Contexto

- Un solo desarrollador construye y opera el producto, en fase de validación de mercado.
- Hay tres clientes: app de iPhone (Swift), app de Android (Kotlin) y una landing estática.
  Las dos apps son código separado, sin base común.
- RNF-EXA-002 exige que iPhone y Android muestren exactamente los mismos números para el
  mismo mes. Con dos códigos separados, cualquier cálculo duplicado puede divergir.
- El riesgo técnico mayor está en la ingesta de cartolas (cuatro bancos, Excel y PDF) y en
  el dinero (exactitud, aislamiento entre usuarios), no en el volumen de tráfico.
- El API heredado de MoneyDiary ya sigue Clean Architecture (`domain ← application ←
  infrastructure`), con `Result<T,E>` en lugar de excepciones y un composition root manual
  en `composition/container.ts`.

## Decisión

### 1. Backend: monolito modular (vigente)

Un solo proceso Node.js desplegado como una unidad, con una sola base de datos. Por dentro
sigue Clean Architecture con puertos y adaptadores (hexagonal):

```
domain          entidades, value objects, reglas de dinero y clasificación, errores
   ↑
application     casos de uso, puertos (interfaces), DTOs
   ↑
infrastructure  Express, Prisma, lectores Excel/PDF, verificadores de identidad, logging, cifrado
```

- La dependencia apunta siempre hacia el dominio. El dominio no conoce Express, Prisma ni
  ningún SDK.
- Los errores de negocio viajan como `Result.fail(error)`; no se lanzan excepciones en
  `domain` ni en `application`.
- El grafo de dependencias se arma a mano en `composition/container.ts`, sin decoradores
  ni contenedor de inyección.

### 2. Módulos del monolito (nuevo)

El código se organiza en módulos con límites explícitos. Comparten proceso y base de datos,
pero un módulo no lee las tablas de otro: usa sus casos de uso o puertos.

| Módulo | Responsabilidad | Requisitos |
|--------|-----------------|------------|
| Identidad y cuenta | Inicio de sesión, sesiones, borrado de cuenta | AUTH |
| Ingesta | Detectar banco, leer Excel y PDF por banco, normalizar, detectar duplicados, vista previa y confirmación | IMP |
| Clasificación | Catálogo por usuario, patrones, reclasificación | CLA, MOV-03 |
| Presupuesto | Perfiles de porcentajes, mes financiero, resumen, semáforo | PER, VIS |
| Suscripción | Planes, derechos, eventos de las tiendas | PLA (ADR-012) |
| Privacidad | Consentimientos, exportación, borrado | PRI |

Hoy los módulos están separados por carpeta y convención. La verificación automática de
límites (una regla de dependencias en el lint, por ejemplo `dependency-cruiser`) queda
como tarea.

### 3. Lectores de banco como estrategia (vigente)

Cada combinación banco y formato es un adaptador que implementa el mismo puerto de lectura.
Agregar un banco o un formato nuevo significa agregar un adaptador y sus fixtures, sin
tocar el dominio ni los otros lectores.

### 4. Clientes nativos delgados (vigente)

- Las apps muestran datos y capturan acciones. **Toda regla que cambie un monto, un
  porcentaje, un estado del semáforo o una clasificación vive en el API.** Si una pantalla
  necesita un cálculo nuevo, se agrega al API.
- Patrón de presentación: MVVM (SwiftUI con `ObservableObject`/`@Observable`, Compose con
  `ViewModel`). Las vistas dependen de un protocolo propio (`MirachAPI`) que envuelve el
  cliente generado desde `openapi.json`.
- Formatear un monto o una fecha es presentación y vive en la app; el criterio de igualdad
  entre plataformas se prueba con casos compartidos (ADR-010).

### 5. Eventos: uso puntual, sin broker (nuevo)

Event-driven no es el estilo del sistema. Se usan eventos solo donde el problema es de
naturaleza asincrónica o cruza módulos:

- **Eventos externos:** las notificaciones de las tiendas sobre suscripciones llegan por
  webhook y se procesan de forma idempotente (ADR-012).
- **Eventos de dominio en proceso:** cuando un caso de uso debe avisar a otro módulo
  (por ejemplo `CuentaEliminada` → revocar el token de Apple; `IngestaConfirmada` → evento
  de producto para los KPIs de ADR-011). Se despachan de forma síncrona dentro del mismo
  proceso.

### 6. Ingesta síncrona (vigente) con gatillo para cola

La vista previa de una cartola se procesa dentro de la petición HTTP, con el archivo en
memoria. Si el p95 de la vista previa supera 5 segundos o hay timeouts (IMP-10), la ingesta
pasa a una cola de trabajos **en la misma PostgreSQL** (por ejemplo `pg-boss` o una tabla
de trabajos) y la app consulta el estado. No se agrega un broker externo.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Microservicios (ingesta, clasificación, presupuesto por separado) | Un desarrollador, sin carga que lo justifique. Confirmar una ingesta (guardar movimientos y clasificarlos) pasaría a ser una transacción distribuida. Multiplica despliegues, observabilidad y costos. |
| Event-driven con broker (Kafka, RabbitMQ, SQS) | Ningún flujo de la v1 es asincrónico por naturaleza. Agrega infraestructura y consistencia eventual donde hoy hay transacciones simples. |
| Serverless (funciones por endpoint) | Arranques en frío, límites de memoria y tiempo para `pdf.js`, y un dominio fragmentado en funciones. |
| Backend as a Service (apps contra Supabase directo, con RLS) | Llevaría las reglas de dinero a dos clientes (rompe RNF-EXA-002) y pondría credenciales de base de datos en los binarios. |
| Kotlin Multiplatform o lógica compartida en cliente | Una tercera cadena de build que aprender; la igualdad de números se logra mejor centralizando el cálculo en el API. |

## Consecuencias

- El cálculo del 50/30/20 existe una sola vez, en el dominio del API: iPhone y Android no
  pueden divergir en los números, solo en la presentación.
- El dominio se prueba sin base de datos ni HTTP; el cambio de NestJS a Express (2026)
  no tocó `domain` ni `application`, lo que valida el aislamiento.
- Cada pantalla depende del API: sin conexión, la app no calcula nada. Es aceptable en la
  v1 (no hay modo sin conexión en los requisitos).
- Los límites entre módulos dependen de disciplina hasta que se automatice su verificación.
- Si en el futuro un módulo necesita escalar distinto (por ejemplo, la ingesta), puede
  extraerse porque ya habla con el resto por puertos.

## Referencias

- ADR-003 Mantenibilidad y escalabilidad
- ADR-005 API REST con contrato OpenAPI
- ADR-012 Suscripciones y derechos por plan
- Serie anterior: ADR-005, ADR-024, ADR-028, ADR-046 (`git show 0f33729^:docs/adr/...`)
