package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.formatting.Format
import java.net.SocketTimeoutException
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

/** `GET /api/ingestas` and `DELETE /api/ingestas/{id}` of [GeneratedMirachApi] against a fake server. */
class CartolasSubidasApiTest {
    private val server = MockWebServer()
    private val expired = mutableListOf<String>()

    @Before
    fun setUp() = server.start()

    @After
    fun tearDown() = server.close()

    private fun api(token: String? = "tok-sent"): MirachApi = MirachApiFactory.create(
        baseUrl = server.url("/").toString(),
        apiKey = "key-1",
        tokenProvider = { token },
        onSessionExpired = { expired += it },
        timeoutMillis = 500,
    )

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    private fun request() = checkNotNull(server.takeRequest(5, TimeUnit.SECONDS)) { "no request" }

    private fun item(
        id: String = "g-1",
        banco: String? = "Banco de Chile",
        archivo: String = "cartola.xlsx",
        estado: String = "PROCESADA",
        motivo: String? = null,
        fecha: String = "2026-10-03T14:20:00.000Z",
        total: Int = 37,
    ): String {
        val bank = banco?.let { "\"$it\"" } ?: "null"
        val reason = motivo?.let { "\"$it\"" } ?: "null"
        return """{"id":"$id","banco":$bank,"nombreArchivo":"$archivo","estado":"$estado","motivoFallo":$reason,""" +
            """"fecha":"$fecha","totalTransacciones":$total}"""
    }

    private fun body(vararg items: String) = """{"ingestas":[${items.joinToString(",")}]}"""

    // --- GET /api/ingestas

    @Test
    fun mapsAProcessedImportWithItsCount() = runBlocking<Unit> {
        json(200, body(item()))

        val list = api().cartolasSubidas()

        val r = request()
        assertEquals("GET", r.method)
        assertEquals("/api/ingestas", r.url.encodedPath)
        assertEquals("Bearer tok-sent", r.headers["Authorization"])
        assertEquals(
            listOf(
                CartolaSubida(
                    id = "g-1",
                    banco = "Banco de Chile",
                    nombreArchivo = "cartola.xlsx",
                    estado = CartolaSubida.Estado.Procesada,
                    motivoFallo = null,
                    fecha = Instant.ofEpochSecond(1_791_037_200),
                    totalTransacciones = 37,
                ),
            ),
            list,
        )
    }

    @Test
    fun theDateIsReadAsUTC() = runBlocking<Unit> {
        json(200, body(item(fecha = "2026-10-03T00:00:00.000Z")))

        val list = api().cartolasSubidas()

        assertEquals(Instant.ofEpochSecond(1_790_985_600), list[0].fecha)
        assertEquals("3 oct", Format.shortDate(list[0].fecha))
    }

    @Test
    fun aFailedImportKeepsItsReasonAndAnUnresolvedBankIsNull() = runBlocking<Unit> {
        json(200, body(item(id = "g-2", banco = null, archivo = "raro.pdf", estado = "FALLIDA", motivo = "Formato no reconocido", total = 0)))

        val cartola = api().cartolasSubidas().single()

        assertEquals(CartolaSubida.Estado.Fallida, cartola.estado)
        assertNull(cartola.banco)
        assertEquals("Formato no reconocido", cartola.motivoFallo)
    }

    @Test
    fun keepsTheServerOrderAndAnEmptyListIsEmpty() = runBlocking<Unit> {
        json(200, body(item(id = "g-9"), item(id = "g-3"), item(id = "g-5")))
        assertEquals(listOf("g-9", "g-3", "g-5"), api().cartolasSubidas().map { it.id })

        json(200, body())
        assertEquals(emptyList<CartolaSubida>(), api().cartolasSubidas())
    }

    @Test
    fun aMalformedDateIsRejectedInsteadOfShownWrong() {
        json(200, body(item(fecha = "ayer")))

        assertThrows(SerializationException::class.java) { runBlocking { api().cartolasSubidas() } }
    }

    @Test
    fun anExpiredSessionWhileListingGoesThroughTheRelay() {
        json(401, """{"message":"x","code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api().cartolasSubidas() } }
        assertEquals(listOf("tok-sent"), expired)
    }

    @Test
    fun aServerErrorWhileListingIsAnApiException() {
        json(503, "{}")

        assertEquals(503, assertThrows(ApiException::class.java) { runBlocking { api().cartolasSubidas() } }.status)
    }

    @Test
    fun noAnswerWhileListingReachesTheCallerAsIO() {
        server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.Stall).build())

        assertThrows(SocketTimeoutException::class.java) { runBlocking { api().cartolasSubidas() } }
    }

    // --- DELETE /api/ingestas/{id}

    @Test
    fun deleteSendsTheIdInThePathWithTheDeleteMethod() = runBlocking<Unit> {
        server.enqueue(MockResponse.Builder().code(204).build())

        api().eliminarCartola("g-1")

        val r = request()
        assertEquals("DELETE", r.method)
        assertEquals("/api/ingestas/g-1", r.url.encodedPath)
        assertEquals("Bearer tok-sent", r.headers["Authorization"])
    }

    @Test
    fun aMissingImportIsTypedSoTheScreenCanDropItFromTheList() {
        json(404, """{"message":"x"}""")

        assertThrows(CartolaNotFoundException::class.java) { runBlocking { api().eliminarCartola("g-1") } }
        assertEquals(emptyList<String>(), expired)
    }

    @Test
    fun deleteMapsSessionAndServerFailures() {
        json(401, """{"message":"x","code":"SESION_INVALIDA"}""")
        assertThrows(SessionExpiredException::class.java) { runBlocking { api().eliminarCartola("g-1") } }
        assertEquals(listOf("tok-sent"), expired)

        json(500, "{}")
        assertEquals(500, assertThrows(ApiException::class.java) { runBlocking { api().eliminarCartola("g-1") } }.status)
    }
}
