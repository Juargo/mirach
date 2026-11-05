package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.staging.CartolaFile
import java.io.File
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** The upload endpoints of [GeneratedMirachApi] (`POST /api/ingestas/preview` and `/commit`) against a fake server. */
class IngestaApiTest {
    @get:Rule
    val temp = TemporaryFolder()

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

    private fun cartola(name: String = "cartola enero.pdf", content: String = "%PDF-1.7 bytes"): CartolaFile {
        val file = temp.newFile()
        file.writeText(content)
        return CartolaFile(file = file, filename = name, byteCount = file.length())
    }

    /** The parts of a `multipart/form-data` body: name to (headers block, content). */
    private fun parts(r: RecordedRequest): Map<String, Pair<String, String>> {
        val contentType = checkNotNull(r.headers["Content-Type"])
        assertTrue(contentType, contentType.startsWith("multipart/form-data"))
        val boundary = contentType.substringAfter("boundary=")
        return checkNotNull(r.body).utf8()
            .split("--$boundary")
            .drop(1)
            .dropLast(1)
            .associate { raw ->
                val headers = raw.substringBefore("\r\n\r\n").trim()
                val content = raw.substringAfter("\r\n\r\n").removeSuffix("\r\n")
                val name = Regex("name=\"([^\"]+)\"").find(headers)!!.groupValues[1]
                name to (headers to content)
            }
    }

    private val preview = """
        {"banco":"Banco de Chile","tipoCuenta":"Cuenta Corriente","numeroCuenta":"00-123-45678-09",
         "estructura":{"totalFilasDatos":3},"muestra":[],
         "resumen":{"totalFilas":3,"duplicadosDetectados":1,"nuevas":2},
         "filas":[
           {"rowIndex":0,"fecha":"2026-01-05T00:00:00.000Z","descripcion":"SUPERMERCADO","cargo":"12990","abono":"0","esDuplicado":false,
            "sugerido":{"bucket":"Necesidades","categoriaId":"cat-1"}},
           {"rowIndex":1,"fecha":"2026-01-06T00:00:00Z","descripcion":"SUELDO","cargo":"0","abono":"1500000.00","esDuplicado":true,
            "sugerido":{"bucket":"Ahorro","categoriaId":null}},
           {"rowIndex":2,"fecha":"2026-01-07T12:30:00Z","descripcion":"RARO","cargo":"5000","abono":"0","esDuplicado":false,"sugerido":null}
         ]}
    """.trimIndent()

    private val committed = """{"ingestaId":"ing-1","totalTransacciones":2,"duplicadosOmitidos":1,"transacciones":[]}"""

    // --- POST /api/ingestas/preview

    @Test
    fun previewSendsTheFileWithItsNameAndNoPasswordPart() = runBlocking<Unit> {
        json(200, preview)

        api().previewIngesta(cartola(), password = null)

        val r = request()
        assertEquals("POST", r.method)
        assertEquals("/api/ingestas/preview", r.url.encodedPath)
        assertEquals("Bearer tok-1", r.headers["Authorization"])
        assertEquals("key-1", r.headers["x-api-key"])
        val parts = parts(r)
        assertEquals(setOf("file"), parts.keys)
        val (headers, content) = parts.getValue("file")
        assertTrue(headers, headers.contains("filename=\"cartola enero.pdf\""))
        assertEquals("%PDF-1.7 bytes", content)
    }

    @Test
    fun anEmptyPasswordIsNotSent() = runBlocking<Unit> {
        json(200, preview)

        api().previewIngesta(cartola(), password = "")

        assertEquals(setOf("file"), parts(request()).keys)
    }

    @Test
    fun aPasswordTravelsAsPlainTextNotJsonQuoted() = runBlocking<Unit> {
        json(200, preview)

        api().previewIngesta(cartola(), password = "se\"cret 1")

        val parts = parts(request())
        assertEquals(setOf("file", "password"), parts.keys)
        assertEquals("se\"cret 1", parts.getValue("password").second)
    }

    @Test
    fun thePreviewIsMappedToAppModelsWithExactMoney() = runBlocking<Unit> {
        json(200, preview)

        val result = api().previewIngesta(cartola(), password = null)

        assertEquals(
            CartolaPreview(
                banco = "Banco de Chile",
                tipoCuenta = "Cuenta Corriente",
                numeroCuenta = "00-123-45678-09",
                totalFilas = 3,
                duplicados = 1,
                nuevas = 2,
                filas = listOf(
                    CartolaRow(
                        rowIndex = 0,
                        fecha = Instant.parse("2026-01-05T00:00:00Z"),
                        descripcion = "SUPERMERCADO",
                        cargo = 12_990L,
                        abono = 0L,
                        esDuplicado = false,
                        sugerido = CartolaRow.Sugerencia(Bucket.Necesidades, "cat-1"),
                    ),
                    CartolaRow(
                        rowIndex = 1,
                        fecha = Instant.parse("2026-01-06T00:00:00Z"),
                        descripcion = "SUELDO",
                        cargo = 0L,
                        abono = 1_500_000L,
                        esDuplicado = true,
                        sugerido = CartolaRow.Sugerencia(Bucket.Ahorro, null),
                    ),
                    CartolaRow(
                        rowIndex = 2,
                        fecha = Instant.parse("2026-01-07T12:30:00Z"),
                        descripcion = "RARO",
                        cargo = 5_000L,
                        abono = 0L,
                        esDuplicado = false,
                        sugerido = null,
                    ),
                ),
            ),
            result,
        )
    }

    @Test
    fun aSuggestionInABucketTheAppDoesNotKnowIsNoSuggestion() = runBlocking<Unit> {
        json(200, preview.replace("\"Necesidades\"", "\"Otro\""))

        assertNull(api().previewIngesta(cartola(), password = null).filas[0].sugerido)
    }

    @Test
    fun aFractionalAmountIsRefusedRatherThanRounded() {
        json(200, preview.replace("\"12990\"", "\"12990.5\""))

        assertThrows(SerializationException::class.java) { runBlocking { api().previewIngesta(cartola(), password = null) } }
    }

    @Test
    fun aPreviewWithoutResumenIsMalformed() {
        json(200, preview.replace("\"resumen\":{\"totalFilas\":3,\"duplicadosDetectados\":1,\"nuevas\":2},", ""))

        assertThrows(SerializationException::class.java) { runBlocking { api().previewIngesta(cartola(), password = null) } }
    }

    @Test
    fun aBadDateIsMalformed() {
        json(200, preview.replace("2026-01-05T00:00:00.000Z", "05/01/2026"))

        assertThrows(SerializationException::class.java) { runBlocking { api().previewIngesta(cartola(), password = null) } }
    }

    @Test
    fun aProtectedPdfAsksForThePassword() {
        json(400, """{"code":"PDF_PROTEGIDO","message":"x"}""")

        assertThrows(IngestaException.PasswordRequired::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
    }

    @Test
    fun aWrongPasswordIsItsOwnError() {
        json(400, """{"code":"PDF_PASSWORD_INCORRECTA","message":"x"}""")

        assertThrows(IngestaException.PasswordIncorrect::class.java) { runBlocking { api().previewIngesta(cartola(), "x") } }
    }

    @Test
    fun aStatementWithoutMovementsIsItsOwnError() {
        json(400, """{"code":"SIN_MOVIMIENTOS","message":"x"}""")

        assertThrows(IngestaException.NoMovements::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
    }

    @Test
    fun anyOther400KeepsTheServerMessage() {
        json(400, """{"code":"BANCO_NO_RECONOCIDO","message":"No reconocemos el banco."}""")

        val error = assertThrows(IngestaException.Rejected::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
        assertEquals("No reconocemos el banco.", error.serverMessage)
    }

    @Test
    fun a400WithoutAReadableBodyIsRejectedWithoutAMessage() {
        json(400, "not json")

        val error = assertThrows(IngestaException.Rejected::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
        assertNull(error.serverMessage)
    }

    @Test
    fun aMissingConsentIsDistinctFromTheCatalog() {
        json(409, """{"code":"CONSENTIMIENTO_CARTOLAS_REQUERIDO","message":"x"}""")

        assertThrows(IngestaException.ConsentRequired::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
    }

    @Test
    fun anIncompleteCatalogIsItsOwnError() {
        json(409, """{"code":"CATALOGO_INCOMPLETO","message":"x"}""")

        assertThrows(IngestaException.CatalogIncomplete::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
    }

    @Test
    fun anUnavailableCatalogIsTransient() {
        json(503, """{"code":"CATALOGO_NO_DISPONIBLE","message":"x"}""")

        assertThrows(IngestaException.CatalogUnavailable::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
    }

    @Test
    fun a500IsAServerFailure() {
        json(500, """{"message":"x"}""")

        assertThrows(IngestaException.ServerFailure::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
    }

    @Test
    fun anUndocumentedStatusIsAPlainApiException() {
        json(413, """{"message":"x"}""")

        assertEquals(413, assertThrows(ApiException::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }.status)
    }

    @Test
    fun anExpiredSessionDuringPreviewGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-7").previewIngesta(cartola(), null) } }
        assertEquals(listOf("tok-7"), expired)
    }

    @Test
    fun aRejectedKeyDuringPreviewIsNotASessionExpiry() {
        json(401, """{"code":"API_KEY_INVALIDA"}""")

        assertThrows(ApiKeyRejectedException::class.java) { runBlocking { api().previewIngesta(cartola(), null) } }
        assertEquals(emptyList<String>(), expired)
    }

    @Test
    fun aStagedCopyThatIsGoneIsUnreadableAndNothingIsSent() {
        val gone = CartolaFile(file = File(temp.root, "missing"), filename = "a.pdf", byteCount = 0)

        assertThrows(IngestaException.FileUnreadable::class.java) { runBlocking { api().previewIngesta(gone, null) } }
        assertEquals(0, server.requestCount)
    }

    // --- POST /api/ingestas/commit

    @Test
    fun commitSendsTheFileTheEditsAsJsonTextAndThePassword() = runBlocking<Unit> {
        json(201, committed)

        api().commitIngesta(
            cartola(name = "cartola.xlsx", content = "xlsx-bytes"),
            password = "clave",
            edits = listOf(CartolaEdit(rowIndex = 3, categoriaId = "cat-\"9\""), CartolaEdit(rowIndex = 7, categoriaId = "cat-2")),
        )

        val r = request()
        assertEquals("POST", r.method)
        assertEquals("/api/ingestas/commit", r.url.encodedPath)
        assertEquals("Bearer tok-1", r.headers["Authorization"])
        val parts = parts(r)
        assertEquals(setOf("file", "edits", "password"), parts.keys)
        assertTrue(parts.getValue("file").first.contains("filename=\"cartola.xlsx\""))
        assertEquals("xlsx-bytes", parts.getValue("file").second)
        assertEquals(
            """[{"rowIndex":3,"categoriaId":"cat-\"9\""},{"rowIndex":7,"categoriaId":"cat-2"}]""",
            parts.getValue("edits").second,
        )
        assertEquals("clave", parts.getValue("password").second)
    }

    @Test
    fun commitWithoutEditsSendsAnEmptyListAndNoPassword() = runBlocking<Unit> {
        json(201, committed)

        api().commitIngesta(cartola(), password = "", edits = emptyList())

        val parts = parts(request())
        assertEquals(setOf("file", "edits"), parts.keys)
        assertEquals("[]", parts.getValue("edits").second)
    }

    @Test
    fun theCommitResultIsMapped() = runBlocking<Unit> {
        json(201, committed)

        assertEquals(
            CartolaCommitResult(ingestaId = "ing-1", totalTransacciones = 2, duplicadosOmitidos = 1),
            api().commitIngesta(cartola(), password = null, edits = emptyList()),
        )
    }

    @Test
    fun commitMapsTheSameErrorsAsPreview() {
        val cases = listOf(
            Triple(400, """{"code":"PDF_PROTEGIDO","message":"x"}""", IngestaException.PasswordRequired::class.java),
            Triple(400, """{"code":"PDF_PASSWORD_INCORRECTA","message":"x"}""", IngestaException.PasswordIncorrect::class.java),
            Triple(400, """{"code":"SIN_MOVIMIENTOS","message":"x"}""", IngestaException.NoMovements::class.java),
            Triple(400, """{"message":"edits inválido"}""", IngestaException.Rejected::class.java),
            Triple(409, """{"code":"CONSENTIMIENTO_CARTOLAS_REQUERIDO","message":"x"}""", IngestaException.ConsentRequired::class.java),
            Triple(409, """{"code":"CATALOGO_INCOMPLETO","message":"x"}""", IngestaException.CatalogIncomplete::class.java),
            Triple(503, """{"code":"CATALOGO_NO_DISPONIBLE","message":"x"}""", IngestaException.CatalogUnavailable::class.java),
            Triple(500, """{"message":"x"}""", IngestaException.ServerFailure::class.java),
        )
        for ((status, body, expected) in cases) {
            json(status, body)
            assertThrows(expected) { runBlocking { api().commitIngesta(cartola(), null, emptyList()) } }
        }
    }

    @Test
    fun anExpiredSessionDuringCommitGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-8").commitIngesta(cartola(), null, emptyList()) } }
        assertEquals(listOf("tok-8"), expired)
    }
}
