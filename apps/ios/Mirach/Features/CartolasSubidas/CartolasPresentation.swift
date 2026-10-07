import Foundation

/// The words of "Cartolas subidas": what a row says, the confirmation before deleting and what
/// VoiceOver reads. The status is always a word, never only a colour.
enum CartolasPresentation {
    static func banco(_ cartola: CartolaSubida) -> String {
        cartola.banco ?? "Banco no identificado"
    }

    static func estado(_ cartola: CartolaSubida) -> String {
        cartola.estado == .procesada ? "Procesada" : "Fallida"
    }

    /// A failed import has no movements: nothing to count.
    static func movimientos(_ cartola: CartolaSubida) -> String? {
        guard cartola.estado == .procesada else { return nil }
        return IngresosPresentation.count(cartola.totalTransacciones)
    }

    /// The server's reason, when it sent one worth showing.
    static func motivo(_ cartola: CartolaSubida) -> String? {
        guard cartola.estado == .fallida, let reason = cartola.motivoFallo, !reason.isEmpty else { return nil }
        return reason
    }

    /// The consequence, named before the person confirms (catalog: "Confirmación obligatoria").
    static func confirmation(_ cartola: CartolaSubida) -> String {
        let origin = "\(banco(cartola)) (\(Format.shortDate(cartola.fecha)))"
        guard cartola.estado == .procesada else { return "Se eliminará esta cartola fallida de \(origin)." }
        let count = cartola.totalTransacciones
        let verb = count == 1 ? "eliminará" : "eliminarán"
        return "Se \(verb) \(IngresosPresentation.count(count)) de \(origin). Esta acción no se puede deshacer."
    }

    static func rowLabel(_ cartola: CartolaSubida) -> String {
        var parts = [banco(cartola), cartola.nombreArchivo, Format.shortDate(cartola.fecha), estado(cartola)]
        if let count = movimientos(cartola) { parts.append(count) }
        var label = parts.joined(separator: ". ")
        if let reason = motivo(cartola) { label += ". Motivo: \(reason)" }
        return label
    }
}
