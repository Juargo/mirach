package app.mirachbudget.android.core.networking

/** Which sign-in methods the server has switched on (`GET /api/auth/capabilities`). */
data class AuthCapabilities(
    /** Google sign-in for mobile clients (`googleLoginMobileEnabled`); the web flag is not used. */
    val googleLoginEnabled: Boolean,
    /** The App Review email and password form (ADR-051); off for everyone else. */
    val passwordLoginEnabled: Boolean,
)

/** The signed-in person as `GET /api/auth/me` reports it. */
data class CurrentUser(val userId: String, val nombre: String, val email: String? = null)
