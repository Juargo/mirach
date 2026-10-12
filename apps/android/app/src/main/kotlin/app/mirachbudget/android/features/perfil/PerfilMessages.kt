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

    fun notice(notice: SignedOutNotice): String = when (notice) {
        SignedOutNotice.AccountDeleted -> "Tu cuenta y tus datos se eliminaron"
    }
}
