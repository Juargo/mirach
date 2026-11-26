/**
 * IExclusionPorUsuario — ejecuta una acción de a una por usuario: dos llamadas
 * simultáneas para el mismo usuario corren una después de la otra, también
 * entre instancias del API. Sirve para una regla del tipo "leer, decidir y
 * escribir" que dos peticiones a la vez podrían pasar las dos.
 */
export interface IExclusionPorUsuario {
  enExclusiva<T>(userId: string, accion: () => Promise<T>): Promise<T>;
}
