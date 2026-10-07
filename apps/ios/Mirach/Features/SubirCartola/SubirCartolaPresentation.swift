import Foundation

/// Copy of "Subir cartola": the catalog's own texts, neutral Spanish with "tú".
extension SubirCartolaViewModel {
    nonisolated static let noMovementsMessage = "No encontramos movimientos en el archivo"
    nonisolated static let connectionMessage = "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
    /// 409 `CATALOGO_INCOMPLETO`: own copy, the server's text uses the old bucket label.
    nonisolated static let accountProblemMessage =
        "No pudimos importar tu cartola por un problema de tu cuenta. El archivo está bien y no se importó nada."

    nonisolated static let tooManyEditsMessage =
        "No caben más cambios en una sola importación. Confirma los que ya hiciste o deshaz alguno."
    /// 400 on a commit that carried edits: the catalog drifted since the review started.
    nonisolated static let badEditsMessage =
        "No pudimos aplicar tus cambios. Revisa la clasificación e inténtalo de nuevo."

    nonisolated static let unreadableCopyMessage = "No pudimos leer el archivo. Elígelo de nuevo."

    nonisolated static func message(for problem: CartolaFileProblem) -> String {
        switch problem {
        case .unsupportedExtension: "Elige un archivo .xlsx o .pdf."
        case .tooLarge: "El archivo pesa más de 10 MB. Elige uno más pequeño."
        case .unreadable: "No pudimos abrir el archivo. Inténtalo de nuevo."
        }
    }
}

extension SubirCartolaViewModel.PreviewFailure {
    var message: String {
        switch self {
        case .noMovements: SubirCartolaViewModel.noMovementsMessage
        case .rejected(let message): message
        case .temporarilyUnavailable: "No se pudo analizar ahora, intenta de nuevo."
        case .accountProblem: SubirCartolaViewModel.accountProblemMessage
        case .connection: SubirCartolaViewModel.connectionMessage
        case .server: "No pudimos analizar la cartola. Inténtalo de nuevo en unos segundos."
        }
    }
}

extension SubirCartolaViewModel.ImportFailure {
    var message: String {
        switch self {
        case .temporarilyUnavailable: "No se pudo importar ahora, intenta de nuevo. No se guardó nada."
        case .accountProblem: SubirCartolaViewModel.accountProblemMessage
        case .connection: "Problema de conexión. No se guardó nada; revisa tu conexión e inténtalo de nuevo."
        case .server: "No pudimos importar la cartola. No se guardó nada; inténtalo de nuevo."
        }
    }
}

extension SubirCartolaViewModel.ImportSummary {
    /// «37 movimientos importados de Banco de Chile» («1 movimiento importado de …»).
    var headline: String {
        let noun = totalTransacciones == 1 ? "movimiento importado" : "movimientos importados"
        return "\(totalTransacciones) \(noun) de \(banco)"
    }

    /// «5 duplicados omitidos», or `nil` when there were none.
    var duplicatesLine: String? {
        guard duplicadosOmitidos > 0 else { return nil }
        let noun = duplicadosOmitidos == 1 ? "duplicado omitido" : "duplicados omitidos"
        return "\(duplicadosOmitidos) \(noun)"
    }
}

extension SubirCartolaViewModel.State {
    /// Prompt of the `protegido` state.
    static func passwordPrompt(incorrect: Bool) -> String {
        incorrect
            ? "La contraseña es incorrecta. Inténtalo de nuevo."
            : "Este archivo está protegido. Ingresa su contraseña para continuar."
    }
}

extension SubirCartolaViewModel {
    nonisolated static let updatingPreviewMessage = "Actualizando la vista previa con la nueva categoría…"

    /// «X» se aplicó a N filas más (or just "created" when nothing else matched).
    nonisolated static func appliedMessage(name: String, count: Int) -> String {
        guard count > 0 else { return "Categoría «\(name)» creada." }
        return "«\(name)» se aplicó a \(count) \(count == 1 ? "fila" : "filas") más"
    }

    nonisolated static func refreshFailedMessage(name: String) -> String {
        "«\(name)» se creó, pero no pudimos actualizar la vista previa. Tus cambios siguen aquí."
    }

    /// Where each error of `POST /api/categorias` shows in the form. Our own copy; the server's
    /// `message` is only the fallback for a code the app does not know.
    nonisolated static func formErrors(for error: any Error) -> CategoryFormErrors {
        var errors = CategoryFormErrors()
        switch error {
        case CategoriaError.invalidName: errors.name = "El nombre debe tener entre 1 y 40 caracteres"
        case CategoriaError.bucketNotAssignable: errors.bucket = "Elige un grupo: Necesidades, Deseos o Ahorro"
        case CategoriaError.invalidIcon: errors.general = "Elige un ícono válido de la lista"
        case CategoriaError.invalidPattern:
            errors.pattern = "Escribe un texto válido para el patrón (de 1 a 200 caracteres)"
        case CategoriaError.invalidMatchType: errors.pattern = "Ese tipo de coincidencia no es válido"
        case CategoriaError.invalidRegex: errors.pattern = "Esa expresión regular no es válida"
        case CategoriaError.duplicateName: errors.name = "Ya tienes una categoría con ese nombre"
        case CategoriaError.duplicatePattern: errors.pattern = "Ya tienes un patrón con ese texto"
        case CategoriaError.rejected(let message): errors.general = message
        case is URLError, is CancellationError:
            errors.general = "No pudimos crear la categoría. Revisa tu conexión e inténtalo de nuevo."
        default: errors.general = "No pudimos crear la categoría. Inténtalo de nuevo."
        }
        return errors
    }

    /// Rows the new category now matches that it did not before: those whose suggestion became
    /// the new category. Not counted: the row it was created from (it got the category as an
    /// edit), rows the person classified by hand (the server's suggestion does not show there) and
    /// duplicates (not imported). A row absent from `before` counts like a changed one.
    nonisolated static func newMatches(
        before: [CartolaRow], after: [CartolaRow], categoryID: String, fromRow: Int, edits: [Int: String]
    ) -> Int {
        let previous = Dictionary(before.map { ($0.rowIndex, $0.sugerido?.categoriaId) }, uniquingKeysWith: { first, _ in first })
        return after.filter { row in
            !row.esDuplicado && row.rowIndex != fromRow && edits[row.rowIndex] == nil
                && row.sugerido?.categoriaId == categoryID && previous[row.rowIndex].flatMap { $0 } != categoryID
        }.count
    }
}
