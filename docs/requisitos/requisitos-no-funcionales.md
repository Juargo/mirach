---
tipo: requisitos
categoria: Requisito no Funcional (RNF)
proyecto: <nombre del proyecto>
fecha: 2026-10-20
estado: borrador para revisión
---

# Requisitos No Funcionales (RNF)

> Atributos de calidad del producto. **Prioridad (MoSCoW):** Must / Should / Could.
> Las decisiones de arquitectura, herramientas y despliegue no viven acá: van en los ADR.

## Convención de identificadores

`RNF-<atributo>-<nnn>`. Atributos: `SEC` (Seguridad), `PRV` (Privacidad),
`USA` (Usabilidad), `PER` (Rendimiento), `FIA` (Fiabilidad), `EXA` (Exactitud),
`ACC` (Accesibilidad), `LOC` (Localización), `OBS` (Observabilidad).

---

## 1. Seguridad (SEC)

| ID | Requisito | Criterio | Prioridad |
|---|---|---|---|
| RNF-SEC-001 | Un archivo malformado o malicioso no debe romper la app ni ejecutar nada. | Rechazo controlado, sin excepción sin manejar y sin ejecutar macros del archivo. | Must |
| RNF-SEC-002 | Ningún usuario puede ver datos de otro. | El aislamiento se aplica en la consulta, nunca filtrando en memoria. | Must |
| RNF-SEC-003 | Los datos se guardan cifrados. | Cifrado en reposo de toda la base, más cifrado por columna en los datos que identifican a una persona o su banco (descripción del movimiento, número de cuenta, correo), con las llaves fuera de la base. Los campos que se agregan para el cálculo 50/30/20 —monto, fecha y bloque— quedan solo bajo cifrado en reposo. | Must |
| RNF-SEC-004 | Los registros técnicos nunca contienen montos ni datos personales. | Redacción obligatoria antes de escribir cualquier log o reporte de error. | Must |

## 2. Privacidad (PRV)

| ID | Requisito | Criterio | Prioridad |
|---|---|---|---|
| RNF-PRV-001 | La app no pide claves bancarias ni acceso al correo. | Cero credenciales de terceros; solo cartolas que el usuario exporta. | Must |
| RNF-PRV-002 | La app no se conecta a los bancos. | Ingesta solo por archivo exportado por el usuario. | Must |
| RNF-PRV-003 | La privacidad es un argumento explícito del producto. | Se comunica en la app y en la landing, y lo que se promete es verdad. | Should |
| RNF-PRV-004 | El tratamiento de datos cumple la normativa chilena. | Ley 21.719, vigente desde el 1 de diciembre de 2026. | Must |
| RNF-PRV-005 | El archivo de cartola no se conserva. | Se borra apenas termina el procesamiento; si falla, dentro de 24 horas. | Must |

## 3. Usabilidad (USA)

| ID          | Requisito                                                                      | Criterio                                                                    | Prioridad |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------- |
| RNF-USA-001 | La app es usable por alguien sin conocimientos de finanzas.                    | Sin jerga; el 50/30/20 se aplica solo, el usuario no lo calcula.            | Must      |
| RNF-USA-002 | La primera pantalla responde "¿estoy bien este mes?" en segundos.              | El estado de los tres bloques se ve sin desplazar ni tocar nada.            | Must      |
| RNF-USA-003 | El usuario entiende su mes en menos de un minuto después de cargar la cartola. | Es la métrica de validación de valor del producto.                          | Must      |
| RNF-USA-004 | La educación financiera se entrega en explicaciones breves y en contexto.      | Nada de textos largos ni tono de cátedra.                                   | Should    |
| RNF-USA-005 | Cargar una cartola tiene la menor fricción posible.                            | Pocos pasos, y cada paso guiado para quien no sabe dónde buscar el archivo. | Must      |
| RNF-USA-006 | La interfaz usa una paleta y una tipografía consistentes.                      | Definidas una vez y respetadas en ambas plataformas. Tipografía: solo Inter, con cifras tabulares en montos y fechas (decidido el 25-10-2026). | Should    |

## 4. Rendimiento (PER)

| ID | Requisito | Criterio | Prioridad |
|---|---|---|---|
| RNF-PER-001 | Procesar una cartola se siente inmediato. | Una cartola mensual típica, en pocos segundos; si demora más, la app avisa cuando termina. | Should |
| RNF-PER-002 | El resumen del mes carga fluido. | Menos de 2 segundos con los datos de un mes. | Should |

## 5. Fiabilidad (FIA)

| ID | Requisito | Criterio | Prioridad |
|---|---|---|---|
| RNF-FIA-001 | Leer las cartolas de los cuatro bancos tiene que ser confiable. | Cada formato que falla es un usuario perdido; se prueba con cartolas reales de cada banco y producto. | Must |
| RNF-FIA-002 | Un error en una cartola no corrompe lo ya guardado. | La importación se puede deshacer y lo anterior queda intacto. | Must |
| RNF-FIA-003 | El camino crítico de ingesta está cubierto por pruebas. | Pruebas con archivos reales, no solo inventados. | Must |

## 6. Exactitud del dinero (EXA)

| ID | Requisito | Criterio | Prioridad |
|---|---|---|---|
| RNF-EXA-001 | Los montos se calculan con tipos exactos. | Nunca con decimales flotantes; redondeo, signo y decimales definidos y probados. | Must |
| RNF-EXA-002 | El mismo dato produce el mismo número en las dos apps. | iPhone y Android muestran idénticos porcentajes para el mismo mes. | Must |

## 7. Accesibilidad (ACC)

| ID | Requisito | Criterio | Prioridad |
|---|---|---|---|
| RNF-ACC-001 | El estado de un bloque nunca depende solo del color. | Se acompaña de texto o ícono. | Must |
| RNF-ACC-002 | El texto respeta el tamaño de fuente del sistema. | La pantalla sigue siendo legible y usable con fuente grande. | Should |

## 8. Localización (LOC)

| ID | Requisito | Criterio | Prioridad |
|---|---|---|---|
| RNF-LOC-001 | La app está en español de Chile y trabaja en pesos. | Montos y fechas en formato local. | Must |
| RNF-LOC-002 | El catálogo de comercios es chileno. | Comercios locales, no genéricos ni importados de otro mercado. | Must |

## 9. Observabilidad (OBS)

| ID | Requisito | Criterio | Prioridad |
|---|---|---|---|
| RNF-OBS-001 | Se miden las métricas que validan el valor del producto. | Activación, retención a 30 días, conversión a pago y cuánto demora el usuario en entender su mes. | Should |

---

## Qué quedó fuera por ser arquitectura

Estos puntos del documento anterior son decisiones técnicas y pertenecen a los ADR,
no a este documento: gestión de dependencias y auditoría en el pipeline, elección de
librerías de parseo, manejo de secretos en el repositorio, patrón de errores en el
dominio, regla de dependencias entre capas, convenciones de código y de commits,
contrato generado desde OpenAPI, modo estricto del compilador, cliente de API
compartido, base común para iOS y Android, proveedor de nube, y la estrategia por
banco para agregar uno nuevo.

## Qué cambió respecto del documento anterior

| Tema | Antes | Ahora |
|---|---|---|
| Bancos | Cinco | Cuatro: Banco de Chile, Santander, BCI y BancoEstado |
| Aislamiento entre usuarios | Post-MVP, porque el MVP era de un solo usuario | Desde el día uno: hay cuenta con inicio de sesión |
| Normativa | "Ley vigente", sin fecha | Ley 21.719, con fecha de entrada en vigencia |
| Base común iOS y Android | Era un requisito | Se elimina: son dos apps nativas separadas |
| Exactitud del dinero | Implícita, mencionada en decisiones sueltas | Atributo propio, porque con dos apps separadas puede divergir |

## Para revisar

- El documento anterior prometía "sin IA con tus datos" como parte del argumento de
  privacidad. Si esta versión usa algún modelo sobre los movimientos, esa frase deja
  de ser verdad y hay que reescribirla antes de publicarla.
- RNF-LOC-002 se solapa con el requisito funcional del catálogo de comercios. Conviene
  dejarlo en un solo lugar.
- Falta decidir si se adopta un estándar formal de accesibilidad. Acá quedaron solo dos
  reglas mínimas, no una conformidad declarada.