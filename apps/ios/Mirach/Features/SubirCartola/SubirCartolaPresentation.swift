import Foundation

/// Copy of "Subir cartola": the catalog's own texts, neutral Spanish with "tú".
extension SubirCartolaViewModel {
    nonisolated static let noMovementsMessage = "No encontramos movimientos en el archivo"
    nonisolated static let connectionMessage = "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
    /// 409 `CATALOGO_INCOMPLETO`: own copy, the server's text uses the old bucket label.
    nonisolated static let accountProblemMessage =
        "No pudimos importar tu cartola por un problema de tu cuenta. El archivo está bien y no se importó nada."

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
