package app.mirachbudget.android

import android.content.Context
import android.util.Log
import app.mirachbudget.android.core.config.AppConfiguration
import app.mirachbudget.android.core.config.ConfigurationCheck
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.MirachApiFactory
import app.mirachbudget.android.core.networking.SessionExpiryRelay
import app.mirachbudget.android.core.session.AndroidSessionStorage
import app.mirachbudget.android.core.session.SessionController
import app.mirachbudget.android.core.session.SessionStore

/** Composition root: decides which concrete dependencies the app uses. */
object AppEnvironment {
    private const val TAG = "MirachConfiguration"

    class Dependencies(
        val api: MirachApi,
        val session: SessionController,
        /** The WEB-type OAuth client ID for Credential Manager; blank hides "Continuar con Google". */
        val googleWebClientId: String,
        /** Non-null when the build cannot work; the root then shows an error screen. */
        val configurationProblem: ConfigurationCheck.Problem?,
    )

    fun make(
        context: Context,
        apiKey: String = AppConfiguration.apiKey,
        baseUrl: String = AppConfiguration.apiBaseUrl,
        googleWebClientId: String = AppConfiguration.googleWebClientId,
        debug: Boolean = BuildConfig.DEBUG,
        store: SessionStore = AndroidSessionStorage.create(context),
    ): Dependencies {
        val problem = ConfigurationCheck.problem(apiKey)
        // Debug builds say what to fix; Release shows only the generic error screen.
        if (debug) {
            if (problem != null) {
                Log.e(TAG, "MIRACH_API_KEY is empty: copy secrets.example.properties to secrets.properties and set it.")
            }
            if (googleWebClientId.isBlank()) {
                Log.w(TAG, "GOOGLE_WEB_CLIENT_ID is empty: the Google button is hidden. Set it in secrets.properties.")
            }
        }
        val relay = SessionExpiryRelay()
        val api = MirachApiFactory.create(
            baseUrl = baseUrl,
            apiKey = apiKey,
            tokenProvider = { store.load()?.token },
            onSessionExpired = relay::fire,
        )
        val session = SessionController(api, store)
        relay.connect(session::sessionExpired)
        return Dependencies(api, session, googleWebClientId, problem)
    }
}
