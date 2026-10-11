package app.mirachbudget.android

import android.util.Log
import app.mirachbudget.android.core.config.AppConfiguration
import app.mirachbudget.android.core.config.ConfigurationCheck
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.MirachApiFactory

/** Composition root: decides which concrete dependencies the app uses. */
object AppEnvironment {
    private const val TAG = "MirachConfiguration"

    class Dependencies(
        val api: MirachApi,
        /** Non-null when the build cannot work; the root then shows an error screen. */
        val configurationProblem: ConfigurationCheck.Problem?,
    )

    fun make(
        apiKey: String = AppConfiguration.apiKey,
        baseUrl: String = AppConfiguration.apiBaseUrl,
        debug: Boolean = BuildConfig.DEBUG,
    ): Dependencies {
        val problem = ConfigurationCheck.problem(apiKey)
        // Debug builds say what to fix; Release shows only the generic error screen.
        if (problem != null && debug) {
            Log.e(TAG, "MIRACH_API_KEY is empty: copy secrets.example.properties to secrets.properties and set it.")
        }
        return Dependencies(api = MirachApiFactory.create(baseUrl = baseUrl, apiKey = apiKey), configurationProblem = problem)
    }
}
