---
tags:
  - adr
  - fase-diseño
  - mobile
  - ios
  - android
  - testing
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-12
fecha_actualizacion: 2026-10-12
---

# ADR-054 — Paridad funcional entre iOS y Android

## Estado

✅ **Decidido** (2026-10-12, product owner). Complementa ADR-053 (paridad visual). Pendiente de
implementar: el formato de escenarios, el chequeo en CI y la carga inicial de las funcionalidades ya
construidas.

## Contexto

Mirach tiene dos apps nativas escritas por separado (ADR-046, D1 y D8): la de iPhone va adelante y la de
Android la sigue (ADR-052). Ambas son clientes delgados generados desde `apps/api/openapi.json` (D9), así
que los datos y las reglas de negocio ya son los mismos: un cambio del contrato regenera los dos clientes
o rompe el build.

Lo que puede divergir son las **pantallas**: que una app tenga una funcionalidad que la otra no, o que la
misma funcionalidad se comporte distinto (estados vacíos, errores, confirmaciones, formatos). Hoy la única
referencia es la frase "la app de iPhone es la referencia de comportamiento" en
`odd/tasks/app-android.md`, que depende de que alguien compare a mano. Un ejemplo real: el mes con gastos
pero sin ingresos muestra el estado vacío en ambas apps, y se detectó al probar, no por un chequeo.

Las especificaciones `openspec/specs/mobile-*` describen la app Expo anterior (`apps/mobile`, retirada) y
no sirven como contrato de las apps nativas.

## Decisión

1. **Escenarios compartidos con ID estable.** Cada funcionalidad visible de las apps se describe una sola
   vez, independiente de la plataforma, en `openspec/specs/app-<funcionalidad>/spec.md` (por ejemplo
   `app-resumen`, `app-sesion`, `app-perfil`, `app-subir-cartola`). Cada escenario tiene un ID con el
   formato `APP-<ÁREA>-<NN>` (por ejemplo `APP-RES-03`) en el estilo GIVEN/WHEN/THEN ya usado en
   `openspec/specs/`. Los IDs no se reutilizan: un escenario retirado se marca como retirado.
2. **Cada escenario declara su alcance de plataforma** con una de estas líneas:
   - `Plataformas: ios, android` (por defecto);
   - `Pendiente: android — <motivo>` (o `ios`): la funcionalidad existe en una app y todavía no en la otra;
   - `Solo: ios — <motivo y ADR>` (o `android`): diferencia intencional, por ejemplo Sign in with Apple
     solo en iOS (ADR-052).
3. **Los tests citan el escenario.** Al menos un test de cada app que cubre un escenario lleva su ID en el
   nombre o en un comentario `// scenario: APP-RES-03`, en `apps/ios/MirachTests` y en
   `apps/android/app/src/test` (o `androidTest`).
4. **Chequeo de paridad en CI.** Un script en `scripts/` (Node, sin dependencias, con su propio test, como
   los generadores de tokens) recorre los escenarios y las referencias de los tests, y falla si:
   - un escenario de `Plataformas: ios, android` no tiene test en alguna de las dos apps;
   - un test cita un ID que no existe o que está retirado;
   - un escenario `Pendiente` o `Solo` no tiene motivo.

   Lista como deuda visible, sin fallar, los escenarios `Pendiente`. Corre en CI cuando cambian las
   especificaciones o cualquiera de las dos apps.
5. **Definición de terminado.** Una funcionalidad nueva se considera terminada cuando sus escenarios
   existen y están cubiertos en ambas apps, o cuando la plataforma faltante está marcada `Pendiente` con
   motivo. Una app puede ir adelante; lo que no puede pasar es que la diferencia quede sin registrar.
6. **Alcance.** Los escenarios describen comportamiento observable (qué ve la persona, qué puede hacer,
   qué pasa ante un error). No describen el *chrome* del sistema, que ADR-053 deja nativo, ni detalles
   internos de implementación.

## Consecuencias

- "Las dos apps tienen lo mismo" deja de ser una promesa y pasa a ser un hecho que el build verifica.
- Las diferencias quedan a la vista: la lista de `Pendiente` es el atraso de cada plataforma y la de
  `Solo` documenta las diferencias intencionales con su razón.
- Agrega trabajo por funcionalidad: escribir los escenarios antes o junto con la primera implementación y
  citar su ID en los tests de cada app. Encaja con el TDD estricto ya en uso: el escenario es el punto de
  partida del test en rojo.
- El chequeo prueba que existe un test que cita el escenario, no que el test sea bueno. La calidad sigue
  dependiendo de la revisión.
- Carga inicial: las funcionalidades ya construidas (sesión, Resumen, Perfil y las pantallas de iPhone que
  Android todavía no tiene) se describen primero; lo que falta en Android entra como `Pendiente: android`.
- `openspec/specs/mobile-*` queda como historia de la app Expo; los escenarios nuevos no la extienden.

## Alternativas consideradas

- **Matriz de funcionalidades a mano** (una tabla funcionalidad × plataforma). Barata, pero nada la
  verifica y se desactualiza en silencio.
- **Solo depender del contrato de la API.** Ya garantiza los mismos datos, pero no detecta pantallas
  faltantes ni comportamientos distintos.
- **Pruebas de extremo a extremo compartidas** (por ejemplo flujos de Maestro que corren en ambas apps).
  Darían la prueba más fuerte, pero exigen emuladores y simuladores en CI, son lentas y frágiles, y siguen
  necesitando un catálogo de escenarios. Se pueden sumar más adelante sobre los mismos IDs.
- **Una sola base de código de interfaz** (Compose Multiplatform, Flutter o React Native). Daría paridad
  por construcción, pero ADR-053 ya la descartó por obligar a reescribir la app de iPhone.
