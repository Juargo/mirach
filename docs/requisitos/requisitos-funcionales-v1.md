# Requisitos funcionales v1 (app 50/30/20)

Oct 20, 2026 · @Jorge

La primera versión permite que una persona inicie sesión con Apple o Google, suba cartolas de cuatro bancos y vea su mes dividido en necesidades, gustos y ahorro. Los requisitos de este documento son propuestas para revisar, no decisiones cerradas, salvo las que figuran como tomadas.

## Alcance y decisiones tomadas

| Tema | Decisión | Estado |
| --- | --- | --- |
| País | Solo Chile, en pesos chilenos | Tomada |
| Plataformas | App móvil para iPhone y Android, publicada en App Store y Google Play; en web solo una landing page | Tomada |
| Cuenta | Con inicio de sesión mediante Apple ID y Google | Tomada |
| Bancos | Banco de Chile, Santander, BCI y BancoEstado, con cartolas en Excel o PDF | Tomada |
| Hogares compartidos | No entra en la v1 | Tomada |
| Conexión bancaria directa | No entra en la v1; se evalúa después | Tomada |
| Track de precios de productos | No entra en la v1 | Tomada |
| Usuario principal | Dependiente con sueldo fijo, 35 a 50 años, ingreso medio, nivel tecnológico bajo | Hipótesis por validar |
| Roles | Usuario y administrador interno | Tomada para la v1 |
| Planes y cobro | Entran en la v1.1. En la v1.0 todos tienen Plus gratis durante el lanzamiento, y se avisa desde el inicio que Plus será pago | Tomada (25-10-2026) |

## Módulos y prioridades

Son once módulos, con los requisitos del proyecto anterior ya incorporados. La prioridad usa tres niveles: **Debe** (sin esto no se lanza), **Debería** (importante, puede esperar al primer ajuste) y **Podría** (deseable, si sobra tiempo).

| Módulo | Prefijo | Prioridad general | Para qué sirve |
| --- | --- | --- | --- |
| Cuenta e inicio de sesión | AUTH | Debe | Entrar con Apple o Google y borrar la cuenta |
| Perfil y onboarding | PER | Debe | Elegir ingreso y porcentajes, y llegar rápido al primer resultado |
| Importación de cartolas | IMP | Debe | Subir Excel o PDF de los cuatro bancos sin duplicar movimientos |
| Movimientos | MOV | Debe | Ver, agregar, editar e ignorar movimientos |
| Clasificación 50/30/20 | CLA | Debe | Asignar cada movimiento a un bloque según reglas claras |
| Visualización del mes | VIS | Debe | Mostrar los tres bloques contra la meta de un vistazo |
| Planes y suscripción | PLA | Debería | Plan gratis, prueba de 30 días y pago |
| Privacidad y soporte | PRI y SOP | Debe | Consentimiento, exportar y borrar datos, ayuda |
| Administración interna | ADM | Debería | Métricas agregadas y soporte sin ver movimientos |
| Landing web | LAN | Debe | Presentar la app, enlazar a las tiendas y alojar las páginas que estas exigen |
| Publicación en tiendas | PUB | Debe | Cumplir lo que piden App Store y Google Play para publicar |

## Cuenta e inicio de sesión (AUTH)

El usuario entra con Apple o Google y puede borrar su cuenta desde la app.

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| AUTH-01 | Iniciar sesión con Apple ID | Debe | El usuario llega a la pantalla de inicio sin crear contraseña; si oculta su correo, la cuenta se crea igual. Si la persona cancela la ventana de inicio de sesión, vuelve a la bienvenida sin aviso de error; el aviso aparece solo ante una falla real, como no tener conexión o un problema del proveedor, y confirma que no se creó ninguna cuenta (pantalla 31) |
| AUTH-02 | Iniciar sesión con Google | Debe | El usuario llega a la pantalla de inicio sin crear contraseña. Si la persona cancela la ventana de inicio de sesión, vuelve a la bienvenida sin aviso de error; el aviso aparece solo ante una falla real, como no tener conexión o un problema del proveedor, y confirma que no se creó ninguna cuenta (pantalla 31) |
| AUTH-03 | Crear la cuenta en el primer inicio de sesión, aceptando antes los términos y la política de privacidad | Debe | Se guarda la fecha y la versión de lo aceptado; sin aceptar, no se crea la cuenta |
| AUTH-04 | Mantener la sesión abierta y poder cerrarla | Debe | La sesión sigue abierta al reiniciar la app; "Cerrar sesión" está en Configuración |
| AUTH-05 | Eliminar la cuenta desde la app | Debe | Tras confirmar, se cierra la sesión y se borran perfil, movimientos e importaciones en un plazo definido en la política de privacidad (propuesta: hasta 30 días) |
| AUTH-06 | Cerrar sesión en todos los dispositivos | Debería | Un botón invalida las sesiones activas |
| AUTH-07 | Unir cuentas de Apple y Google si el correo coincide | Podría | Un usuario que entra con ambos ve los mismos datos |

Notas:

- Las tiendas de apps suelen exigir poder borrar la cuenta desde la app (AUTH-05); hay que revisar las guías vigentes de Apple y Google antes de publicar.
- Con Apple y Google, la app puede no recibir un correo real. El soporte debe funcionar sin depender de él.
- Iniciar sesión con Apple en Android suele requerir un flujo web. Decisión pendiente: ofrecerlo en Android o solo en iPhone.

## Perfil de presupuesto y onboarding (PER)

Un usuario nuevo debe ver su primer 50/30/20 en pocos minutos, porque el abandono del registro es uno de los mayores riesgos del producto.

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| PER-01 | Onboarding de hasta cuatro pasos: ingreso mensual, perfil, primera cartola (se puede saltar) y resultado | Debe | Un usuario nuevo llega a ver su primer resultado en menos de 5 minutos (meta a medir en pruebas con usuarios) |
| PER-02 | Declarar el ingreso mensual neto en pesos chilenos | Debe | El valor es editable en cualquier momento; si no lo declara, la app sugiere uno a partir de los abonos de la cartola. En el onboarding se puede saltar con «Prefiero que lo calcule la app» (pantalla 01). Decidido el 23-10-2026 |
| PER-03 | Perfiles predefinidos: 50/30/20, 60/20/20, 70/15/15 y 80/10/10 | Debe | Al elegir uno, las metas de los tres bloques cambian en toda la app. El 80/10/10 se presenta como "Salir de deudas" (PER-04) |
| PER-04 | Perfil "Salir de deudas" con más peso en necesidades, porque ahí vive la deuda | Debe | Decidido el 23-10-2026: es el 80/10/10 de PER-03, sin un quinto perfil. Se descarta la propuesta 70/20/10 porque daba más a gustos que el 70/15/15 |
| PER-05 | Perfil personalizado | Debería | Los tres porcentajes deben sumar 100% o la app no deja guardar |
| PER-06 | Cambiar de perfil en cualquier momento | Debe | El cambio se aplica a todos los meses, también los pasados: los totales se calculan al momento a partir de los movimientos, igual que con el mes financiero (PER-08). Decidido el 23-10-2026 |
| PER-07 | Sugerir un perfil después de dos meses de datos, según el gasto real | Podría | La app propone y el usuario decide; nunca cambia el perfil solo |
| PER-08 | Mes financiero configurable (por ejemplo, desde el día de pago del sueldo) | Debería | Entra en la v1 (decidido el 23-10-2026). Por defecto es el mes calendario. La persona elige un día entre el 1 y el 28. Cada período se muestra con sus fechas ("25 sep – 24 oct"). Al cambiar el día se recalculan todos los meses, porque los totales se calculan al momento. Tolerancia: un abono clasificado como ingreso que llega hasta 3 días antes del corte cuenta en el período que empieza (sueldo adelantado por fin de semana o feriado). Pantalla 51 |
| PER-09 | Ver y editar el perfil propio | Debería | Nombre y datos básicos. El correo llega de Apple o Google y no se edita |

## Importación de cartolas (IMP)

El usuario sube la cartola de su banco y ve sus movimientos sin duplicados. Es el requisito más riesgoso porque cada banco entrega archivos distintos.

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| IMP-01 | Subir un archivo Excel o PDF desde el celular, incluso comparténdolo desde la app del banco o el correo | Debe | Acepta .xlsx y .pdf hasta 10 MB. El .xls antiguo se rechaza explicando el motivo |
| IMP-02 | Detectar el banco y el tipo de producto: cuenta corriente o cuenta vista | Debe | Reconoce los cuatro bancos; si falla, pide elegir el banco y el producto. En la v1 no se leen estados de cuenta de tarjeta de crédito: si se sube uno, se rechaza explicando el motivo y no se guarda nada (pantalla 37). Decidido el 23-10-2026 |
| IMP-03 | Extraer por movimiento fecha, descripción, cargo, abono y saldo (si el archivo lo trae) | Debe | La suma de cargos y abonos extraídos coincide con los totales del archivo cuando este los muestra |
| IMP-04 | Mostrar una vista previa antes de confirmar | Debe | Muestra cantidad de movimientos, rango de fechas y totales de cargos y abonos; no se guarda nada hasta confirmar |
| IMP-05 | Evitar duplicados entre cartolas que se solapan | Debe | Subir dos veces el mismo archivo, o dos cartolas con fechas en común, no duplica movimientos |
| IMP-06 | Explicar los errores con lenguaje simple | Debe | Distingue archivo con contraseña, formato no reconocido y PDF escaneado como imagen, y dice qué hacer en cada caso |
| IMP-07 | Borrar el archivo original después de procesarlo | Debe | Solo quedan los movimientos; si el procesamiento falla, el archivo se elimina en un plazo corto (propuesta: 24 horas). Choca con reprocesar una importación (IMP-17) |
| IMP-08 | Guía paso a paso por banco para descargar la cartola | Debe | Cada uno de los cuatro bancos tiene una guía con pasos cortos, pensada para usuarios de nivel tecnológico bajo |
| IMP-09 | Historial de importaciones, con opción de deshacer una | Debería | Muestra fecha, banco, cantidad de movimientos y estado; al deshacer se borran solo los movimientos de esa importación |
| IMP-10 | Procesar en segundo plano si demora | Debería | Si tarda más de unos segundos, la app avisa cuando termina |
| IMP-11 | Pedir la contraseña de un PDF protegido | Podría | La contraseña se usa solo para abrir ese archivo y no se guarda |
| IMP-12 | Enviar a soporte una cartola que no se pudo leer | Podría | Solo con consentimiento expreso del usuario |
| IMP-13 | Consolidar en una sola vista los movimientos de varios bancos | Debe | El mes muestra juntos los movimientos de los cuatro bancos, con los mismos campos y el banco identificado en cada uno |
| IMP-14 | Validar que la estructura del archivo coincida con la esperada para el banco detectado | Debe | Si no coincide, no se importa nada y se explica qué falta |
| IMP-15 | Reportar en una sola pasada todos los problemas del archivo | Debería | El usuario no corrige un error para encontrarse con el siguiente |
| IMP-16 | Aceptar los formatos de fecha DD/MM/AAAA, AAAA-MM-DD y DD-MM-AAAA | Debe | Las tres formas se interpretan bien; una fecha ambigua no se adivina, se informa |
| IMP-17 | Reprocesar una importación | Podría | Permite releer un archivo con un lector corregido. Exige conservar el archivo, lo que choca con IMP-07 |
| IMP-18 | Un error de importación no afecta lo ya importado | Debe | Ante un banco o formato no reconocido, los movimientos anteriores quedan intactos |
| IMP-19 | Confirmar la ingesta en dos pasos: revisar y después confirmar | Debe | Nada se guarda hasta que el usuario confirma. En la revisión puede elegir la categoría de cada fila editable |
| IMP-20 | Las filas duplicadas se excluyen y se informan | Debe | No se guardan ni se pueden clasificar; la app muestra cuántas se omitieron |
| IMP-21 | Las filas de ingreso no se reclasifican en la revisión | Debe | Un ingreso queda fijo aunque el usuario intente cambiarlo |
| IMP-22 | Eliminar una ingesta completa con sus movimientos | Debe | Es el único camino para corregir datos venidos de una cartola: se borra y se vuelve a subir. Los movimientos manuales sobreviven |
| IMP-23 | El servidor valida el archivo, no la app | Debe | El filtro del selector de archivos es ayuda visual; extensión, tamaño y estructura los decide el servidor |
| IMP-24 | Límite de bancos del plan gratis al importar | Debe | Si la persona está en el plan gratis, ya usa 2 bancos y elige uno distinto, la app explica el límite antes de pedir el archivo y ofrece elegir uno de sus 2 bancos o pasar a Plus (PLA-01). Decidido el 23-10-2026 |

Regla propuesta para IMP-05: un movimiento se considera repetido si coincide en banco, cuenta, fecha, descripción, monto y saldo. Si dos movimientos idénticos ocurren el mismo día, se distinguen por su orden en el archivo.

Formatos conocidos: Banco de Chile entrega Excel, TXT y PDF; BancoEstado entrega PDF. No verifiqué el formato para personas de BCI ni de Santander. Antes de construir los lectores hay que reunir cartolas reales de cada banco y producto, sin estados de cuenta de tarjeta, que no entran en la v1.

## Movimientos (MOV)

El usuario ve todo lo que entró y salió, y puede corregirlo.

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| MOV-01 | Lista de movimientos del mes | Debe | Cada fila muestra fecha, descripción, monto, bloque y banco; se puede filtrar por bloque y banco |
| MOV-02 | Agregar un movimiento a mano, por ejemplo un gasto en efectivo | Debe | Pide monto, fecha no futura, descripción y tipo (gasto o ingreso). Un gasto pide además la categoría; un ingreso no lleva categoría y suma a los ingresos del mes (decidido el 23-10-2026). Si falta un dato o la fecha es futura, lo marca sin borrar lo escrito. Muestra un resumen y pide confirmar antes de guardar (pantallas 07 y 41 a 43) |
| MOV-03 | Reclasificar un movimiento | Debe | Solo se puede cambiar el bloque y la categoría. Monto, fecha y descripción no se editan |
| MOV-04 | Marcar un movimiento como "ignorar" | Debe | Un movimiento ignorado no cuenta en los porcentajes, pero sigue visible con una marca. Eliminar es otra cosa y tiene su propia regla (MOV-09) |
| MOV-05 | Aviso de movimientos en "Desconocido" | Debe | La lista muestra cuántos faltan y permite ir directo a ellos |
| MOV-06 | Búsqueda por texto | Debería | Encuentra por palabras de la descripción. Fuera de la v1.0 (decidido el 25-10-2026) |
| MOV-07 | Dividir un movimiento entre dos bloques | Podría | Los dos montos suman el original |
| MOV-09 | Eliminar solo los movimientos registrados a mano | Debe | Sin plazo para hacerlo y con confirmación. Los movimientos venidos de una cartola no se borran de a uno |
| MOV-10 | Corregir un movimiento manual es borrarlo y registrarlo de nuevo | Debe | La app no promete que un movimiento sea permanente, y tampoco ofrece editar el monto |
| MOV-11 | Ver los ingresos del mes por separado | Debería | Lista con el origen de cada ingreso, incluidos los manuales |

## Clasificación 50/30/20 y reglas de negocio (CLA)

Cada movimiento pertenece a una categoría y cada categoría a uno de tres bloques: necesidades, gustos o ahorro. La deuda vive en necesidades, no en ahorro. Las reglas de abajo son propuestas; las marcadas como pendientes necesitan tu decisión.

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| CLA-01 | Cada movimiento tiene categoría y bloque | Debe | No hay movimientos sin categoría; los que no se reconocen caen en "Desconocido", dentro de gustos |
| CLA-02 | Clasificación automática por palabras de la descripción | Debe | Un conjunto inicial de reglas cubre los comercios más comunes; el resto queda en "Desconocido" |
| CLA-03 | Reclasificar un movimiento y recordar la decisión | Debe | La app ofrece aplicar el cambio a movimientos parecidos y lo usa en las próximas cartolas |
| CLA-04 | Tratar de forma especial transferencias propias, pagos de tarjeta, devoluciones y sobregiros | Debe | Se aplican las reglas 3, 4, 5 y 15 de la tabla de abajo |
| CLA-05 | Categorías y reglas propias del usuario | Debería | Puede crear, renombrar y asignar un bloque a una categoría |
| CLA-06 | Catálogo inicial de comercios chilenos comunes | Debe | Cubre supermercados, bencineras, farmacias, transporte y suscripciones, cada uno con su bloque y categoría por defecto |
| CLA-07 | Reglas y catálogo visibles y editables por el usuario | Debería | El usuario puede ver por qué un movimiento quedó en un bloque y cambiar esa regla; no es una caja negra |
| CLA-08 | Cada usuario tiene su propio catálogo, copiado de la plantilla al crear la cuenta | Debe | Lo que un usuario cambie no afecta a otro, y editar la plantilla no cambia los catálogos ya creados |
| CLA-09 | Crear, editar y borrar categorías y patrones propios | Debe | Cada categoría pertenece a un bloque. En el plan gratis se ven las categorías y sus patrones; crearlos y editarlos desde Ajustes es Plus (PLA-01) |
| CLA-10 | Un nombre de categoría puede repetirse entre bloques, nunca dentro de uno | Debe | Se puede tener "Transporte" en necesidades y en gustos, pero no dos "Transporte" en necesidades |
| CLA-11 | Cada categoría puede tener un ícono de una lista curada | Debería | 24 íconos disponibles; sin ícono se usa uno genérico. Las ocho de la plantilla traen el suyo. Set definido el 23-10-2026: Carro, Auto, Bus, Cruz, Corazón, Casa, Ampolleta, Tarjeta, Bolsa, Paquete, Pantalla, Taza, Cubiertos, Alcancía, Gráfico, Pata, Libro, Camiseta, Avión, Regalo, Teléfono, Mancuerna, Flechas y Pregunta. Plantilla: Supermercado → Carro, Combustible → Auto, Farmacia → Cruz, Salud → Corazón, Transporte → Bus, Streaming → Pantalla, Delivery → Paquete, Ahorro → Alcancía, Fintual y Racional → Gráfico, Arriendo o dividendo → Casa, Servicios básicos → Ampolleta, Pago de deudas → Tarjeta, Desconocido → Pregunta (el genérico) |
| CLA-12 | Cuando dos patrones empatan, el desempate es estable | Debe | Dos usuarios con el mismo catálogo obtienen la misma clasificación para el mismo gasto. Gana el patrón más largo, por ser el más específico ("uber eats" gana sobre "uber"); si miden igual, gana el más antiguo. Decidido el 25-10-2026: reemplaza la prioridad numérica heredada del API, que la app no muestra ni edita |
| CLA-13 | La categoría "Desconocido", con ícono de interrogación, recibe todo lo que no se clasifica solo | Debe | Pertenece a gustos, viene en la plantilla de todo usuario y no se puede borrar ni mover de bloque |
| CLA-14 | Un patrón coincide si la descripción contiene su texto | Debe | No importan las mayúsculas ni las tildes: "uber" encuentra "UBER EATS" y "Uber Trip". Decidido el 23-10-2026. Es el único tipo de patrón: los tipos «empieza con» y «expresión regular» heredados del API no se ofrecen (decidido el 25-10-2026) |
| CLA-15 | Vista previa al guardar un patrón | Debe | La app muestra con cuántos movimientos del mes coincide y pregunta si moverlos. Si la persona no lo marca, el patrón solo se usa en las próximas cartolas. Decidido el 23-10-2026 |
| CLA-16 | Lo que la persona cambió a mano no lo cambia un patrón | Debe | Un movimiento reclasificado a mano (MOV-03) no se mueve al crear, editar o borrar patrones. Decidido el 23-10-2026 |
| CLA-17 | Un mismo texto vive en una sola categoría | Debe | Si el patrón ya existe en otra categoría, la app lo dice y ofrece moverlo. Decidido el 23-10-2026 |
| CLA-18 | "Desconocido" no acepta patrones | Debe | Es la categoría de lo que no coincide con ningún patrón. Decidido el 23-10-2026 |

### Categorías iniciales (propuesta)

| Bloque | Categorías |
| --- | --- |
| Necesidades | Supermercado, Combustible, Farmacia, Salud, Transporte, y a agregar: Arriendo o dividendo, Servicios básicos, Pago de deudas |
| Gustos | Streaming, Delivery, Transporte, Supermercado, Desconocido |
| Ahorro | Ahorro, Fintual, Racional |

Las primeras ocho son la plantilla ya implementada, cada una con su ícono por defecto. Las tres marcadas como "a agregar" son nuevas y hoy no existen: sin ellas, el gasto más grande de un hogar chileno queda sin categoría, y la deuda no tiene dónde caer. Agregarlas cambia la plantilla, no el esquema. El usuario igual puede crear las suyas (CLA-09).

### Reglas de negocio (propuestas)

| N° | Regla | Estado |
| --- | --- | --- |
| 1 | Los porcentajes se calculan sobre el ingreso mensual declarado, no sobre el gasto. Si no lo declara, se usa la suma de abonos clasificados como ingreso | Decidida |
| 2 | Todo pago de deuda cuenta como necesidad, sin separar el mínimo del excedente, porque la cartola no distingue uno de otro. Si el usuario sabe que fue un abono extra, lo reclasifica a ahorro | Decidida |
| 3 | En la v1 no se leen estados de cuenta de tarjeta. El pago de la tarjeta desde la cuenta corriente cuenta como Pago de deudas, en necesidades (regla 2). Las compras hechas con tarjeta no se ven por separado | Decidida (23-10-2026) |
| 4 | Las transferencias entre cuentas propias no son ingreso ni gasto; la app las detecta cuando un cargo y un abono tienen el mismo monto en fechas cercanas y pide confirmar | Propuesta |
| 5 | Las devoluciones y reembolsos restan del gasto de su categoría, no suman como ingreso | Propuesta |
| 6 | Las transferencias a cuentas de ahorro, inversión o fondos cuentan como ahorro | Propuesta |
| 7 | Una compra en cuotas cuenta en cada mes en que se cobra la cuota. Queda como función a futuro: las cuotas se ven en el estado de cuenta de la tarjeta, que la v1 no lee (regla 3) | A futuro (23-10-2026) |
| 8 | Los ingresos extraordinarios, como un bono, se pueden marcar como no recurrentes y no cambian la base del mes | Pendiente: confirmar |
| 9 | Estado de cada bloque: "bien" si cumple su meta, "cerca" si se desvía 5 puntos o menos y "sobre" si se desvía más de 5 puntos. El umbral es fijo para los tres bloques. En ahorro, estar bajo la meta es lo desfavorable. "Bien" reemplaza a "dentro" | Decidida (23-10-2026) |
| 10 | Solo pesos chilenos; un movimiento en otra moneda se muestra como lo trae la cartola en pesos, sin conversión propia | Propuesta |
| 11 | Todo abono que no sea traspaso propio, devolución ni sobregiro se clasifica como ingreso | Propuesta |
| 12 | El bloque de ahorro contiene solo ahorro: lo que el usuario aparta o invierte. Ningún pago de deuda cae ahí por omisión | Decidida |
| 13 | El usuario puede mover un pago de deuda a ahorro cuando fue un abono extra; es una reclasificación normal (CLA-03) y queda recordada para pagos parecidos | Propuesta |
| 14 | Lo que cae en "Desconocido" cuenta como gusto en los porcentajes, no queda fuera del cálculo. La app avisa cuántos hay para que el usuario los revise. Por qué: así se invita amablemente a revisar los gustos con frecuencia, y un gasto que la persona no recuerda probablemente estaba fuera de lo presupuestado | Decidida |
| 15 | Un sobregiro (abono automático de la línea de crédito) queda fuera del cálculo: no es ingreso ni gasto, porque es deuda que entra. Se muestra marcado en la lista. Lo que se paga después de la línea cuenta como Pago de deudas | Decidida (23-10-2026) |

## Visualización del mes (VIS)

La pantalla principal responde una pregunta: ¿mi mes está equilibrado? Debe entenderse en pocos segundos, incluso para usuarios de nivel tecnológico bajo.

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| VIS-01 | Pantalla de inicio con los tres bloques | Debe | Cada bloque muestra porcentaje real frente a la meta (por ejemplo, 58% de 50%), monto en pesos y estado |
| VIS-02 | Estado sin depender solo del color | Debe | El estado se muestra con color, una marca cuadrada y texto (Bien, Cerca, Sobre), para que se entienda sin distinguir colores. No se usan caritas ni emojis |
| VIS-03 | Frase de lectura del mes | Debe | Una oración simple, como "Tus necesidades están 8 puntos sobre tu meta" |
| VIS-04 | Aviso de datos incompletos | Debe | Indica hasta qué fecha hay movimientos, por ejemplo "Datos hasta el 18 de octubre" |
| VIS-05 | Selector de mes | Debe | Se puede ir al mes anterior y al siguiente |
| VIS-06 | Detalle por bloque | Debe | Al tocar un bloque se ven sus categorías y sus movimientos |
| VIS-07 | Estado vacío guiado | Debe | Sin datos, la pantalla invita a subir la primera cartola y no muestra porcentajes vacíos |
| VIS-08 | Comparación con el mes anterior | Debería | Muestra cuánto cambió cada bloque en puntos porcentuales. Fuera de la v1.0 (decidido el 25-10-2026) |
| VIS-09 | Evolución de los últimos seis meses | Podría | Un gráfico con los tres bloques por mes |
| VIS-10 | Mostrar los ingresos totales del mes | Debe | Aparecen junto a los tres bloques, indicando si el monto es el declarado o el detectado en la cartola |
| VIS-11 | Indicador único del estado del mes | Debe | El mes toma el peor estado de sus bloques (Bien, Cerca o Sobre), con la misma marca y palabra. La frase del mes (VIS-03) explica qué bloque lo define |
| VIS-12 | Criterios definidos para el estado del mes | Debería | Decidido el 23-10-2026: el estado del mes es el peor bloque (VIS-11) y no hay criterio aparte para "Desconocido". Esos movimientos ya suman en gustos (regla 14), así que afectan el estado a través de ese bloque |
| VIS-13 | Calendario anual con el estado de cada mes | Debería | Los meses sin movimientos se ven deshabilitados y no se pueden abrir |
| VIS-14 | Detalle del bloque desglosado también por comercio | Debería | Dentro de un bloque se ve cuánto se gastó en cada comercio, no solo por categoría |
| VIS-15 | Sugerencias accionables de ahorro | Podría | Indica un cambio concreto que acercaría un bloque a su meta, con el monto involucrado |
| VIS-16 | Tema claro y oscuro, con selector de tres estados | Debería | Claro, oscuro o seguir el sistema. Por defecto claro. La elección queda en el teléfono y no se sincroniza entre dispositivos. Fuera de la v1.0 (decidido el 25-10-2026) |
| VIS-17 | La frase del mes dice cuánto del exceso de gustos viene de "Desconocido" | Debería | Si gustos está sobre su meta y hay movimientos en "Desconocido", la frase lo dice en puntos, por ejemplo "Gustos: 8 puntos sobre tu meta. 5 son movimientos sin clasificar." Decidido el 23-10-2026 |

## Planes, suscripción y límites (PLA)

La app usa una suscripción con plan gratis limitado y prueba de 30 días del plan pago. Los límites y el precio son supuestos que se validan con la encuesta de precios y la página de espera. Decidido el 25-10-2026: los planes y el cobro entran en la v1.1; en la v1.0 Plus es gratis para todos durante el lanzamiento (backlog, decisión B).

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| PLA-01 | Plan gratis y plan pago | Debería | Decidido el 23-10-2026. Gratis: mes actual, 2 bancos con todas sus cartolas (cuenta corriente y cuenta vista; cambiado de 1 a 2 bancos el 23-10-2026), registro a mano, reclasificar (incluido "aplicar a parecidos", CLA-03), perfiles predefinidos y exportar sus datos. Plus: los 4 bancos a la vez, historial de meses, perfiles propios, y crear categorías y patrones desde Ajustes (CLA-09) |
| PLA-02 | Prueba gratis de 30 días del plan pago al registrarse | Debería | Al terminar, el usuario pasa al plan gratis sin perder sus datos |
| PLA-03 | Suscripción mensual y anual dentro de la app | Debería | Se cobra mediante las compras dentro de la app de Apple y de Google; precio de partida de $3.490 a $3.990 al mes o de $29.990 a $34.990 al año |
| PLA-04 | Mostrar el estado del plan | Debería | La app muestra plan, fecha de renovación y cómo cancelar desde la tienda |
| PLA-05 | Restaurar compras | Debería | Un usuario que cambia de celular recupera su plan |
| PLA-06 | El plan vale en las dos plataformas con la misma cuenta | Debería | El plan vale en iPhone y Android con la misma cuenta |
| PLA-07 | Al vencer el plan, conservar los datos | Debe | Nada se borra; solo se aplican los límites del plan gratis |
| PLA-08 | Límites y precio configurables sin publicar una versión nueva | Podría | Permite probar variantes en el A/B de precios |
| PLA-09 | Aviso de fin de prueba | Debería | Tres días antes de que termine la prueba, el inicio muestra "Tu prueba Plus termina en 3 días" con un enlace a los planes. Es un aviso dentro de la app, no una notificación (fuera de la v1). Al terminar, la app explica el paso al plan gratis (pantallas 38 y 39). Decidido el 23-10-2026 |

Pendiente: la decisión de qué funciones van en cada plan y los límites exactos. Las tiendas suelen exigir su propio sistema de cobro para suscripciones digitales; hay que confirmarlo en las guías vigentes.

## Privacidad, soporte y administración interna (PRI, SOP, ADM)

La app maneja datos financieros personales, así que el consentimiento, la exportación y el borrado son requisitos de la primera versión. La Ley 21.719 rige desde el 1 de diciembre de 2026, con un proyecto en el Senado para postergarla.

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| PRI-01 | Mostrar términos y política de privacidad | Debe | Se pueden leer desde Configuración en cualquier momento |
| PRI-02 | Consentimiento específico para procesar cartolas | Debe | Se pide antes de la primera importación y se guarda con fecha y versión |
| PRI-03 | Explicar qué se hace con el archivo | Debe | La pantalla de importación dice que no se piden claves del banco y que el archivo se borra después de procesarlo |
| PRI-04 | Exportar mis datos | Debe | El usuario descarga sus movimientos en Excel o CSV. Está disponible en todos los planes, también el gratis (decidido el 23-10-2026) |
| PRI-05 | Borrar una importación y sus movimientos | Debe | El borrado es definitivo y se confirma antes |
| PRI-06 | Revocar el consentimiento | Debería | Al revocarlo, se bloquea la importación de nuevas cartolas |
| SOP-01 | Contacto de soporte desde la app | Debe | Envía el mensaje con la versión de la app y sin datos financieros salvo que el usuario los adjunte |
| SOP-02 | Preguntas frecuentes y guías | Debería | Cubren cómo descargar la cartola de cada banco |
| SOP-03 | Preguntar "¿te sirvió?" dentro de la app | Podría | Sirve de señal para la validación del producto |
| ADM-01 | Panel con métricas agregadas | Debería | Muestra registros, usuarios que confirman su primera cartola, retención a 30 días y conversión a pago, sin datos individuales |
| ADM-02 | Ver el estado de una cuenta para dar soporte | Debería | Muestra plan, última importación y errores, pero nunca los movimientos; cada acceso queda registrado |
| ADM-03 | Ver errores de importación por banco y formato | Debería | Permite priorizar qué lector arreglar, sin contenido personal |
| ADM-04 | Cambiar límites y precios | Podría | Ver PLA-08 |

## Landing web y publicación en tiendas (LAN, PUB)

El producto es una app móvil nativa que se descarga desde App Store y Google Play. La web es solo una landing page: presenta la app, lleva a las tiendas y aloja las páginas que las tiendas exigen. No permite gestionar el presupuesto.

### Landing web (LAN)

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| LAN-01 | Página única que explica el problema, el 50/30/20 y los cuatro bancos | Debe | Se entiende en menos de un minuto y se ve bien en celular |
| LAN-02 | Botones de descarga a App Store y Google Play | Debe | Antes del lanzamiento muestran "Próximamente" y la lista de espera |
| LAN-03 | Lista de espera por correo | Debe | Guarda el correo con consentimiento; sirve para medir interés en la validación (umbral propuesto: 5% de las visitas) |
| LAN-04 | Botón de pago de puerta falsa con tres precios | Debería | Muestra $2.990, $3.990 o $4.990 a visitantes distintos y registra quién lo toca; avisa que aún no está disponible |
| LAN-05 | Página pública de política de privacidad y términos | Debe | La URL es la misma que declaran las fichas de las tiendas |
| LAN-06 | Página de soporte con forma de contacto | Debe | Apple pide una URL de soporte en la ficha |
| LAN-07 | Página para solicitar la eliminación de la cuenta | Debe | Google Play exige una vía web para pedir el borrado; hay que confirmar el requisito vigente antes de publicar |
| LAN-08 | Medición de visitas y conversión | Debería | Permite calcular el porcentaje que deja su correo y el que toca el botón de precio |
| LAN-09 | Captura o video de la pantalla principal | Debería | Muestra los tres bloques con datos de ejemplo, no reales |

### Publicación en tiendas (PUB)

| ID | Requisito | Prioridad | Criterio de aceptación |
| --- | --- | --- | --- |
| PUB-01 | Cuentas de desarrollador en Apple y Google | Debe | Publicación como persona natural; falta inscribirse en Apple Developer |
| PUB-02 | Ficha de tienda en español de Chile | Debe | Nombre, descripción, capturas, ícono y categoría, con Chile entre los países de distribución |
| PUB-03 | Declaración de datos que recopila la app en ambas tiendas | Debe | Coincide con lo que dice la política de privacidad y con lo que la app hace de verdad |
| PUB-04 | Versiones mínimas de sistema operativo definidas | Debe | Se eligen según el parque de equipos en Chile, no solo los más nuevos |
| PUB-05 | Compras dentro de la app configuradas en ambas tiendas | Debería | Solo si los planes (PLA) entran en la v1 |
| PUB-06 | Distribución de prueba antes del lanzamiento | Debería | TestFlight y pista interna o cerrada de Google Play, para las pruebas con usuarios |
| PUB-07 | Nombre definitivo y ícono | Debe | El nombre no debe chocar con apps existentes en Chile |

Antes de enviar la app a revisión hay que leer las guías vigentes de ambas tiendas. Las reglas sobre eliminar la cuenta, declarar datos y cobrar suscripciones cambian seguido, y una ficha incompleta retrasa la publicación.

## Qué cambia respecto del proyecto anterior

Siete puntos donde lo construido antes y esta versión no coinciden. Las decisiones de esta versión son posteriores y mandan.

| Tema | En el proyecto anterior | En esta versión | Qué falta resolver |
| --- | --- | --- | --- |
| Publicar en tiendas | Distribución interna por archivo, sin publicar | Se publica en App Store y Google Play | Nada; la decisión está tomada |
| Ingreso con Apple | No existía | Apple ID junto con Google | Falta definir cómo funciona en Android |
| Contraseña | Había ingreso con contraseña y forma de cambiarla | Solo Apple y Google | Decidir si la contraseña desaparece del todo |
| Registrar movimiento a mano | El formulario existía solo en la app web | No hay app web | Pasa a móvil o sale del alcance |
| Borrar movimiento manual | Solo en web, para no dejar destruir donde no se puede crear | No hay app web | Si el registro pasa a móvil, el borrado va con él |
| Modo demo | Había un usuario de demostración en web, de solo lectura y con siete días de vida | No está | Decidir si alguien puede probar sin registrarse |
| Perfiles de porcentajes y mes financiero | No existían; los bloques estaban fijos | PER-03 a PER-08 los proponen | Es funcionalidad nueva, sin decisión previa |

## Contraste con el registro anterior (moneyDiary)

Se revisó el registro de requisitos funcionales del proyecto anterior para usarlo como base. Doce requisitos se incorporaron, varios cambiaron de alcance y otros quedan fuera a propósito.

### Incorporados desde el registro anterior

| Nuevo | Venía de | Qué aporta |
| --- | --- | --- |
| IMP-13 | RF-ING-006 | Consolidar varios bancos en una sola vista, que no estaba escrito |
| IMP-14 | RF-VAL-001 | Validar la estructura del archivo contra la esperada |
| IMP-15 | RF-VAL-002 | Reportar todos los problemas en una pasada |
| IMP-16 | RF-VAL-003 | Los tres formatos de fecha que usan los bancos |
| IMP-17 | RF-GES-003 | Reprocesar una importación |
| IMP-18 | RF-DET-004 | Un error no afecta lo ya importado |
| CLA-06 | RF-CAT-002 | Catálogo de comercios chilenos comunes |
| CLA-07 | RF-CFG-003 | Reglas visibles y editables, no caja negra |
| Regla 11 | RF-CAT-004 | Cómo se decide qué abono es ingreso |
| VIS-10 | RF-VIS-002 | Mostrar los ingresos totales del mes |
| VIS-11 y VIS-12 | RF-VIS-004 y RF-VIS-005 | Un estado único del mes y sus criterios |
| VIS-13 | RF-VIS-006 y RF-VIS-007 | Calendario anual con el estado de cada mes |
| VIS-14 | RF-VIS-008 | Desglose por comercio dentro del bloque |
| VIS-15 | RF-VIS-009 | Sugerencias accionables de ahorro |

### Cambios de alcance respecto del registro anterior

| Tema | Antes | Ahora |
| --- | --- | --- |
| Plataforma | App web como MVP, móvil después | App móvil como v1; en web solo landing page |
| Cuenta | Mono-usuario sin login en el MVP | Inicio de sesión con Apple y Google desde el principio |
| PDF | Post-MVP | Entra en la v1, junto con Excel |
| Nombre del bloque | "Deseos" | "Gustos" |
| Perfiles de porcentajes | No estaban | 50/30/20 ajustable, con perfiles alternativos |
| Suscripción | Vía tiendas y directa en web | Solo vía tiendas |

### Fuera de esta versión a propósito

- Track de precios de productos y detalle de ítems de una compra (RF-TRK, RF-CAT-009)
- Aplicación web para gestionar el presupuesto (RF-PLT-001)
- Banco Falabella y otros bancos (RF-DET-003)
- Suscripción directa desde la web (RF-PLT-004)
- Subcategorización avanzada (RF-CAT-008)

### Convenciones por decidir

El registro anterior usaba tres cosas que este documento todavía no tiene. Conviene decidirlas antes de pasar al documento de prioridades.

| Convención | En el registro anterior | Aquí |
| --- | --- | --- |
| Identificadores | `RF-<módulo>-<nnn>`, por ejemplo RF-CAT-001 | `<MÓDULO>-<nn>`, por ejemplo CLA-01 |
| Columna de alcance | MVP, Post-MVP y Visión, aparte de la prioridad | No existe; la prioridad hace las dos cosas |
| Trazabilidad | Cada requisito cita su fuente (reunión, estudio, mockup) | No existe |

Si el documento de prioridades va a separar MVP de lo que viene después, conviene agregar aquí la columna de alcance y alinear los identificadores antes de empezarlo.

## Fuera de alcance y decisiones pendientes

Hay nueve decisiones abiertas de producto, más las siete de la sección anterior; las tres primeras bloquean el desarrollo de la importación y la clasificación. Las decisiones técnicas viven en el documento de arquitectura.

### Fuera de la primera versión

- Hogares y presupuestos compartidos
- Conexión bancaria directa (Kripta, Rail o el Sistema de Finanzas Abiertas)
- Track de precios de productos y lectura de boletas
- Aplicación web para gestionar el presupuesto; en web solo hay landing page
- Estados de cuenta de tarjeta de crédito, el desglose de las compras con tarjeta y las compras en cuotas (regla 7). Quedan como función a futuro (decidido el 23-10-2026)
- Detección automática del día en que llega el sueldo para fijar el inicio del mes. Queda como función a futuro (decidido el 23-10-2026)
- Múltiples monedas y cuentas en el extranjero
- Cuentas de asesor o empleador
- Metas de ahorro y presupuestos por categoría
- Notificaciones y recordatorios

### Decisiones pendientes

| N° | Decisión | Por qué importa |
| --- | --- | --- |
| 1 | Reunir cartolas reales de los cuatro bancos, en cuenta corriente y cuenta vista | Sin muestras no se pueden diseñar los lectores; BCI y Santander no están verificados |
| 2 | ~~¿Qué perfil se sugiere a un usuario con deuda alta?~~ Resuelta el 23-10-2026: el 80/10/10, presentado como "Salir de deudas" (PER-04) | Con la deuda dentro de necesidades, el 50% es inalcanzable para muchos; el perfil deja de ser un extra |
| 3 | ~~¿Cómo se trata el pago de tarjeta cuando solo se sube la cuenta corriente?~~ Resuelta el 23-10-2026: en la v1 no se leen estados de cuenta de tarjeta y el pago cuenta como Pago de deudas (regla 3) | Evita duplicar gastos |
| 4 | ¿Iniciar sesión con Apple también en Android? | Cambia el trabajo del login en Android |
| 5 | ~~Límites exactos del plan gratis~~ Resuelta el 23-10-2026: ver PLA-01 | Define cuánto se puede probar antes de pagar |
| 6 | Plazo de borrado del archivo y de la cuenta | Debe coincidir con la política de privacidad |
| 7 | ~~¿Mes financiero configurable en la v1?~~ Resuelta el 23-10-2026: sí, con día del 1 al 28 y tolerancia de 3 días (PER-08) | Afecta cómo se calculan todos los totales |
| 8 | Si la app es solo móvil, ¿cómo sube la cartola quien la descarga en el computador? | Muchos bancos entregan la cartola desde su sitio web |
| 9 | ¿Se lanza en las dos tiendas a la vez o primero en una? | La revisión de Apple puede demorar, y aún no hay cuenta de Apple Developer |

Documentos relacionados: arquitectura (dónde vive cada cosa) y, pendiente, requisitos no funcionales (seguridad, privacidad, rendimiento y accesibilidad).
