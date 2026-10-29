package app.mirachbudget.android.core.networking

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** `GET /api/resumen` and `GET /api/periodos` through [GeneratedMirachApi] against a fake server. */
class ResumenApiTest {
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
    )

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    private fun request() = checkNotNull(server.takeRequest(5, TimeUnit.SECONDS)) { "no request" }

    /** A bucket on the wire: its name, total, porcentajeBp and estado, the last two already JSON text. */
    private class Wire(val name: String, val total: String, val bp: String, val estado: String)

    private fun body(
        periodo: String = "2026-09",
        estadoGlobal: String = "\"amarillo\"",
        ingreso: String = "1000000",
        sinIngreso: Boolean = false,
        targets: String = """{"Necesidades":50,"Deseos":30,"Ahorro":20}""",
        buckets: List<Wire> = listOf(
            Wire("Necesidades", "450000", "4500", "\"verde\""),
            Wire("Deseos", "305000", "3050", "\"amarillo\""),
            Wire("Ahorro", "0", "0", "null"),
        ),
    ): String {
        val list = buckets.joinToString(",") {
            """{"bucket":"${it.name}","total":"${it.total}","porcentajeBp":${it.bp},"participacionGastoBp":null,"metaBp":5000,"estadoSemaforo":${it.estado},"estado":null}"""
        }
        return """{"periodo":"$periodo","sinIngreso":$sinIngreso,"totalIngreso":"$ingreso","estadoGlobal":$estadoGlobal,"estadoMes":null,"bloquesEstadoMes":[],"targets":$targets,"buckets":[$list]}"""
    }

    private fun three(necesidades: String = "null", deseos: String = "null", ahorro: String = "null") = listOf(
        Wire("Necesidades", "1", "1", necesidades), Wire("Deseos", "1", "1", deseos), Wire("Ahorro", "1", "1", ahorro),
    )

    @Test
    fun mapsAMonthWithExactMoneyAndBasisPoints() = runBlocking<Unit> {
        json(200, body())

        val mes = api().resumen(null)

        assertEquals(Periodo(2026, 9), mes.periodo)
        assertEquals(1_000_000L, mes.totalIngreso)
        assertEquals(EstadoSemaforo.Amarillo, mes.estadoGlobal)
        assertEquals(listOf(Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro), mes.buckets.map { it.bucket })
        assertEquals(listOf(450_000L, 305_000L, 0L), mes.buckets.map { it.total })
        assertEquals(listOf<Int?>(4_500, 3_050, 0), mes.buckets.map { it.porcentajeBp })
        assertEquals(listOf(5_000, 3_000, 2_000), mes.buckets.map { it.metaBp })
        assertEquals(listOf(EstadoSemaforo.Verde, EstadoSemaforo.Amarillo, null), mes.buckets.map { it.estado })
    }

    @Test
    fun keepsMoneyBeyondDoublePrecisionExact() = runBlocking<Unit> {
        val big = "9007199254740993" // 2^53 + 1: the first integer a Double cannot hold
        json(
            200,
            body(
                ingreso = big,
                buckets = listOf(Wire("Necesidades", big, "5000", "null"), Wire("Deseos", "-1500", "0", "null"), Wire("Ahorro", "0", "0", "null")),
            ),
        )

        val mes = api().resumen(null)

        assertEquals(9_007_199_254_740_993L, mes.totalIngreso)
        assertEquals(9_007_199_254_740_993L, mes.buckets[0].total)
        assertEquals(-1_500L, mes.buckets[1].total)
    }

    @Test
    fun aNullStateMeansNoState() = runBlocking<Unit> {
        json(200, body(estadoGlobal = "null", buckets = three(deseos = "\"rojo\"")))

        val mes = api().resumen(null)

        assertNull(mes.estadoGlobal)
        assertEquals(listOf(null, EstadoSemaforo.Rojo, null), mes.buckets.map { it.estado })
    }

    @Test
    fun anEmptyOrUnknownStateValueMeansNoStateAndNeverFailsTheMonth() = runBlocking<Unit> {
        // The spec lists `null` among the enum values; other generators render it as an empty value.
        for (estado in listOf("\"\"", "\"morado\"")) {
            json(200, body(estadoGlobal = estado, buckets = three(necesidades = estado, deseos = "\"rojo\"", ahorro = estado)))

            val mes = api().resumen(null)

            assertNull(mes.estadoGlobal)
            assertEquals(listOf(null, EstadoSemaforo.Rojo, null), mes.buckets.map { it.estado })
        }
    }

    @Test
    fun mapsEveryStateValue() = runBlocking<Unit> {
        json(200, body(estadoGlobal = "\"rojo\"", buckets = three("\"verde\"", "\"amarillo\"", "\"rojo\"")))

        val mes = api().resumen(null)

        assertEquals(EstadoSemaforo.Rojo, mes.estadoGlobal)
        assertEquals(listOf(EstadoSemaforo.Verde, EstadoSemaforo.Amarillo, EstadoSemaforo.Rojo), mes.buckets.map { it.estado })
    }

    @Test
    fun aMonthWithoutIncomeHasNoPercentages() = runBlocking<Unit> {
        json(
            200,
            body(
                estadoGlobal = "null", ingreso = "0", sinIngreso = true,
                buckets = listOf(Wire("Necesidades", "0", "null", "null"), Wire("Deseos", "0", "null", "null"), Wire("Ahorro", "0", "null", "null")),
            ),
        )

        val mes = api().resumen(null)

        assertTrue(mes.sinIngreso)
        assertEquals(listOf<Int?>(null, null, null), mes.buckets.map { it.porcentajeBp })
    }

    @Test
    fun putsBucketsInCatalogOrderWhateverTheServerSends() = runBlocking<Unit> {
        json(200, body(buckets = listOf(Wire("Ahorro", "3", "3", "null"), Wire("Necesidades", "1", "1", "null"), Wire("Deseos", "2", "2", "null"))))

        val mes = api().resumen(null)

        assertEquals(listOf(Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro), mes.buckets.map { it.bucket })
        assertEquals(listOf(1L, 2L, 3L), mes.buckets.map { it.total })
    }

    @Test
    fun targetsBecomeBasisPointsWithoutFloatingPointDrift() = runBlocking<Unit> {
        json(200, body(targets = """{"Necesidades":50.5,"Deseos":29.99,"Ahorro":19.51}"""))

        assertEquals(listOf(5_050, 2_999, 1_951), api().resumen(null).buckets.map { it.metaBp })
    }

    @Test
    fun rejectsBodiesTheAppCannotTrust() {
        val ok = three()
        val broken = listOf(
            body(periodo = "2026-13"),
            body(ingreso = "12,5"),
            body(buckets = listOf(Wire("Otros", "1", "1", "null")) + ok.drop(1)),
            body(buckets = ok.take(1)),
            // A repeated bucket must not silently replace the first one.
            body(buckets = ok + Wire("Necesidades", "2", "2", "null")),
        )
        for (text in broken) {
            json(200, text)
            assertThrows(SerializationException::class.java) { runBlocking { api().resumen(null) } }
        }
    }

    @Test
    fun sendsThePeriodOnlyWhenAsked() = runBlocking<Unit> {
        json(200, body())
        json(200, body(periodo = "2026-08"))

        api().resumen(null)
        api().resumen(Periodo(2026, 8))

        val first = request()
        assertEquals("/api/resumen", first.url.encodedPath)
        assertNull(first.url.queryParameter("periodo"))
        assertEquals("key-1", first.headers["x-api-key"])
        assertEquals("Bearer tok-sent", first.headers["Authorization"])
        assertEquals("2026-08", request().url.queryParameter("periodo"))
    }

    @Test
    fun periodosAreParsedInTheOrderReceived() = runBlocking<Unit> {
        json(200, """{"periodos":["2026-09","2026-08","2026-06"]}""")

        assertEquals(listOf(Periodo(2026, 9), Periodo(2026, 8), Periodo(2026, 6)), api().periodos())
        assertEquals("/api/periodos", request().url.encodedPath)
    }

    @Test
    fun anEmptyPeriodosListIsValidAndAMalformedOneIsNot() = runBlocking<Unit> {
        json(200, """{"periodos":[]}""")
        assertEquals(emptyList<Periodo>(), api().periodos())

        json(200, """{"periodos":["2026-09","soon"]}""")
        assertThrows(SerializationException::class.java) { runBlocking { api().periodos() } }
    }

    @Test
    fun aRejectedSessionIsReportedThroughTheRelayForBothEndpoints() {
        json(401, """{"message":"x","code":"SESION_INVALIDA"}""")
        json(401, """{"message":"x","code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api().resumen(null) } }
        assertThrows(SessionExpiredException::class.java) { runBlocking { api().periodos() } }

        assertEquals(listOf("tok-sent", "tok-sent"), expired)
    }

    @Test
    fun aRejectedKeyIsNotASessionExpiry() {
        json(401, """{"message":"x","code":"API_KEY_INVALIDA"}""")

        assertThrows(ApiKeyRejectedException::class.java) { runBlocking { api().resumen(null) } }
        assertTrue(expired.isEmpty())
    }

    @Test
    fun otherStatusesAreApiExceptions() {
        json(400, """{"message":"bad"}""")
        json(503, "")

        assertEquals(400, assertThrows(ApiException::class.java) { runBlocking { api().resumen(Periodo(2026, 8)) } }.status)
        assertEquals(503, assertThrows(ApiException::class.java) { runBlocking { api().periodos() } }.status)
    }
}
