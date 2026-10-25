---
tipo: planificación
categoria: Priorización del Product Backlog (Scrum)
proyecto: Mirach
fecha: 2026-10-24
estado: borrador para revisión
---

# Priorización del Product Backlog v1

> Basado en [Requisitos funcionales v1](requisitos-funcionales-v1.md) y [RNF](requisitos-no-funcionales.md). Los puntajes, tamaños y cortes de este documento son **propuestas para revisar**, no decisiones tomadas. Se ajustan después de la [prueba del prototipo](pruebas-de-usuario/prueba-prototipo-v1.md) y de los dos primeros sprints.

## 1. Dónde estamos en el ciclo Scrum

| Fase | Artefacto en Mirach | Estado |
|---|---|---|
| Visión del producto | Estudio de mercado, problema, diferenciador, nicho, monetización | Hecho |
| Usuarios y roles | Personas Marcela y Cristián, tabla de roles | Hecho |
| Product Backlog inicial | 123 RF en 11 módulos y 27 RNF | Hecho |
| Prototipo | Wireframes en Figma (Mirach-UI) | Hecho, prueba con usuarios pendiente |
| **Refinamiento y orden del backlog** | **Este documento** | **Ahora** |
| Release planning | Cortes Beta, v1.0 y v1.1 (sección 6) | Propuesto aquí |
| Sprint 0 | Preparación técnica y de validación (sección 7) | Siguiente |
| Sprints 1 a n | Incrementos con objetivo de sprint | Después |
| Review y retrospectiva | Al cierre de cada sprint | Después |

En Scrum el Product Backlog no es una lista clasificada en Debe, Debería y Podría: es una **lista ordenada**, donde lo de arriba es lo siguiente que se construye. El MoSCoW que ya existe sirve como primer filtro, pero no dice qué va primero.

## 2. Objetivo del producto (Product Goal)

> Que una persona con sueldo fijo en Chile, sin conocimientos de finanzas, suba la cartola de su banco y entienda en menos de un minuto si su mes está equilibrado según el 50/30/20, sin entregar claves bancarias.

Cada sprint debe acercar la app a este objetivo. Un ítem que no lo hace baja en el backlog, aunque sea "Debe".

## 3. Diagnóstico del backlog actual

| Prioridad | Cantidad | % |
|---|---|---|
| Debe | 77 | 63% |
| Debería | 35 | 28% |
| Podría | 11 | 9% |
| **Total** | **123** | |

Por módulo:

| Módulo | Debe | Debería | Podría |
|---|---|---|---|
| IMP Importación | 18 | 3 | 3 |
| CLA Clasificación | 15 | 3 | 0 |
| VIS Visualización | 9 | 6 | 2 |
| MOV Movimientos | 7 | 2 | 1 |
| LAN Landing | 6 | 3 | 0 |
| PER Perfil y onboarding | 5 | 3 | 1 |
| PRI Privacidad | 5 | 1 | 0 |
| PUB Publicación | 5 | 2 | 0 |
| AUTH Cuenta | 5 | 1 | 1 |
| PLA Planes | 1 | 7 | 1 |
| SOP Soporte | 1 | 1 | 1 |
| ADM Administración | 0 | 3 | 1 |

**Lectura:** la guía habitual de MoSCoW es que lo "Debe" no pase del 60% del esfuerzo, para dejar margen ante imprevistos. Con 63% de los ítems en "Debe" y un solo desarrollador, el v1 completo no cabe en un primer release. Por eso la propuesta separa el "Debe" en dos cortes: lo que necesita la beta para validar y lo que necesita la publicación en tiendas.

### Inconsistencias que conviene resolver antes de ordenar

| # | Qué pasa | Propuesta |
|---|---|---|
| 1 | IMP-24 (límite de bancos del plan gratis) y PLA-07 (conservar datos al vencer el plan) son "Debe", pero los planes (PLA-01 a 06) son "Debería" | Que IMP-24 y PLA-07 sigan la suerte de PLA: si los planes no entran en v1.0, tampoco ellos |
| 2 | CLA-05 y CLA-07 (Debería) se solapan con CLA-09 (Debe): los tres hablan de crear y editar categorías y reglas | Fusionarlos en CLA-09 y dejar CLA-07 solo como "ver por qué un movimiento quedó en un bloque" |
| 3 | IMP-17 (reprocesar) exige guardar el archivo, lo que choca con IMP-07 y RNF-PRV-005 | Descartar IMP-17 del v1 |
| 4 | IMP-22 (eliminar una ingesta) y PRI-05 (borrar una importación) son el mismo requisito | Dejar uno y referenciar el otro |
| 5 | RNF-LOC-002 se solapa con CLA-06 (catálogo de comercios chilenos) | Ya estaba anotado en el RNF; dejarlo en CLA-06 |
| 6 | Falta MOV-08 en la numeración | Confirmar si se eliminó a propósito |
| 7 | RNF dice "dos apps nativas separadas" y no hay decisión sobre qué plataforma va primero (pendiente 9) | Es la decisión que más cambia el plan; ver sección 8 |

## 4. Método de priorización

Se usan tres capas, en este orden:

1. **Corte por release.** Cada requisito se asigna a Beta cerrada, v1.0 pública, v1.1 o Después. El MoSCoW se aplica dentro de cada release, no al producto entero.
2. **Orden por WSJF simplificado** (Weighted Shortest Job First), a nivel de épica:
   `WSJF = (Valor para el usuario + Reducción de riesgo + Urgencia u obligación) / Tamaño`
   Cada factor usa la escala 1, 2, 3, 5, 8. El tamaño es relativo, no horas.
3. **Dependencias.** WSJF sugiere; si un ítem depende de otro, el otro va primero aunque puntúe menos.

**Por qué WSJF y no solo valor:** el mayor riesgo del producto es técnico (leer cartolas de cuatro bancos) y de adopción (que Marcela logre subir una). Un método que premia reducir riesgo empuja esos ítems arriba, que es lo que Scrum busca con un incremento temprano y usable.

### Los RNF no van como ítems: van en la Definición de Terminado

La mayoría de los RNF son condiciones que debe cumplir **toda** historia, no trabajo aparte. Se agregan a la Definición de Terminado (sección 9). Solo se convierten en ítems del backlog los que requieren trabajo propio, como habilitadores técnicos:

| RNF | Cómo se trata |
|---|---|
| SEC-001, SEC-002, SEC-004, EXA-001, ACC-001, LOC-001, USA-001 | Definición de Terminado |
| SEC-003 (cifrado por columna y llaves fuera de la base) | Habilitador en Sprint 0 |
| FIA-003 (pruebas con cartolas reales) | Habilitador en Sprint 0 y DoD de cada lector |
| OBS-001 (métricas de validación) | Habilitador en Incremento 1 |
| EXA-002 (mismos números en iPhone y Android) | Habilitador cuando exista la segunda app |
| PER-001, PER-002, ACC-002, USA-006 | Criterio de aceptación en las historias de IMP y VIS |
| PRV-004 (Ley 21.719) | Revisión antes de v1.0 |

## 5. Épicas y su orden

| Orden | Épica | Módulos | Valor | Riesgo | Urgencia | Tamaño | WSJF | Por qué en este lugar |
|---|---|---|---|---|---|---|---|---|
| 1 | E0 Validación | LAN, prueba de prototipo | 3 | 5 | 5 | 2 | **6,5** | Barata y confirma o descarta el nicho antes de construir. La lista de espera y la puerta falsa de precios (LAN-03, LAN-04) son la validación prevista en el estudio |
| 2 | E1 Mi primer mes | AUTH, IMP, CLA, VIS (mínimo) | 5 | 5 | 3 | 5 | **2,6** | Esqueleto de punta a punta: entra, sube una cartola de un banco y ve sus tres bloques. Prueba la hipótesis central |
| 3 | E6a Métricas mínimas | ADM-01, ADM-03, OBS-001 | 2 | 3 | 2 | 2 | **3,5** | Va junto con E1: sin medir activación y errores de importación, la beta no enseña nada |
| 4 | E2 Mis cuatro bancos | IMP, CLA-04 | 5 | 5 | 2 | 8 | **1,5** | El mayor riesgo técnico. Va antes que E3 porque sin datos reales los ajustes de clasificación no se pueden probar bien |
| 5 | E3 Ordenar mi mes | MOV, CLA, PER, VIS | 5 | 3 | 2 | 8 | **1,3** | Lo que convierte "ver" en "usar cada mes": reclasificar, patrones, perfiles y mes financiero |
| 6 | E4 Listo para tiendas | AUTH-01/05, PRI, SOP, LAN-05/06/07, PUB | 2 | 2 | 5 | 5 | **1,8** | Obligatorio para publicar. Puntúa más que E2 y E3, pero depende de que la app exista |
| 7 | E5 Monetización | PLA, IMP-24, PUB-05 | 3 | 2 | 1 | 5 | **1,2** | El precio todavía es un supuesto; conviene medir retención antes de cobrar |
| 8 | E7 Extras | VIS-08/09/13/14/15/16, MOV-06/07 y otros | 2 | 1 | 1 | 5 | **0,8** | Mejoran la experiencia pero no responden la pregunta central |

## 6. Plan de releases

Sprints de **2 semanas**. No hay velocidad conocida, así que los números de sprint son orientativos: la fecha de cada release se compromete recién después del Sprint 2, con la velocidad real.

| Release | Incremento y objetivo de sprint | Sprints (estimado) | Para quién |
|---|---|---|---|
| — | **Sprint 0:** preparar validación, cartolas reales y base técnica | 1 | Solo tú |
| Alfa | **Incremento 1, "Mi primer mes":** entro con Google, subo una cartola Excel de un banco y veo mis tres bloques | 2 | Tú y 1 o 2 cercanos |
| Alfa | **Incremento 2, "Mis cuatro bancos":** subo Excel o PDF de cualquiera de los cuatro bancos, sin duplicados y con errores claros | 2 a 3 | Igual |
| **Beta cerrada** | **Incremento 3, "Ordenar mi mes":** corrijo lo mal clasificado, elijo mi perfil y mi mes financiero, y lo uso un mes completo | 2 | 12 a 20 personas tipo Marcela en pista cerrada |
| **v1.0 pública** | **Incremento 4, "Listo para tiendas":** cumplo lo que exigen App Store, Google Play y la Ley 21.719 | 2 | Público en Chile |
| v1.1 | **Incremento 5, "Plus":** planes, prueba de 30 días y cobro | 2 | Público |

### Asignación de cada requisito

| Módulo | Incr. 1 | Incr. 2 | Incr. 3 (Beta) | Incr. 4 (v1.0) | v1.1 | Después o descartado |
|---|---|---|---|---|---|---|
| AUTH | 02, 03, 04 | | | 01, 05 | 06 | 07 |
| PER | 02 | | 01, 03, 04, 06, 08 | 09 | 05 | 07 |
| IMP | 01, 02 (un banco), 03, 04, 07, 14, 16, 18, 19, 21, 23 | 02 (cuatro bancos), 05, 06, 08, 11, 13, 15, 20, 22 | | 09, 10 | 24 | 12; 17 descartado |
| MOV | 01 (básico) | | 02, 03, 04, 05, 09, 10 | 11 | 06 | 07 |
| CLA | 01, 02, 06, 08, 12, 13, 14, 18 | 04 | 03, 09, 10, 11, 15, 16, 17 | 07 | 05 (fusionar con 09) | |
| VIS | 01, 02, 07, 10, 11 | | 03, 04, 05, 06, 12, 17 | 08, 13, 14, 16 | | 09, 15 |
| PLA | | | | | 01 a 07, 09 | 08 |
| PRI | 02, 03 | | | 01, 04, 05 | 06 | |
| SOP | | | 03 | 01, 02 | | |
| ADM | 01 (mínimo), 03 | | | 02 | | 04 |
| LAN | Sprint 0: 01, 02, 03, 04, 08, 09 | | 05 | 06, 07 | | |
| PUB | Sprint 0: 01 (Google), 04, 07 | | 06 | 01 (Apple), 02, 03 | 05 | |

**Notas de la asignación:**

- **Incremento 1 usa un solo banco.** Banco de Chile, porque es el único con formato Excel verificado. Así se prueba la cadena completa (subir, leer, clasificar, mostrar) antes de multiplicarla por cuatro.
- **El onboarding completo (PER-01) va en el Incremento 3**, cuando existen todas las piezas que lo componen. En el Incremento 1 basta con declarar el ingreso.
- **PER-08 (mes financiero) sube a la beta** aunque sea "Debería", porque cambia cómo se calculan todos los totales. Agregarlo tarde obliga a rehacer la visualización.
- **SOP-03 ("¿te sirvió?") sube a la beta** aunque sea "Podría", porque es barato y es una señal de validación.
- **LAN-05 (política de privacidad pública) va en la beta**, porque las tiendas la piden también en las pistas de prueba.

## 7. Sprint 0

Objetivo: **dejar listo todo lo que bloquea el Incremento 1 y empezar a medir interés.**

| Ítem | Tipo | Por qué ahora |
|---|---|---|
| Reunir cartolas reales de los cuatro bancos, cuenta corriente y cuenta vista (pendiente 1) | Investigación | Bloquea E2 entero. BCI y Santander no están verificados |
| Ejecutar la prueba del prototipo v1 con 3 a 5 personas | Validación | Puede reordenar E3 antes de construirlo |
| Landing con lista de espera y puerta falsa de precios (LAN-01, 02, 03, 04, 08, 09) | Validación | Mide el umbral de 5% de visitas mientras se construye |
| Cuenta de Google Play Console (PUB-01) | Habilitador | Las cuentas personales nuevas deben pasar una prueba cerrada antes de publicar en producción; confirmar el requisito vigente |
| Definir versiones mínimas de sistema operativo (PUB-04) | Decisión | Afecta el proyecto base |
| Confirmar el nombre y el ícono (PUB-07) | Decisión | Ya está el dominio mirachbudget.app; falta revisar choques en las tiendas |
| ADRs pendientes: plataforma primero, cifrado por columna (SEC-003), manejo de montos (EXA-001) | Habilitador | Sin ellos la DoD no se puede cumplir |
| Repositorio, CI y primeras pruebas con cartolas reales (FIA-003) | Habilitador | El camino crítico de ingesta debe estar cubierto desde el primer lector |
| Estimar en puntos las historias del Incremento 1 | Refinamiento | Permite medir velocidad desde el Sprint 1 |

## 8. Decisiones que necesito de ti

| # | Decisión | Opciones | Propuesta |
|---|---|---|---|
| A | ¿Qué plataforma va primero? (pendiente 9) | Android primero / iPhone primero / ambas a la vez | **Android primero:** Google Play no exige cuenta pagada de Apple, la pista cerrada es simple y Android tiene la mayoría del mercado en Chile. Con dos apps nativas, hacer ambas a la vez duplica cada sprint |
| B | ¿Los planes entran en v1.0 o en v1.1? | v1.0 con cobro / v1.0 todo gratis y cobro en v1.1 | **v1.1**, con "Plus gratis durante el lanzamiento". Permite medir retención antes de cobrar y saca IMP-24 y PLA-07 del camino crítico. Riesgo: los primeros usuarios pueden molestarse cuando empiece el cobro, así que conviene avisarlo desde el inicio |
| C | ¿Se aceptan las fusiones de la sección 3 (CLA-05/07 con CLA-09, IMP-22 con PRI-05, descartar IMP-17)? | Sí / No | Sí |
| D | Duración del sprint | 1 semana / 2 semanas | **2 semanas**, por trabajar en paralelo con el magíster |

## 9. Definiciones de Listo y de Terminado

### Definición de Listo (DoR): una historia entra a un sprint si…

- Tiene criterio de aceptación verificable (ya lo tienen casi todas en el documento de RF).
- Tiene pantalla en Figma, si tiene interfaz.
- No depende de una decisión pendiente.
- Está estimada en puntos.
- Si toca importación, hay al menos una cartola real del banco para probarla.

### Definición de Terminado (DoD): una historia está terminada si…

- Cumple su criterio de aceptación.
- Ningún usuario puede ver datos de otro; el filtro se aplica en la consulta (RNF-SEC-002).
- Los logs y reportes de error no contienen montos ni datos personales (RNF-SEC-004).
- Los montos usan tipos exactos, sin decimales flotantes (RNF-EXA-001).
- El estado de un bloque no depende solo del color (RNF-ACC-001).
- Textos en español de Chile, montos y fechas en formato local, sin jerga financiera (RNF-LOC-001, RNF-USA-001).
- Un archivo malformado se rechaza de forma controlada (RNF-SEC-001), si la historia toca importación.
- Tiene pruebas automáticas; las de ingesta usan cartolas reales (RNF-FIA-003).
- Está integrada en la rama principal y corre en un dispositivo real.

## 10. Eventos de Scrum para un equipo de una persona

Tú eres Product Owner, desarrollador y Scrum Master a la vez. Los eventos se mantienen, pero cortos:

| Evento | Duración sugerida | Qué produce |
|---|---|---|
| Sprint Planning | 1 hora | Objetivo del sprint y lista de historias con puntos |
| Daily | 5 minutos, escrito en Obsidian | Qué hice, qué sigue y qué me bloquea |
| Refinamiento | 1 hora a mitad de sprint | Las historias del próximo sprint cumplen la DoR |
| Sprint Review | 30 minutos | Demo grabada o en persona con alguien tipo Marcela cuando sea posible |
| Retrospectiva | 30 minutos | Una mejora concreta para el siguiente sprint |

## 11. Siguiente paso

Con las decisiones A a D tomadas, el paso que sigue en el índice es **Milestones, sprints e issues**: convertir los incrementos en milestones del repositorio y cada requisito del Incremento 1 en un issue con su criterio de aceptación y sus puntos.
