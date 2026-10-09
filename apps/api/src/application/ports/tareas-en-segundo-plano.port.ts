/**
 * ITareasEnSegundoPlano — ejecuta trabajo best-effort FUERA del camino de la
 * respuesta. `programar` retorna de inmediato; la tarea corre después y
 * cualquier fallo lo absorbe la implementación (jamás un unhandled rejection).
 */
export interface ITareasEnSegundoPlano {
  programar(tarea: () => Promise<void>): void;
}
