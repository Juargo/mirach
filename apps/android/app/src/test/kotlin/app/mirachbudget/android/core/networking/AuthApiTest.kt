package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.session.Session
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

/** The auth endpoints of [GeneratedMirachApi] against a fake server. */
class AuthApiTest {
    private val server = MockWebServer()
    private val expired = mutableListOf<String>()

    @Before
    fun setUp() = server.start()

    @After
    fun tearDown() = server.close()

    private fun api(token: String? = null): MirachApi = MirachApiFactory.create(
        baseUrl = server.url("/").toString(),
        apiKey = "key-1",
        tokenProvider = { token },
        onSessionExpired = { expired += it },
    )

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    private fun request() = checkNotNull(server.takeRequest(5, TimeUnit.SECONDS)) { "no request" }

    private val loginBody = """{"token":"tok-9","userId":"u-1","expiresAt":"2026-10-04T12:00:00.000Z"}"""
    private val expectedSession = Session("tok-9", "u-1", Instant.parse("2026-10-04T12:00:00Z"))

    // --- capabilities

    @Test
    fun capabilitiesUseTheMobileGoogleFlagNotTheWebOne() = runBlocking<Unit> {
        json(200, """{"appleLoginEnabled":true,"googleLoginEnabled":true,"googleLoginMobileEnabled":false,"passwordLoginEnabled":true}""")

        assertEquals(AuthCapabilities(googleLoginEnabled = false, passwordLoginEnabled = true), api().capabilities())
        val r = request()
        assertEquals("/api/auth/capabilities", r.url.encodedPath)
        assertEquals("key-1", r.headers["x-api-key"])
    }

    @Test
    fun capabilitiesWithARejectedKeyIsApiKeyRejected() {
        json(401, """{"code":"API_KEY_INVALIDA"}""")

        assertThrows(ApiKeyRejectedException::class.java) { runBlocking { api().capabilities() } }
    }

    // --- Google

    @Test
    fun googleSignInPostsTheIdTokenAndMapsTheSession() = runBlocking<Unit> {
        json(200, loginBody)

        assertEquals(expectedSession, api().signInWithGoogle("id-token-1"))
        val r = request()
        assertEquals("POST", r.method)
        assertEquals("/api/auth/google/token", r.url.encodedPath)
        assertEquals("""{"idToken":"id-token-1"}""", r.body?.utf8())
    }

    @Test
    fun googleCredentialsRejectedAreInvalidCredentials() {
        json(401, """{"code":"CREDENCIALES_INVALIDAS"}""")

        assertThrows(InvalidCredentialsException::class.java) { runBlocking { api().signInWithGoogle("x") } }
    }

    @Test
    fun googleWithARejectedKeyIsApiKeyRejected() {
        json(401, """{"code":"API_KEY_INVALIDA"}""")

        assertThrows(ApiKeyRejectedException::class.java) { runBlocking { api().signInWithGoogle("x") } }
    }

    @Test
    fun googleSwitchedOffOnTheServerIsUnavailable() {
        json(404, """{"error":"not found"}""")

        assertThrows(SignInUnavailableException::class.java) { runBlocking { api().signInWithGoogle("x") } }
    }

    @Test
    fun googleTooManyAttemptsIsRateLimited() {
        json(429, """{"error":"slow down"}""")

        assertThrows(RateLimitedException::class.java) { runBlocking { api().signInWithGoogle("x") } }
    }

    // --- password

    @Test
    fun passwordSignInPostsTheCredentialsAndMapsTheSession() = runBlocking<Unit> {
        json(200, loginBody)

        assertEquals(expectedSession, api().signInWithPassword("rev@example.com", "s3cret"))
        val r = request()
        assertEquals("/api/auth/login", r.url.encodedPath)
        assertEquals("""{"email":"rev@example.com","password":"s3cret"}""", r.body?.utf8())
    }

    @Test
    fun aWrongPasswordIsInvalidCredentialsAndNeverASessionExpiry() {
        json(401, """{"code":"CREDENCIALES_INVALIDAS"}""")

        assertThrows(InvalidCredentialsException::class.java) { runBlocking { api("stale").signInWithPassword("a@b.c", "x") } }
        assertEquals(emptyList<String>(), expired)
    }

    @Test
    fun passwordTooManyAttemptsIsRateLimited() {
        json(429, "{}")

        assertThrows(RateLimitedException::class.java) { runBlocking { api().signInWithPassword("a@b.c", "x") } }
    }

    @Test
    fun anUndocumentedStatusKeepsItsCode() {
        json(503, "{}")

        val error = assertThrows(ApiException::class.java) { runBlocking { api().signInWithPassword("a@b.c", "x") } }
        assertEquals(503, error.status)
    }

    @Test
    fun aMalformedExpiryFailsAsSerializationError() {
        json(200, """{"token":"t","userId":"u","expiresAt":"tomorrow"}""")

        assertThrows(SerializationException::class.java) { runBlocking { api().signInWithPassword("a@b.c", "x") } }
    }

    // --- current user and the single 401 relay

    @Test
    fun currentUserMapsTheIdentityAndSendsTheBearer() = runBlocking<Unit> {
        json(200, """{"userId":"u-1","nombre":"Ana","email":null,"googleVinculado":false}""")

        assertEquals(CurrentUser(userId = "u-1", nombre = "Ana", email = null), api(token = "tok-1").currentUser())
        val r = request()
        assertEquals("/api/auth/me", r.url.encodedPath)
        assertEquals("Bearer tok-1", r.headers["Authorization"])
    }

    @Test
    fun anExpiredSessionIsReportedOnceThroughTheRelayWithTheSentToken() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api(token = "tok-1").currentUser() } }
        assertEquals(listOf("tok-1"), expired)
    }

    @Test
    fun aRejectedKeyIsNotASessionExpiry() {
        json(401, """{"code":"API_KEY_INVALIDA"}""")

        assertThrows(ApiKeyRejectedException::class.java) { runBlocking { api(token = "tok-1").currentUser() } }
        assertEquals(emptyList<String>(), expired)
    }

    @Test
    fun anUnreadableUnauthorizedBodyIsAPlainHttpErrorNotAnExpiry() {
        json(401, "not json")

        val error = assertThrows(ApiException::class.java) { runBlocking { api(token = "tok-1").currentUser() } }
        assertEquals(401, error.status)
        assertEquals(emptyList<String>(), expired)
    }

    @Test
    fun anExpiredSessionWithoutATokenDoesNotFireTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api(token = null).currentUser() } }
        assertNull(expired.firstOrNull())
    }

    // --- T2 advisory: base URL without trailing slash

    @Test
    fun aBaseUrlWithoutTrailingSlashStillWorks() = runBlocking<Unit> {
        json(200, """{"version":"1","commit":"abc","ref":"main","builtAt":"2026-10-11T00:00:00Z"}""")
        val noSlash = server.url("/").toString().trimEnd('/')

        val info = MirachApiFactory.create(baseUrl = noSlash, apiKey = "k").version()

        assertEquals(VersionInfo("1", "abc"), info)
        assertEquals("/version", request().url.encodedPath)
    }
}
