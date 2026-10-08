import Foundation

/// The words of "Detalle de categoría": confirmations that name their consequence and the
/// message of every rejection the catalog names (the app's own copy, the server's text only as
/// a fallback for a code it does not know).
enum DetalleCategoriaPresentation {
    static let protectedMessage = "Esta categoría es del sistema y no se puede editar ni eliminar"
    static let goneMessage = "Esa categoría ya no existe"

    /// «12 movimientos pasarán de Deseos a Necesidades en todos los meses.» The zero case softens
    /// the sentence; it never skips the confirmation (ADR-038).
    static func bucketChange(_ change: DetalleCategoriaViewModel.BucketChange) -> String {
        switch change.count {
        case 0: "Esta categoría todavía no tiene movimientos. Pasará de \(change.from.label) a \(change.to.label)."
        case 1: "1 movimiento pasará de \(change.from.label) a \(change.to.label) en todos los meses."
        default: "\(change.count) movimientos pasarán de \(change.from.label) a \(change.to.label) en todos los meses."
        }
    }

    /// Where the movements go and what else is removed with the category.
    static func deletion(_ category: CategoriaCatalogo) -> String {
        let count = category.transaccionesCount
        var parts: [String] = []
        switch count {
        case 0: parts.append("No tiene movimientos.")
        case 1: parts.append("Su movimiento pasará a «Desconocido» de \(category.bucket.label).")
        default: parts.append("Sus \(count) movimientos pasarán a «Desconocido» de \(category.bucket.label).")
        }
        switch category.patrones.count {
        case 0: break
        case 1: parts.append("También se eliminará su patrón.")
        default: parts.append("También se eliminarán sus \(category.patrones.count) patrones.")
        }
        parts.append("Esta acción no se puede deshacer.")
        return parts.joined(separator: " ")
    }

    static func categoryErrors(for error: any Error) -> DetalleCategoriaViewModel.FieldErrors {
        var errors = DetalleCategoriaViewModel.FieldErrors()
        switch error {
        case CategoriaError.invalidName: errors.name = "El nombre debe tener entre 1 y 40 caracteres"
        case CategoriaError.duplicateName: errors.name = "Ya tienes una categoría con ese nombre"
        case CategoriaError.bucketNotAssignable: errors.bucket = "Elige un grupo: Necesidades, Deseos o Ahorro"
        case CategoriaError.invalidIcon: errors.icon = "Elige un ícono válido de la lista"
        case CategoriaError.isInternal: errors.general = protectedMessage
        case CategoriaError.rejected(let message): errors.general = message
        case is URLError, is CancellationError:
            errors.general = "No pudimos guardar los cambios. Revisa tu conexión e inténtalo de nuevo."
        default: errors.general = "No pudimos guardar los cambios. Inténtalo de nuevo."
        }
        return errors
    }

    static func patternErrors(for error: any Error) -> DetalleCategoriaViewModel.PatternErrors {
        var errors = DetalleCategoriaViewModel.PatternErrors()
        switch error {
        case PatronError.invalidPattern:
            errors.pattern = "Escribe un texto válido para el patrón (de 1 a 200 caracteres)"
        case PatronError.invalidRegex: errors.pattern = "Esa expresión regular no es válida"
        case PatronError.duplicate: errors.pattern = "Ya tienes un patrón con ese texto"
        case PatronError.invalidMatchType: errors.pattern = "Ese tipo de coincidencia no es válido"
        case PatronError.rejected(let message): errors.general = message
        case is URLError, is CancellationError:
            errors.general = "No pudimos guardar el patrón. Revisa tu conexión e inténtalo de nuevo."
        default: errors.general = "No pudimos guardar el patrón. Inténtalo de nuevo."
        }
        return errors
    }

    static func deleteFailure(_ error: any Error, what: String) -> String {
        switch error {
        case is URLError, is CancellationError:
            "No pudimos eliminar \(what). Revisa tu conexión e inténtalo de nuevo."
        default: "No pudimos eliminar \(what). Inténtalo de nuevo."
        }
    }
}
