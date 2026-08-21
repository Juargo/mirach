import { RowIndexFueraDeRangoError } from './row-index-fuera-de-rango.error';

describe('RowIndexFueraDeRangoError', () => {
  it('construye con un mensaje descriptivo fijo', () => {
    const error = new RowIndexFueraDeRangoError(15, 10);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RowIndexFueraDeRangoError);
    expect(error.name).toBe('RowIndexFueraDeRangoError');
  });

  it('variante por defecto (fuera-de-rango): mensaje fijo con la causa, sin datos sensibles', () => {
    const error = new RowIndexFueraDeRangoError(15, 10);

    expect(error.causa).toBe('fuera-de-rango');
    expect(error.message).toBe(
      'una edición referencia una fila que no existe en el archivo ' +
        '(rowIndex 15 fuera del rango [0, 10); el archivo pudo haber cambiado)',
    );
    // No debe contener montos ni datos financieros crudos
    expect(error.message).not.toContain('1500000');
  });

  it("variante 'duplicado': segundo mensaje fijo (constante de compilación)", () => {
    const error = new RowIndexFueraDeRangoError(3, 10, 'duplicado');

    expect(error.causa).toBe('duplicado');
    expect(error.message).toBe(
      'una edición referencia una fila (rowIndex 3) más de una vez en el ' +
        'overlay; cada fila puede editarse a lo sumo una vez',
    );
    expect(error.name).toBe('RowIndexFueraDeRangoError');
  });

  it('los dos mensajes fijos difieren entre variantes', () => {
    const fueraDeRango = new RowIndexFueraDeRangoError(3, 10, 'fuera-de-rango');
    const duplicado = new RowIndexFueraDeRangoError(3, 10, 'duplicado');

    expect(fueraDeRango.message).not.toBe(duplicado.message);
  });

  it('NINGÚN texto arbitrario del caller puede alcanzar .message (scrub-safe: solo `causa` tipada, no free-text)', () => {
    // Ambas variantes producen únicamente uno de dos mensajes fijos. No hay
    // parámetro de texto libre por el cual un monto crudo pudiera filtrarse.
    const posiblesMensajes = new Set([
      new RowIndexFueraDeRangoError(0, 0, 'fuera-de-rango').message,
      new RowIndexFueraDeRangoError(0, 0, 'duplicado').message,
    ]);

    // Cualquier construcción, con cualquier rowIndex/totalFilas, produce solo
    // los dos mensajes canónicos (salvo la interpolación de enteros de posición).
    const conValoresRaros = new RowIndexFueraDeRangoError(999, 42, 'duplicado');
    expect(conValoresRaros.message).toContain('rowIndex 999');
    // El "amount" nunca aparece porque no existe un canal de texto libre.
    expect(conValoresRaros.message).not.toContain('$');
    expect(conValoresRaros.message).not.toContain('1500000');

    // El mensaje siempre corresponde a una de las dos plantillas fijas
    // (comprobando la parte estable de cada plantilla).
    const plantillasEstables = [
      'que no existe en el archivo',
      'más de una vez en el',
    ];
    const coincide = plantillasEstables.some((p) =>
      conValoresRaros.message.includes(p),
    );
    expect(coincide).toBe(true);
    expect(posiblesMensajes.size).toBe(2);
  });

  it('expone el rowIndex y el total de filas como propiedades', () => {
    const error = new RowIndexFueraDeRangoError(15, 10);

    expect(error.rowIndex).toBe(15);
    expect(error.totalFilas).toBe(10);
  });

  it('es instancia de Error (hereda correctamente)', () => {
    const error = new RowIndexFueraDeRangoError(0, 5);

    expect(error instanceof Error).toBe(true);
  });
});
