---
tipo: adr
proyecto: Mirach
estado: Aceptado
fecha: 2026-10-24
requisitos: [RNF-PER-001, RNF-PER-002, RNF-EXA-002, RNF-FIA-001, RNF-USA-006, PER-06, PER-08]
---

# ADR-003 — Mantenibilidad y escalabilidad

## Estado

Aceptado (2026-10-25); propuesto el 2026-10-24.

## Contexto

- Un desarrollador mantiene tres bases de código (API, iPhone, Android) y una landing.
- El costo de mantenimiento más probable no es el tráfico: es que un banco cambie el formato
  de su cartola, que las dos apps se desalineen o que un cambio del API rompa versiones ya
  instaladas.
- Carga esperada: el estudio de mercado proyecta entre $3,4 y $16,3 millones al año a 24
  meses con suscripción de ~$3.490. Eso equivale a entre ~80 y ~400 suscriptores pagos;
  contando usuarios gratis, del orden de miles de cuentas, no de cientos de miles.
- Un usuario genera pocos cientos de movimientos al mes y sube unas pocas cartolas al mes.
- PER-06 y PER-08 decidieron que los totales se calculan al momento a partir de los
  movimientos (cambiar el perfil o el día de corte recalcula todos los meses).

## Decisión

### Mantenibilidad

1. **Regla de dependencias y módulos** de ADR-001. Un cambio en un lector de banco no toca
   el dominio; un cambio de framework no toca los casos de uso.
2. **Contrato como fuente única.** `apps/api/openapi.json` se genera desde los esquemas Zod
   y se versiona. Los clientes Swift y Kotlin se generan desde él y se commitean. El CI
   falla si el contrato o un cliente quedó desactualizado (ADR-005, ADR-008).
3. **Diseño compartido.** `design/tokens.json` es la fuente de colores, tipografía, radios
   y textos de los bloques. Los scripts generan los recursos de iOS y Android de forma
   determinista, y el CI falla si quedaron desactualizados (RNF-USA-006).
4. **Paridad funcional entre apps.** Cada comportamiento compartido es un escenario con ID
   estable (`APP-<ÁREA>-<NN>`); las pruebas de cada app citan el ID y un chequeo en CI
   informa qué falta en cada plataforma (ADR-010).
5. **Un banco, un adaptador, sus fixtures.** Agregar o arreglar un formato de cartola es un
   cambio local con pruebas sobre cartolas reales anonimizadas (RNF-FIA-001).
6. **Código.** TypeScript en modo estricto; nombres en español en `domain` y `application`,
   en inglés en `infrastructure`; Conventional Commits; principios SOLID, DRY, KISS y YAGNI
   como skills del repo; pocas dependencias y actualizadas con Dependabot.
7. **Decisiones escritas.** Cada decisión estructural tiene un ADR, y `CLAUDE.md` resume
   las reglas vivas para los agentes de código.

Indicadores de mantenibilidad que se revisan cada trimestre:

| Indicador | Meta |
|-----------|------|
| Tiempo para soportar un formato de cartola nuevo o cambiado | ≤ 2 días |
| Escenarios `APP-*` cubiertos en ambas plataformas | 100 % de los marcados para ambas |
| Dependencias con vulnerabilidad alta o crítica abiertas | 0 |
| Tiempo de CI de un PR del API | ≤ 15 minutos |

### Escalabilidad

1. **API sin estado.** Las sesiones viven en la base y los archivos se procesan en memoria
   durante la petición. Cualquier instancia atiende cualquier petición.
2. **Escalar en este orden:** primero vertical (más memoria y CPU en Render), después
   horizontal (más instancias detrás del balanceador de Render). No se necesita cambiar
   código para el segundo paso.
3. **Cálculo al momento.** El resumen del mes se calcula con una consulta agregada por
   usuario y rango de fechas, apoyada en el índice `(accountId, fecha)`. No se guardan
   totales precalculados mientras no haga falta: así cambiar el perfil o el día de corte no
   exige recalcular nada guardado.
4. **Conexiones.** El API se conecta a través de Supavisor; el tamaño del pool de Prisma se
   fija explícitamente para no agotar las conexiones del plan.
5. **Ingesta, el punto caliente.** Leer un PDF ocupa CPU en el mismo hilo de Node. Se
   acota con el límite de 10 MB por archivo, un límite de páginas, un tiempo máximo por
   lectura y un límite de subidas por usuario (ADR-009).

### Gatillos

| Señal medida (ADR-011) | Acción |
|------------------------|--------|
| p95 de `GET /api/resumen` > 500 ms sostenido | Revisar consultas e índices; si no basta, materializar totales por usuario y mes, invalidados al cambiar movimientos, perfil o día de corte |
| p95 de la vista previa de cartola > 5 s, o timeouts | Mover la lectura de PDF a `worker_threads` o a una cola en PostgreSQL (ADR-001) |
| CPU > 70 % o memoria > 80 % sostenidas | Subir de plan en Render; si ya está en el plan mayor razonable, agregar instancias |
| Conexiones a la base cerca del límite | Ajustar el pool o subir el plan de Supabase |
| > 10.000 usuarios activos al mes | Revisar este ADR completo |

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Precalcular totales por mes desde el inicio | Complica PER-06 y PER-08 (recalcular todo al cambiar perfil o día de corte) para resolver un problema de rendimiento que con esta carga no existe. |
| Caché distribuida (Redis) | No hay consultas lentas que cachear; agrega una pieza que operar y datos financieros en otro lugar. |
| Escalado automático desde el día uno | El tráfico esperado cabe en una instancia; el escalado manual por gatillos es suficiente y más barato. |

## Consecuencias

- La arquitectura soporta el crecimiento esperado a 24 meses sin cambios estructurales.
- El esfuerzo de mantenimiento se concentra en los lectores de banco y en la paridad entre
  apps; por eso esos dos frentes tienen las pruebas más estrictas (ADR-010).
- Los gatillos dependen de medir: sin las métricas de ADR-011 no se sabe cuándo actuar.

## Referencias

- ADR-001 Estilo de arquitectura
- ADR-005 API REST con contrato OpenAPI
- ADR-010 Pirámide de pruebas
- ADR-011 Observabilidad
- Serie anterior: ADR-005, ADR-011, ADR-053, ADR-054
