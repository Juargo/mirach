package app.mirachbudget.android.testing

import app.mirachbudget.android.core.networking.AuthCapabilities
import app.mirachbudget.android.core.networking.CurrentUser
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ResumenMes
import app.mirachbudget.android.core.networking.VersionInfo
import app.mirachbudget.android.core.session.Session

/** Scriptable [MirachApi]: each endpoint runs the lambda a test assigns; unscripted calls fail loudly. */
class FakeMirachApi : MirachApi {
    var onVersion: suspend () -> VersionInfo = { error("version() not scripted") }
    var onCapabilities: suspend () -> AuthCapabilities = { error("capabilities() not scripted") }
    var onGoogle: suspend (String) -> Session = { error("signInWithGoogle() not scripted") }
    var onPassword: suspend (String, String) -> Session = { _, _ -> error("signInWithPassword() not scripted") }
    var onCurrentUser: suspend () -> CurrentUser = { error("currentUser() not scripted") }

    var onResumen: suspend (Periodo?) -> ResumenMes = { error("resumen() not scripted") }
    var onPeriodos: suspend () -> List<Periodo> = { error("periodos() not scripted") }

    var onUpdateNombre: suspend (String) -> CurrentUser = { error("updateNombre() not scripted") }
    var onLogout: suspend () -> Unit = {}
    var onDeleteAccount: suspend (String) -> Unit = {}

    val googleTokens = mutableListOf<String>()
    val passwordAttempts = mutableListOf<Pair<String, String>>()
    var currentUserCalls = 0
    val resumenCalls = mutableListOf<Periodo?>()
    var periodosCalls = 0
    val updateNombreCalls = mutableListOf<String>()
    var logoutCalls = 0
    val deleteCalls = mutableListOf<String>()

    override suspend fun version() = onVersion()
    override suspend fun capabilities() = onCapabilities()
    override suspend fun signInWithGoogle(idToken: String): Session {
        googleTokens += idToken
        return onGoogle(idToken)
    }

    override suspend fun signInWithPassword(email: String, password: String): Session {
        passwordAttempts += email to password
        return onPassword(email, password)
    }

    override suspend fun currentUser(): CurrentUser {
        currentUserCalls++
        return onCurrentUser()
    }

    override suspend fun updateNombre(nombre: String): CurrentUser {
        updateNombreCalls += nombre
        return onUpdateNombre(nombre)
    }

    override suspend fun logout() {
        logoutCalls++
        onLogout()
    }

    override suspend fun deleteAccount(confirmacion: String) {
        deleteCalls += confirmacion
        onDeleteAccount(confirmacion)
    }

    override suspend fun resumen(periodo: Periodo?): ResumenMes {
        resumenCalls += periodo
        return onResumen(periodo)
    }

    override suspend fun periodos(): List<Periodo> {
        periodosCalls++
        return onPeriodos()
    }
}
