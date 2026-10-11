package app.mirachbudget.android.testing

import app.mirachbudget.android.core.networking.AuthCapabilities
import app.mirachbudget.android.core.networking.CurrentUser
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.VersionInfo
import app.mirachbudget.android.core.session.Session

/** Scriptable [MirachApi]: each endpoint runs the lambda a test assigns; unscripted calls fail loudly. */
class FakeMirachApi : MirachApi {
    var onVersion: suspend () -> VersionInfo = { error("version() not scripted") }
    var onCapabilities: suspend () -> AuthCapabilities = { error("capabilities() not scripted") }
    var onGoogle: suspend (String) -> Session = { error("signInWithGoogle() not scripted") }
    var onPassword: suspend (String, String) -> Session = { _, _ -> error("signInWithPassword() not scripted") }
    var onCurrentUser: suspend () -> CurrentUser = { error("currentUser() not scripted") }

    val googleTokens = mutableListOf<String>()
    val passwordAttempts = mutableListOf<Pair<String, String>>()
    var currentUserCalls = 0

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
}
