# Registrar a mano

Agregar un gasto o un ingreso que no viene en una cartola, por ejemplo un pago en efectivo, y borrarlo si hace falta corregirlo (MOV-02, MOV-09, MOV-10).

## Pantallas

| N° | Pantalla | Figma | Requisitos | Alcance |
|---|---|---|---|---|
| 06 | Agregar transacción | [`63:87`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=63-87) | MOV-02 | v1.0 |
| 07 | Registrar a mano · gasto | [`63:157`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=63-157) | MOV-02 | v1.0 |
| 41 | Registrar a mano · ingreso | [`149:1228`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=149-1228) | MOV-02 | v1.0 |
| 42 | Registrar a mano · error de fecha | [`149:1272`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=149-1272) | MOV-02 | v1.0 |
| 43 | Registrar a mano · resumen antes de guardar | [`149:1316`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=149-1316) | MOV-02 | v1.0 |
| 44 | Detalle de movimiento registrado a mano | [`149:1514`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=149-1514) | MOV-09, MOV-10 | v1.0 |

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/categorias` | Al abrir el formulario de gasto | 200, 401 |
| POST | `/api/movimientos` | Al confirmar el resumen (43) | 201, 400, 401, 500 |
| DELETE | `/api/movimientos/{id}` | Al confirmar el borrado desde el detalle (44) | 204, 401, 404 |

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Guardar un gasto | `POST /api/movimientos` | `{"tipo": "Gasto", "fecha": "AAAA-MM-DD", "descripcion", "monto": "<entero en texto>", "bucket": "Necesidades"\|"Deseos"\|"Ahorro", "categoriaId"}`. `monto` va como texto, nunca como número JSON | 201: vuelve al Inicio y anuncia «Movimiento guardado» | 400 **sin `code`**, solo `{message}` (fecha futura, descripción vacía o larga, monto inválido, categoría fuera del catálogo o que no concuerda con el bloque): se muestra el `message` sin borrar lo escrito y, si el error es de catálogo, se recarga el catálogo (brecha 21); 500 reintentable |
| Guardar un ingreso | `POST /api/movimientos` | `{"tipo": "Ingreso", "fecha", "descripcion", "monto"}`, sin `bucket` ni `categoriaId` (con ellos responde 400) | 201 igual que el gasto; el ingreso suma a los ingresos del mes | Igual que el gasto |
| Borrar un movimiento manual | `DELETE /api/movimientos/{id}` | — | 204: vuelve a la lista y anuncia «Movimiento eliminado» | 404: el movimiento ya no existe, no es de la cuenta o vino de una cartola (anti-enumeración): se quita de la lista |

Reglas de contrato:

- El resumen (43) se muestra siempre antes de llamar al API; el envío ocurre al confirmar.
- La fecha, el monto y la descripción se validan en el servidor. Mientras el 400 no traiga `code` (brecha 21), la app marca el campo con validación de formulario propia (obligatorios y fecha no futura, pantalla 42) antes de enviar; el 400 sigue cubierto.
- Un doble toque no debe crear dos movimientos: el botón se deshabilita mientras responde. El contrato todavía no expone `Idempotency-Key` (ADR-005 §6 lo prevé).
- Solo los movimientos con `origen` «Manual» se pueden borrar; los de una cartola se corrigen borrando la importación completa ([Importaciones](importaciones-y-cuenta.md)). No hay edición: corregir es borrar y registrar de nuevo (MOV-10).

## Estados

- **Formulario**: tipo (gasto o ingreso), monto, fecha, descripción y, si es gasto, categoría agrupada por bloque.
- **Guardando**: botón deshabilitado con progreso.
- **Error de validación**: el campo marcado y lo escrito conservado.
- **Confirmando borrado**: diálogo con la consecuencia y botón destructivo rotulado.

## Navegación

- Entrada: «+ Agregar transacción» → 06 → registrar a mano.
- Salida: [Inicio](inicio-y-movimientos.md) al guardar; el detalle (44) se abre desde la lista de [Movimientos](inicio-y-movimientos.md).

## Pendiente en el API

- Brecha 21 (#157): el 400 de `POST /api/movimientos` no trae `code`, así que la app no puede marcar el campo que falló a partir de la respuesta.

## Notas por plataforma

- El monto usa teclado numérico sin decimales; el formato `$1.234` se aplica al mostrar, no al enviar.
- El selector de fecha no ofrece días futuros.
