import Foundation

/// The imports behind the UI-test stub (see `AppEnvironment.stubbedClientArgument`): two
/// processed ones and a failed one whose bank was never resolved. Deleting removes them for
/// the rest of the launch, like the real API.
final class StubCartolas: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [CartolaSubida] = [
        CartolaSubida(
            id: "g-3", banco: "Banco de Chile", nombreArchivo: "cartola-septiembre-2026-cuenta-corriente.xlsx",
            estado: .procesada, motivoFallo: nil, fecha: Date(timeIntervalSince1970: 1_790_985_600),
            totalTransacciones: 37
        ),
        CartolaSubida(
            id: "g-2", banco: nil, nombreArchivo: "estado-de-cuenta.pdf", estado: .fallida,
            motivoFallo: "No se reconoció el formato del archivo", fecha: Date(timeIntervalSince1970: 1_790_899_200),
            totalTransacciones: 0
        ),
        CartolaSubida(
            id: "g-1", banco: "BancoEstado", nombreArchivo: "cuenta-rut.xlsx", estado: .procesada,
            motivoFallo: nil, fecha: Date(timeIntervalSince1970: 1_788_307_200), totalTransacciones: 12
        ),
    ]

    var all: [CartolaSubida] { lock.withLock { items } }

    /// `false` when it was not there (a 404).
    func remove(id: String) -> Bool {
        lock.withLock {
            guard let index = items.firstIndex(where: { $0.id == id }) else { return false }
            items.remove(at: index)
            return true
        }
    }
}

extension StubMirachAPI {
    func cartolasSubidas() async throws -> [CartolaSubida] { cartolas.all }

    func eliminarCartola(id: String) async throws {
        guard cartolas.remove(id: id) else { throw EliminarCartolaError.notFound }
    }
}
