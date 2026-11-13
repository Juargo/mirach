import Foundation

/// The words of "Perfil": neutral Spanish, "tú" (catalog rules). The server's own messages
/// are never shown for the codes the app knows (catalog gap 7: some of them use voseo).
extension PerfilViewModel {
    static let savedMessage = "Perfil guardado"

    // MARK: statement consent (PRI-06); the same words as Android.

    static let consentTitle = "Procesamiento de cartolas"
    static let revokeButtonTitle = "Revocar consentimiento"
    static let revokeConfirmationTitle = "¿Revocar consentimiento?"
    static let revokeConfirmationMessage =
        "No podrás subir nuevas cartolas hasta que vuelvas a aceptarlo. Tus movimientos ya importados no se borran."
    static let revokeConfirmButton = "Revocar"
    static let revokeCancelButton = "Cancelar"
    static let revokedMessage = "Consentimiento revocado"

    /// `nil` while the consent is unknown: the section is not shown.
    var consentText: String? {
        switch cartolasConsent {
        case true?: "Aceptaste que leamos tus cartolas para calcular tu 50/30/20."
        case false?: "No has dado tu consentimiento. Te lo pediremos cuando subas una cartola."
        case nil: nil
        }
    }

    // MARK: back up the data (ADR-013, S7)

    static let linkTitle = "Respalda tus datos"
    static let linkText = "Vincula tu cuenta para no perder tus datos si borras la app o cambias de teléfono."
    static let linkAppleTitle = "Vincular con Apple"
    static let linkGoogleTitle = "Vincular con Google"
    static let linkedMessage = "Cuenta vinculada"
    static let existingAccountTitle = "Esa cuenta ya existe"
    static let existingAccountMessage =
        "Si entras a ella, uniremos los datos de este dispositivo con los de esa cuenta."
    static let existingAccountConfirmButton = "Entrar y unir datos"
    static let existingAccountCancelButton = "Cancelar"

    // MARK: merge the parked anonymous data (ADR-014)

    static let mergeTitle = "Datos de este dispositivo"
    static let mergeText = "Tienes datos guardados de cuando usaste la app sin cuenta."
    static let mergeActionTitle = "Unir a mi cuenta"
    static let mergedMessage = "Datos de este dispositivo unidos a tu cuenta"
    static let mergeFailedMessage =
        "No pudimos unir los datos de este dispositivo. Puedes intentarlo de nuevo desde Perfil."
    static let mergeUnavailableMessage = "Esos datos ya no están disponibles."

    var mergeResultMessage: String? { mergeState == .merged ? Self.mergedMessage : nil }

    var mergeFailureMessage: String? {
        switch mergeState {
        case .failed: Self.mergeFailedMessage
        case .unavailable: Self.mergeUnavailableMessage
        case .idle, .merging, .merged: nil
        }
    }

    var linkedNotice: String? { linkState == .linked ? Self.linkedMessage : nil }

    var linkFailureMessage: String? {
        guard case .failed(let failure) = linkState else { return nil }
        switch failure {
        case .connection: return "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        case .generic: return "No pudimos vincular la cuenta. Inténtalo de nuevo."
        }
    }

    var revokeMessage: String? { revokeState == .revoked ? Self.revokedMessage : nil }

    var revokeFailureMessage: String? {
        guard case .failed(let failure) = revokeState else { return nil }
        switch failure {
        case .connection: return "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        case .server: return "No pudimos revocar el consentimiento. Inténtalo de nuevo."
        }
    }

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
