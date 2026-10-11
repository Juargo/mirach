package app.mirachbudget.android.core.config

/** Detects a build that cannot work, so it fails loudly instead of looping on 401s. */
object ConfigurationCheck {
    sealed interface Problem {
        /** `MIRACH_API_KEY` is empty: `secrets.properties` is missing or has no value. */
        data object MissingApiKey : Problem
    }

    fun problem(apiKey: String): Problem? = if (apiKey.isBlank()) Problem.MissingApiKey else null
}
