package app.mirachbudget.android.core.networking

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** `GET/POST /api/categorias` and `GET/POST /api/consentimientos` of [GeneratedMirachApi] against a fake server. */
class CategoriasConsentimientosApiTest {
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

    private fun categoria(id: String, nombre: String, bucket: String, icono: String? = null) =
        """{"id":"$id","nombre":"$nombre","bucket":"$bucket","esInterna":false,"transaccionesCount":4,"patrones":[]""" +
            (icono?.let { ""","icono":"$it"""" } ?: "") + "}"

    // --- GET /api/categorias

    @Test
    fun theCatalogIsMappedAndGroupedByBucket() = runBlocking<Unit> {
        json(
            200,
            """{"categorias":[${categoria("c1", "Arriendo", "Necesidades", "casa")},${categoria("c2", "Cine", "Deseos")},""" +
                """${categoria("c3", "Raro", "Otro")},${categoria("c4", "Luz", "Necesidades")}]}""",
        )

        val catalog = api().categorias()

        val r = request()
        assertEquals("GET", r.method)
        assertEquals("/api/categorias", r.url.encodedPath)
        assertEquals("Bearer tok-1", r.headers["Authorization"])
        // A bucket the app does not know cannot be placed in a group: left out.
        assertEquals(
            listOf(
                CategoriaCatalogo("c1", "Arriendo", Bucket.Necesidades, "casa", transaccionesCount = 4),
                CategoriaCatalogo("c2", "Cine", Bucket.Deseos, null, transaccionesCount = 4),
                CategoriaCatalogo("c4", "Luz", Bucket.Necesidades, null, transaccionesCount = 4),
            ),
            catalog.categorias,
        )
        assertEquals(listOf("c1", "c4"), catalog.deBucket(Bucket.Necesidades).map { it.id })
        assertEquals(emptyList<CategoriaCatalogo>(), catalog.deBucket(Bucket.Ahorro))
        assertEquals("Cine", catalog.categoria("c2")?.nombre)
        assertNull(catalog.categoria("c3"))
    }

    @Test
    fun anExpiredSessionWhileListingGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-7").categorias() } }
        assertEquals(listOf("tok-7"), expired)
    }

    @Test
    fun aServerErrorWhileListingIsAnApiException() {
        json(500, """{"message":"x"}""")

        assertEquals(500, assertThrows(ApiException::class.java) { runBlocking { api().categorias() } }.status)
    }

    // --- POST /api/categorias

    @Test
    fun creatingSendsOneContainsPatternTrimmedAndTheIcon() = runBlocking<Unit> {
        json(201, categoria("c9", "Mascotas", "Deseos", "pata"))

        val created = api().crearCategoria(NuevaCategoria(nombre = "Mascotas", bucket = Bucket.Deseos, patron = "  PET SHOP ", icono = "pata"))

        assertEquals(CategoriaCatalogo("c9", "Mascotas", Bucket.Deseos, "pata", transaccionesCount = 4), created)
        val r = request()
        assertEquals("POST", r.method)
        assertEquals("/api/categorias", r.url.encodedPath)
        assertEquals("Bearer tok-1", r.headers["Authorization"])
        assertEquals(
            """{"bucket":"Deseos","nombre":"Mascotas","icono":"pata","patrones":[{"matchType":"CONTAINS","patron":"PET SHOP"}]}""",
            r.body?.utf8(),
        )
    }

    @Test
    fun aBlankPatternAndNoIconAreLeftOut() = runBlocking<Unit> {
        json(201, categoria("c9", "Mascotas", "Ahorro"))

        api().crearCategoria(NuevaCategoria(nombre = "Mascotas", bucket = Bucket.Ahorro, patron = "   ", icono = null))

        assertEquals("""{"bucket":"Ahorro","nombre":"Mascotas"}""", request().body?.utf8())
    }

    @Test
    fun aCreatedCategoryInAnUnknownBucketIsMalformed() {
        json(201, categoria("c9", "Mascotas", "Otro"))

        assertThrows(SerializationException::class.java) {
            runBlocking { api().crearCategoria(NuevaCategoria("Mascotas", Bucket.Deseos, null, null)) }
        }
    }

    @Test
    fun everyCatalogCodeIsATypedError() {
        val cases = listOf<Triple<Int, String, CategoriaException>>(
            Triple(400, """{"code":"NOMBRE_INVALIDO","message":"m"}""", CategoriaException.InvalidName()),
            Triple(400, """{"code":"BUCKET_NO_ASIGNABLE","message":"m"}""", CategoriaException.BucketNotAssignable()),
            Triple(400, """{"code":"ICONO_INVALIDO","message":"m"}""", CategoriaException.InvalidIcon()),
            Triple(400, """{"code":"PATRON_INVALIDO","message":"m","indice":0}""", CategoriaException.InvalidPattern(0)),
            Triple(400, """{"code":"MATCH_TYPE_INVALIDO","message":"m","indice":1}""", CategoriaException.InvalidMatchType(1)),
            Triple(400, """{"code":"REGEX_INVALIDA","message":"m"}""", CategoriaException.InvalidRegex(null)),
            Triple(409, """{"code":"NOMBRE_DUPLICADO","message":"m"}""", CategoriaException.DuplicateName()),
            Triple(409, """{"code":"PATRON_DUPLICADO","message":"m","indice":0}""", CategoriaException.DuplicatePattern(0)),
            Triple(409, """{"code":"OTRO","message":"Algo pasó."}""", CategoriaException.Rejected("Algo pasó.")),
        )
        for ((status, body, expected) in cases) {
            json(status, body)
            val error = assertThrows(CategoriaException::class.java) {
                runBlocking { api().crearCategoria(NuevaCategoria("A", Bucket.Deseos, null, null)) }
            }
            assertEquals(body, describe(expected), describe(error))
        }
    }

    /** Exceptions have identity equality: compare what a screen can read from them. */
    private fun describe(e: CategoriaException) =
        "${e::class.simpleName} indice=${e.indice} message=${(e as? CategoriaException.Rejected)?.serverMessage}"

    @Test
    fun a400WithoutAReadableBodyIsAPlainApiException() {
        json(400, "not json")

        assertEquals(
            400,
            assertThrows(ApiException::class.java) {
                runBlocking { api().crearCategoria(NuevaCategoria("A", Bucket.Deseos, null, null)) }
            }.status,
        )
    }

    @Test
    fun anExpiredSessionWhileCreatingGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) {
            runBlocking { api("tok-7").crearCategoria(NuevaCategoria("A", Bucket.Deseos, null, null)) }
        }
        assertEquals(listOf("tok-7"), expired)
    }

    // --- GET /api/consentimientos

    private fun consent(tipo: String, revocadoEn: String? = null) =
        """{"tipo":"$tipo","version":"2026-11-03","aceptadoEn":"2026-11-03T10:00:00.000Z","revocadoEn":${revocadoEn?.let { "\"$it\"" } ?: "null"}}"""

    @Test
    fun aCartolasConsentInForceIsReported() = runBlocking<Unit> {
        json(200, """{"consentimientos":[${consent("terminos")},${consent("cartolas")}]}""")

        assertTrue(api().consentimientos().cartolasVigente)

        val r = request()
        assertEquals("GET", r.method)
        assertEquals("/api/consentimientos", r.url.encodedPath)
        assertEquals("Bearer tok-1", r.headers["Authorization"])
    }

    @Test
    fun aRevokedOrMissingCartolasConsentIsNotInForce() = runBlocking<Unit> {
        json(200, """{"consentimientos":[${consent("cartolas", revocadoEn = "2026-11-04T00:00:00Z")},${consent("privacidad")}]}""")
        assertFalse(api().consentimientos().cartolasVigente)

        json(200, """{"consentimientos":[]}""")
        assertFalse(api().consentimientos().cartolasVigente)
    }

    @Test
    fun anExpiredSessionWhileReadingConsentsGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-7").consentimientos() } }
        assertEquals(listOf("tok-7"), expired)
    }

    // --- POST /api/consentimientos

    @Test
    fun acceptingSendsTheCartolasTypeWithTheLegalVersion() = runBlocking<Unit> {
        json(201, consent("cartolas"))

        api().aceptarConsentimientoCartolas()

        val r = request()
        assertEquals("POST", r.method)
        assertEquals("/api/consentimientos", r.url.encodedPath)
        assertEquals("Bearer tok-1", r.headers["Authorization"])
        assertEquals("""{"tipo":"cartolas","version":"2026-11-03"}""", r.body?.utf8())
    }

    @Test
    fun aRejectedAcceptanceIsAnApiException() {
        json(400, """{"code":"VERSION_CONSENTIMIENTO_INVALIDA","message":"x"}""")

        assertEquals(400, assertThrows(ApiException::class.java) { runBlocking { api().aceptarConsentimientoCartolas() } }.status)
    }

    @Test
    fun anExpiredSessionWhileAcceptingGoesThroughTheRelay() {
        json(401, """{"code":"SESION_INVALIDA"}""")

        assertThrows(SessionExpiredException::class.java) { runBlocking { api("tok-7").aceptarConsentimientoCartolas() } }
        assertEquals(listOf("tok-7"), expired)
    }

    @Test
    fun aRejectedKeyWhileAcceptingIsNotASessionExpiry() {
        json(401, """{"code":"API_KEY_INVALIDA"}""")

        assertThrows(ApiKeyRejectedException::class.java) { runBlocking { api().aceptarConsentimientoCartolas() } }
        assertEquals(emptyList<String>(), expired)
    }
}
