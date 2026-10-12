package app.mirachbudget.android.core.networking

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

/** The Perfil endpoints of [GeneratedMirachApi] against a fake server. */
class PerfilApiTest {
    private val server = MockWebServer()
    private val expired = mutableListOf<String>()

    @Before
    fun setUp() = server.start()

    @After
    fun tearDown() = server.close()

    private fun api(token: String? = "tok-1"): MirachApi = MirachApiFactory.create(
        baseUrl = server.url("/").toString(),
        apiKey = "key-1",
        tokenProvider = { token },
        onSessionExpired = { expired += it },
    )

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    private fun empty(code: Int) = server.enqueue(MockResponse.Builder().code(code).build())

    private fun request() = checkNotNull(server.takeRequest(5, TimeUnit.SECONDS)) { "no request" }

    private val me = """{"userId":"u-1","nombre":"Ana María","email":"ana@example.com","googleVinculado":false}"""

    // --- PATCH /api/perfil

    @Test
    fun updatingTheNameSendsOnlyTheNameAndMapsTheIdentity() = runBlocking<Unit> {
        json(200, me)

        assertEquals(CurrentUser("u-1", "Ana María", "ana@example.com"), api().updateNombre("Ana María"))

        val r = request()
        assertEquals("PATCH", r.method)
        assertEquals("/api/perfil", r.url.encodedPath)
        assertEquals("""{"nombre":"Ana María"}""", r.body?.utf8())
        assertEquals("Bearer tok-1", r.headers["Authorization"])
    }

    @Test
    fun anInvalidNameIsATypedError() {
        json(400, """{"code":"NOMBRE_INVALIDO","error":"x"}""")

        assertThrows(InvalidNameException::class.java) { runBlocking { api().updateNombre("") } }
    }

    @Test
    fun anyOther400WhileSavingIsAPlainApiException() {
        json(400, """{"code":"OTRO","error":"x"}""")

        assertEquals(400, assertThrows(ApiException::class.java) { runBlocking { api().updateNombre("A") } }.status)
    }

    @Test
    fun anExpiredSessionWhileSavingGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-7").updateNombre("A") } }
        assertEquals(listOf("tok-7"), expired)
    }

    @Test
    fun aServerErrorWhileSavingIsAnApiException() {
        json(500, """{"error":"boom"}""")

        assertEquals(500, assertThrows(ApiException::class.java) { runBlocking { api().updateNombre("A") } }.status)
    }

    // --- POST /api/auth/logout

    @Test
    fun logoutPostsAndAccepts204() = runBlocking<Unit> {
        empty(204)

        api().logout()

        val r = request()
        assertEquals("POST", r.method)
        assertEquals("/api/auth/logout", r.url.encodedPath)
        assertEquals("key-1", r.headers["x-api-key"])
    }

    @Test
    fun logoutFailuresAreThrownForTheCallerToIgnore() {
        json(500, """{"error":"boom"}""")
        assertEquals(500, assertThrows(ApiException::class.java) { runBlocking { api().logout() } }.status)

        json(401, """{"code":"API_KEY_INVALIDA"}""")
        assertThrows(ApiKeyRejectedException::class.java) { runBlocking { api().logout() } }
        assertEquals(emptyList<String>(), expired)
    }

    // --- DELETE /api/cuenta (a body on DELETE: declared by hand, Retrofit rejects the generated one)

    @Test
    fun deletingTheAccountSendsDeleteWithTheJsonBodyAndAccepts204() = runBlocking<Unit> {
        empty(204)

        api().deleteAccount("ELIMINAR")

        val r = request()
        assertEquals("DELETE", r.method)
        assertEquals("/api/cuenta", r.url.encodedPath)
        assertEquals("""{"confirmacion":"ELIMINAR"}""", r.body?.utf8())
        assertEquals("Bearer tok-1", r.headers["Authorization"])
        assertEquals("key-1", r.headers["x-api-key"])
        assertEquals(true, r.headers["Content-Type"]?.startsWith("application/json"))
    }

    @Test
    fun aRejectedConfirmationIsATypedError() {
        json(400, """{"code":"CONFIRMACION_INVALIDA","error":"x"}""")

        assertThrows(ConfirmationRejectedException::class.java) { runBlocking { api().deleteAccount("eliminar") } }
    }

    @Test
    fun anyOther400WhileDeletingIsAPlainApiException() {
        json(400, """{"code":"OTRO","error":"x"}""")

        assertEquals(400, assertThrows(ApiException::class.java) { runBlocking { api().deleteAccount("ELIMINAR") } }.status)
    }

    @Test
    fun anExpiredSessionWhileDeletingGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-7").deleteAccount("ELIMINAR") } }
        assertEquals(listOf("tok-7"), expired)
    }

    @Test
    fun aServerErrorWhileDeletingIsAnApiException() {
        json(503, """{"error":"boom"}""")

        assertEquals(503, assertThrows(ApiException::class.java) { runBlocking { api().deleteAccount("ELIMINAR") } }.status)
    }
}
