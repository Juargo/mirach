package app.mirachbudget.android.core.networking

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

/** `GET` and `PUT /api/perfil/presupuesto` of [GeneratedMirachApi] against a fake server. */
class PerfilPresupuestoApiTest {
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

    private fun request() = checkNotNull(server.takeRequest(5, TimeUnit.SECONDS)) { "no request" }

    private fun stored(perfil: String) =
        """{"perfil":"$perfil","metas":{"Necesidades":6000,"Deseos":2000,"Ahorro":2000},"diaCorte":1,"ingresoDeclarado":null}"""

    @Test
    fun readingTheProfileMapsEachPredefinedId() = runBlocking<Unit> {
        val ids = mapOf(
            "50_30_20" to PerfilPredefinido.P50_30_20,
            "65_20_15" to PerfilPredefinido.P65_20_15,
            "80_10_10" to PerfilPredefinido.P80_10_10,
            "90_5_5" to PerfilPredefinido.P90_5_5,
        )
        for ((wire, expected) in ids) {
            json(200, stored(wire))

            assertEquals(expected, api().perfilPresupuesto())

            val r = request()
            assertEquals("GET", r.method)
            assertEquals("/api/perfil/presupuesto", r.url.encodedPath)
            assertEquals("Bearer tok-1", r.headers["Authorization"])
        }
    }

    @Test
    fun aCustomProfileMapsToNothingSelected() = runBlocking<Unit> {
        json(200, stored("personalizado"))

        assertNull(api().perfilPresupuesto())
    }

    @Test
    fun savingSendsOnlyThePerfilAndAnswersTheStoredProfile() = runBlocking<Unit> {
        json(200, stored("65_20_15"))

        assertEquals(PerfilPredefinido.P65_20_15, api().cambiarPerfilPresupuesto(PerfilPredefinido.P65_20_15))

        val r = request()
        assertEquals("PUT", r.method)
        assertEquals("/api/perfil/presupuesto", r.url.encodedPath)
        // Exact JSON: an explicit `ingresoDeclarado: null` would clear the stored income.
        assertEquals("""{"perfil":"65_20_15"}""", r.body?.utf8())
        assertEquals("Bearer tok-1", r.headers["Authorization"])
        assertEquals("key-1", r.headers["x-api-key"])
    }

    @Test
    fun aRejectedSaveIsAPlainApiException() {
        json(400, """{"code":"BODY_INVALIDO","message":"x"}""")

        assertEquals(400, assertThrows(ApiException::class.java) { runBlocking { api().cambiarPerfilPresupuesto(PerfilPredefinido.P90_5_5) } }.status)
    }

    @Test
    fun anExpiredSessionWhileSavingGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-sent").cambiarPerfilPresupuesto(PerfilPredefinido.P80_10_10) } }
        assertEquals(listOf("tok-sent"), expired)
    }

    @Test
    fun anExpiredSessionWhileReadingGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-sent").perfilPresupuesto() } }
        assertEquals(listOf("tok-sent"), expired)
    }

    @Test
    fun theHandWrittenServiceDoesNotChangeTheOtherEndpointsOfTheSameClient() = runBlocking<Unit> {
        // Deleting the account is the other hand-declared service built from the same client.
        server.enqueue(MockResponse.Builder().code(204).build())

        api().deleteAccount("ELIMINAR")

        val r = request()
        assertEquals("DELETE", r.method)
        assertEquals("/api/cuenta", r.url.encodedPath)
        assertEquals("""{"confirmacion":"ELIMINAR"}""", r.body?.utf8())
        assertEquals("Bearer tok-1", r.headers["Authorization"])
    }
}
