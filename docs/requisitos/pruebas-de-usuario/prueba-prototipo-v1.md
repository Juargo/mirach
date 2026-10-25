---
tipo: prueba de usuario
proyecto: Mirach
version: prototipo v1 (Figma)
fecha: 2026-10-22
estado: por realizar
---

# Prueba del prototipo v1

**Objetivo:** saber si una persona como Marcela entiende su mes en menos de un minuto (RNF-USA-003) y si logra configurar la app y registrar un gasto sin ayuda.

**Prototipo:** [Mirach UI en Figma](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u) → página *Diseño* → flujo **Onboarding** (empieza en 00 Bienvenida).

**Diseño relacionado:** [UI Design](../ui-design.md) · [Requisitos funcionales v1](../requisitos-funcionales-v1.md) · [RNF](../requisitos-no-funcionales.md)

---

## 1. Antes de las pruebas

### A quién invitar (3 a 5 personas)
- [ ] Dependiente con sueldo fijo
- [ ] Entre 35 y 50 años
- [ ] Nivel tecnológico bajo o medio (usa la app del banco y WhatsApp, poco más)
- [ ] Idealmente con alguna deuda o cuota de tarjeta
- [ ] **No** es desarrollador, diseñador ni alguien que ya conozca el proyecto

### Preparación
- [ ] Probé el flujo completo yo mismo (00 → 05, 05 → 06 → 07 y los tabs)
- [ ] Desactivé **Hotspot hints** en Prototype settings
- [ ] Oculté la interfaz de Figma (Options → Hide Figma UI) y elegí **Fit width**
- [ ] Celular con batería, brillo alto y notificaciones silenciadas
- [ ] Si es remoto: enlace del prototipo con acceso "Anyone with the link" y videollamada lista
- [ ] Cronómetro a mano (el del celular sirve)
- [ ] Esta nota abierta para registrar

---

## 2. Guion (unos 15 minutos)

### Bienvenida (2 min)
> "Gracias por ayudarme. Estoy probando una app para ordenar el sueldo, **no te estoy probando a ti**. No hay respuestas malas: si algo no se entiende, el problema es de la app. Te voy a pedir que **pienses en voz alta** mientras la usas, que me digas lo que ves, lo que esperas y lo que te confunde. Es un borrador, así que algunas cosas no van a funcionar. ¿Te parece bien si tomo notas [o grabo la pantalla]?"

### Tarea 1: configurar la app (5 min)
Pásale el celular en la pantalla **00 Bienvenida**.
> "Imagina que acabas de descargar esta app. Configúrala como si fuera tuya."

Qué observar:
- ¿Entiende qué monto poner en "¿Cuánto recibes al mes?" (líquido o bruto)?
- ¿Entiende los perfiles 50/30/20, 60/20/20, etc.? ¿Cuál elige y por qué?
- ¿Sabe qué es una cartola y de dónde sacarla?
- ¿Confía en el mensaje "No pedimos tu clave del banco"?
- ¿Entiende el resumen de la vista previa antes de confirmar?

### Pregunta clave: el Inicio (cronometrar)
Apenas llegue a **05 Inicio**, inicia el cronómetro.
> "¿Cómo va tu mes?"

Detén el cronómetro cuando dé una respuesta con sentido (por ejemplo "más o menos, gasto mucho en necesidades"). **Meta: menos de 60 segundos.**

Preguntas de seguimiento:
- "¿Qué significa la carita del centro?"
- "¿Qué quiere decir '56% de 50%'?"
- "¿Qué harías ahora?"

### Tarea 2: registrar un gasto (3 min)
> "Hoy almorzaste y pagaste $12.500 en efectivo. Regístralo."

Qué observar:
- ¿Encuentra el botón **+ Agregar transacción**?
- ¿Elige "Registrar a mano" sin dudar?
- ¿Entiende la grilla de categorías y en qué bloque queda el gasto?

### Cierre (5 min)
1. "¿Qué fue lo más confuso?"
2. "¿Qué fue lo que más te gustó?"
3. "Si existiera, ¿la usarías? ¿Por qué sí o por qué no?"
4. "¿Qué te faltó ver?"
5. "¿Pagarías $3.490 al mes por algo así?" *(solo como señal, no como validación de precio)*

> "Muchas gracias, me ayudaste mucho."

### Reglas durante la prueba
- **No ayudar ni explicar.** Si se traba: "¿Qué esperabas que pasara?" y esperar en silencio.
- **No defender el diseño.** Anotar y seguir.
- **Anotar frases textuales**, sobre todo las de duda o sorpresa.
- Si algo no tiene pantalla (Movimientos, Historial, "Revisar uno por uno"), anotar que lo intentó: indica qué diseñar primero.

---

## 3. Registro

### Resumen por persona

| # | Fecha | Edad | Ocupación | Nivel tec. | T1 configurar | Tiempo "¿Cómo va tu mes?" | T2 registrar gasto | ¿La usaría? |
|---|-------|------|-----------|------------|---------------|---------------------------|--------------------|-------------|
| 1 |       |      |           |            | ✅ / ⚠️ / ❌   | ___ s                     | ✅ / ⚠️ / ❌        |             |
| 2 |       |      |           |            | ✅ / ⚠️ / ❌   | ___ s                     | ✅ / ⚠️ / ❌        |             |
| 3 |       |      |           |            | ✅ / ⚠️ / ❌   | ___ s                     | ✅ / ⚠️ / ❌        |             |
| 4 |       |      |           |            | ✅ / ⚠️ / ❌   | ___ s                     | ✅ / ⚠️ / ❌        |             |
| 5 |       |      |           |            | ✅ / ⚠️ / ❌   | ___ s                     | ✅ / ⚠️ / ❌        |             |

✅ lo logró solo · ⚠️ lo logró con dudas o pistas · ❌ no lo logró

### Notas por persona

#### Persona 1
- **Dónde dudó (pantalla y qué):**
- **Tocó algo que no respondía:**
- **Frases textuales:**
- **Respuestas del cierre:**

#### Persona 2
- **Dónde dudó (pantalla y qué):**
- **Tocó algo que no respondía:**
- **Frases textuales:**
- **Respuestas del cierre:**

#### Persona 3
- **Dónde dudó (pantalla y qué):**
- **Tocó algo que no respondía:**
- **Frases textuales:**
- **Respuestas del cierre:**

#### Persona 4
- **Dónde dudó (pantalla y qué):**
- **Tocó algo que no respondía:**
- **Frases textuales:**
- **Respuestas del cierre:**

#### Persona 5
- **Dónde dudó (pantalla y qué):**
- **Tocó algo que no respondía:**
- **Frases textuales:**
- **Respuestas del cierre:**

---

## 4. Después de las pruebas

### Problemas encontrados
Un problema que aparece en 2 o más personas es prioritario.

| Problema | Pantalla | Cuántas personas (de 5) | Gravedad (alta / media / baja) | Qué cambiar |
|----------|----------|-------------------------|-------------------------------|-------------|
|          |          |                         |                               |             |
|          |          |                         |                               |             |
|          |          |                         |                               |             |

### Conclusiones
- **¿Se cumple la meta de menos de 1 minuto en el Inicio?**
- **¿La carita y "56% de 50%" se entienden?**
- **¿El botón + se encuentra sin ayuda?**
- **¿Qué pantalla falta diseñar primero?**
- **Próximos cambios al prototipo:**
