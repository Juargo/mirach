import Foundation

/// The words of "Perfil": neutral Spanish, "tú" (catalog rules). The server's own messages
/// are never shown for the codes the app knows (catalog gap 7: some of them use voseo).
extension PerfilViewModel {
    static let savedMessage = "Perfil guardado"

    var loadFailureMessage: String? {
        guard case .failed(let failure) = loadState else { return nil }
        switch failure {
        case .connection: return "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        case .server: return "No pudimos cargar tu perfil. Inténtalo de nuevo en unos segundos."
        }
    }

    var saveFailureMessage: String? {
        guard case .failed(let failure) = saveState else { return nil }
        switch failure {
        case .invalidName: return "El nombre debe tener entre 1 y 80 caracteres"
        case .connection: return "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        case .server: return "No pudimos guardar el nombre. Inténtalo de nuevo."
        }
    }

    var deleteFailureMessage: String? {
        guard case .failed(let failure) = deleteState else { return nil }
        switch failure {
        case .confirmationRejected: return "La confirmación no coincide. No se eliminó nada."
        case .retry: return "No se pudo eliminar la cuenta. Intenta de nuevo."
        }
    }
}

extension SessionController.SignedOutNotice {
    var message: String {
        switch self {
        case .accountDeleted: "Tu cuenta y tus datos se eliminaron"
        }
    }
}
