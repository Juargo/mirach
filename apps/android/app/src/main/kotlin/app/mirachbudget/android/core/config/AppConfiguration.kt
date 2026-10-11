package app.mirachbudget.android.core.config

import app.mirachbudget.android.BuildConfig

/** Build-time values: the API URL and the public client key (ADR-047) from `secrets.properties`. */
object AppConfiguration {
    const val apiBaseUrl: String = BuildConfig.API_BASE_URL
    const val apiKey: String = BuildConfig.MIRACH_API_KEY
}
