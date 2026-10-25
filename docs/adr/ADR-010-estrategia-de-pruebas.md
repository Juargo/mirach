---
tipo: adr
proyecto: Mirach
estado: Propuesto
fecha: 2026-10-24
requisitos: [RNF-FIA-001, RNF-FIA-002, RNF-FIA-003, RNF-EXA-001, RNF-EXA-002, RNF-SEC-002, RNF-ACC-001, RNF-ACC-002, RNF-USA-003, PUB-06]
---

# ADR-010 — Pirámide de pruebas y criterios de aceptación

## Estado

Propuesto (2026-10-24). Las capas de unidad, integración, e2e del API y DAST corren en CI
(**vigente**). Los casos compartidos de formato, la prueba de mutación del dinero, las
pruebas de UI móviles y el formato de criterios de aceptación son **nuevos**.

## Contexto

- El riesgo se concentra en tres lugares: el dinero (exactitud), el aislamiento entre
  usuarios y la lectura de cartolas de cuatro bancos. Una cobertura pareja en todo el
  código no protege esos tres frentes.
- Hay dos apps separadas que deben mostrar los mismos números (RNF-EXA-002).
- RNF-FIA-001 y RNF-FIA-003 exigen probar con cartolas reales, no solo con datos inventados.

## Decisión

### 1. Pirámide

```
                 ▲   Pruebas con usuarios y exploratorias (manual)
                ▲▲▲  UI móvil: 3 a 5 recorridos críticos por app
              ▲▲▲▲▲  E2E del API (HTTP contra base real)
            ▲▲▲▲▲▲▲  Contrato (OpenAPI, clientes generados, fuzzing)
          ▲▲▲▲▲▲▲▲▲  Integración (repositorios, transacciones, aislamiento)
        ▲▲▲▲▲▲▲▲▲▲▲  Unidad (dominio, casos de uso, lectores, view models)
```

| Capa | Herramientas | Qué cubre | Dónde corre |
|------|--------------|-----------|-------------|
| Unidad, API | Vitest | Dinero, redondeo, 50/30/20, semáforo (umbral de 5 puntos), perfiles, mes financiero y tolerancia de 3 días, desempate de patrones, clave de duplicado, normalización de fechas, derechos por plan | Cada PR |
| Unidad, lectores | Vitest + fixtures | Un conjunto de pruebas por banco y producto, con cartolas reales anonimizadas; la suma de cargos y abonos coincide con los totales del archivo (IMP-03) | Cada PR |
| Unidad, apps | XCTest; JUnit + coroutines test | View models, formato de montos y fechas, manejo de errores del API | Cada PR que toca la app |
| Integración | Vitest + PostgreSQL efímero | Repositorios, transacciones todo o nada, migraciones, **un test de aislamiento por endpoint** | Cada PR del API |
| Contrato | `openapi:check`, clientes generados al día, Schemathesis, `oasdiff` (nuevo) | Que el contrato, los clientes y el API coincidan y que no haya cambios incompatibles | Cada PR |
| E2E del API | Vitest + Supertest | Flujos completos: login → vista previa → confirmar → resumen; borrar ingesta; borrar cuenta | Cada PR del API |
| UI móvil (nuevo) | XCUITest; Compose UI tests | Login con la cuenta de revisión, subir cartola, ver el resumen, cambiar de mes | Antes de cada release |
| Manual | Dispositivos reales, VoiceOver y TalkBack, fuente grande | Accesibilidad (RNF-ACC-001, RNF-ACC-002), cámara y archivos compartidos desde la app del banco | Antes de cada release |
| Validación con usuarios | 5 personas por ronda; TestFlight y prueba cerrada de Play (12 testers, 14 días) | Que se entienda el mes en menos de un minuto (RNF-USA-003) | Por hito |

### 2. Reglas por riesgo

- **Dinero:** cobertura de líneas del dominio de dinero ≥ 90 % y **prueba de mutación**
  (Stryker) en ese módulo: cada mutante sobreviviente es una prueba que falta.
- **Aislamiento:** un endpoint nuevo con datos de usuario no se integra sin su test de
  aislamiento.
- **Cartolas:** cada formato soportado tiene al menos una cartola real anonimizada por
  banco y producto (cuenta corriente y cuenta vista). Un error reportado por un usuario se
  convierte en fixture antes de corregirse.
- **Pruebas que pueden fallar:** cada prueba nueva se ve fallar antes de pasar, y en CI un
  `.only` olvidado hace fallar la corrida.

### 3. Fixtures de cartolas reales

- Las cartolas originales nunca entran al repo.
- Se anonimizan con un script: glosas reemplazadas por textos equivalentes, números de
  cuenta y RUT falsos, montos conservados para que los totales sigan cuadrando, estructura
  del archivo intacta.
- Las anonimizadas se versionan en `apps/api/test/fixtures/<banco>/<producto>/`.

### 4. Igualdad de números entre apps (nuevo)

- Los números los calcula el API (ADR-001); las apps solo los formatean.
- Un archivo de casos compartidos (por ejemplo `design/casos-formato.json`) define entradas
  y salidas esperadas: montos (`1234567` → `$1.234.567`), negativos, cero, porcentajes en
  puntos base, fechas y períodos (`25 sep – 24 oct`).
- Las pruebas de iOS y de Android leen el mismo archivo. Si una plataforma formatea distinto,
  su CI falla.

### 5. Paridad funcional

Cada comportamiento compartido es un escenario con ID estable `APP-<ÁREA>-<NN>` en
`openspec/specs/app-*`, con su alcance por plataforma. Las pruebas citan el ID y un script
en CI informa la cobertura faltante.

### 6. Criterios de aceptación

Cada requisito **Debe** de los requisitos funcionales tiene al menos un escenario en
formato Dado / Cuando / Entonces, derivado de su criterio de aceptación. El escenario lleva
el ID del requisito, y la prueba que lo automatiza cita el escenario.

```gherkin
# IMP-05 — Evitar duplicados entre cartolas que se solapan
Escenario: subir dos veces la misma cartola no duplica movimientos
  Dado que Marcela confirmó la cartola de octubre de Banco de Chile con 42 movimientos
  Cuando sube y confirma el mismo archivo otra vez
  Entonces la vista previa informa 42 duplicados omitidos
  Y su mes sigue teniendo 42 movimientos de esa cuenta

Escenario: dos compras idénticas el mismo día no se pierden
  Dado una cartola con dos cargos de $3.500 en "COPEC" el 12-10-2026, en filas distintas
  Cuando Marcela confirma la cartola
  Entonces se guardan los dos movimientos
```

```gherkin
# Regla 9 y VIS-02 — Estado de cada bloque
Escenario: necesidades sobre la meta
  Dado un perfil 50/30/20 y un ingreso de $1.000.000
  Y gastos en necesidades por $580.000
  Cuando Marcela abre el resumen del mes
  Entonces el bloque Necesidades muestra "58% de 50%"
  Y su estado es "Sobre", con marca cuadrada y texto, no solo color
```

Trazabilidad: requisito → escenario → prueba automatizada (o caso manual si no se puede
automatizar).

### 7. Definición de terminado

Un cambio está terminado cuando:

- [ ] Sus escenarios de aceptación existen y pasan.
- [ ] Tiene pruebas en la capa más baja que pueda detectar su falla.
- [ ] Si toca datos de usuario, tiene test de aislamiento.
- [ ] Si toca el contrato, regeneró ambos clientes y `oasdiff` no reporta cambios incompatibles.
- [ ] Si toca una pantalla compartida, el escenario `APP-*` está cubierto en ambas apps o
      marcado `Pendiente` con motivo.
- [ ] El CI está en verde y la revisión de seguridad del PR está hecha.
- [ ] Los logs nuevos no contienen montos ni datos personales.
- [ ] Si cambia una decisión estructural, hay un ADR.

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Meta de cobertura global (por ejemplo 80 % en todo) | Premia probar lo fácil; el riesgo está en tres frentes concretos. |
| Muchas pruebas de UI de punta a punta | Lentas y frágiles en dos plataformas; se reservan para pocos recorridos críticos. |
| Solo datos inventados para los lectores | RNF-FIA-001: cada formato real que falla es un usuario perdido. |
| Cucumber ejecutable para los escenarios | Agrega una capa de pegamento; los escenarios se escriben en Gherkin como especificación y se automatizan en Vitest, XCTest y JUnit citando su ID. |

## Consecuencias

- El tiempo de prueba se invierte donde está el riesgo.
- Los lectores PDF de BCI y Santander ya se prueban con cartolas reales
  (`apps/api/test/fixtures/pdf`). Falta reunir cartolas reales de cada banco en cuenta
  corriente y cuenta vista, en todos sus formatos (decisión pendiente 1 de los requisitos).
- La prueba de mutación es lenta; corre en el módulo de dinero, no en todo el código.

## Referencias

- ADR-001, ADR-003, ADR-005, ADR-008, ADR-009
- Requisitos funcionales v1 y RNF
- Serie anterior: ADR-014, ADR-015, ADR-016, ADR-018, ADR-054
