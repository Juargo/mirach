package app.mirachbudget.android.core.networking

/** 401 `SESION_INVALIDA` on an authenticated call: the session is gone, sign in again. */
class SessionExpiredException : Exception("Session expired")

/** 401 `API_KEY_INVALIDA`: the app's client key is wrong. Signing in again cannot fix it, so it is NOT a session expiry. */
class ApiKeyRejectedException : Exception("API key rejected")

/** 401 `CREDENCIALES_INVALIDAS` on a sign-in endpoint (the server never says why). */
class InvalidCredentialsException : Exception("Invalid credentials")

/** 404 on the Google token endpoint: Google sign-in is switched off on the server. */
class SignInUnavailableException : Exception("Sign-in provider unavailable")

/** 429: too many attempts. */
class RateLimitedException : Exception("Rate limited")

/** 400 `NOMBRE_INVALIDO` on `PATCH /api/perfil`: the name is not 1 to 80 characters. */
class InvalidNameException : Exception("Invalid name")

/** 400 `CONFIRMACION_INVALIDA` on `DELETE /api/cuenta`: the server took the word as wrong; nothing was deleted. */
class ConfirmationRejectedException : Exception("Confirmation rejected")
