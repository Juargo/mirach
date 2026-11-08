package app.mirachbudget.android.features.perfil

import app.mirachbudget.android.core.session.SessionController.SignedOutNotice
import app.mirachbudget.android.features.perfil.PerfilViewModel.DeleteFailure
import app.mirachbudget.android.features.perfil.PerfilViewModel.Failure
import app.mirachbudget.android.features.perfil.PerfilViewModel.SaveFailure

/**
 * The words of "Perfil": neutral Spanish, "tú" (catalog rules), identical to the iPhone app. The
 * server's own messages are never shown for the codes the app knows (catalog gap 7: some use voseo).
 */
object PerfilMessages {
    const val SAVED = "Perfil guardado"

    private const val CONNECTION = "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."

    fun load(failure: Failure): String = when (failure) {
        Failure.Connection -> CONNECTION
        Failure.Server -> "No pudimos cargar tu perfil. Inténtalo de nuevo en unos segundos."
    }

    fun save(failure: SaveFailure): String = when (failure) {
        SaveFailure.InvalidName -> "El nombre debe tener entre 1 y 80 caracteres"
        SaveFailure.Connection -> CONNECTION
        SaveFailure.Server -> "No pudimos guardar el nombre. Inténtalo de nuevo."
    }

    fun delete(failure: DeleteFailure): String = when (failure) {
        DeleteFailure.ConfirmationRejected -> "La confirmación no coincide. No se eliminó nada."
        DeleteFailure.Retry -> "No se pudo eliminar la cuenta. Intenta de nuevo."
    }

    // --- statement consent (PRI-06)

    const val CONSENT_TITLE = "Procesamiento de cartolas"
    const val REVOKE_BUTTON = "Revocar consentimiento"
    const val REVOKE_CONFIRM_TITLE = "¿Revocar consentimiento?"
    const val REVOKE_CONFIRM_BODY =
        "No podrás subir nuevas cartolas hasta que vuelvas a aceptarlo. Tus movimientos ya importados no se borran."
    const val REVOKE_CONFIRM = "Revocar"
    const val CANCEL = "Cancelar"
    const val REVOKED = "Consentimiento revocado"

    fun consentText(inForce: Boolean): String =
        if (inForce) {
            "Aceptaste que leamos tus cartolas para calcular tu 50/30/20."
        } else {
            "No has dado tu consentimiento. Te lo pediremos cuando subas una cartola."
        }

    fun revoke(failure: Failure): String = when (failure) {
        Failure.Connection -> CONNECTION
        Failure.Server -> "No pudimos revocar el consentimiento. Inténtalo de nuevo."
    }

    fun notice(notice: SignedOutNotice): String = when (notice) {
        SignedOutNotice.AccountDeleted -> "Tu cuenta y tus datos se eliminaron"
    }
}
