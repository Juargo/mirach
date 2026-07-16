/**
 * RangoFechasInvalidoError — error de dominio.
 *
 * Se produce cuando el PDF, por lo demás con estructura correcta (todos los
 * encabezados presentes), no trae el ancla de período (fecha "desde"/"hasta"
 * del statement) que BancoEstado, Banco de Chile y Santander necesitan para
 * inferir el año de cada movimiento (ver `inferirAnios`). Es un error de
 * dominio DISTINTO de `EstructuraPdfInvalidaError` — un PDF puede tener todos
 * sus encabezados de tabla correctos y aun así carecer del período (CA-07).
 *
 * BCI está EXENTO: trae el año explícito en cada fila
 * (`fuenteAnio.kind === 'explicito'`) y no necesita el período para ser
 * válido — ver PdfjsStructureValidatorService.
 */
export class RangoFechasInvalidoError extends Error {
  constructor(banco: string) {
    super(
      `No se encontró el período (fecha desde/hasta) del estado de cuenta para ${banco}.`,
    );
    this.name = 'RangoFechasInvalidoError';
  }
}
