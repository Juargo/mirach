/**
 * IBancosImportadosReader — los bancos desde los que un usuario importó
 * cartolas, sin repetir, del primero al último según la creación de su primera
 * cuenta en cada uno. La cuenta de los movimientos registrados a mano no es un
 * banco y no aparece. Acotada por `userId` (RNF-SEC-006).
 */
export interface IBancosImportadosReader {
  bancosEnOrdenDeImportacion(userId: string): Promise<string[]>;
}
