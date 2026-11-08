package app.mirachbudget.android.core.networking

import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

/**
 * The bucket-detail, reclassification, category and pattern calls of [GeneratedMirachApi] against a
 * fake server: what each sends, what it maps, and the errors the screens tell apart.
 */
class DetalleCategoriasApiTest {
    private val server = MockWebServer()
    private val expired = mutableListOf<String>()

    @Before
    fun setUp() = server.start()

    @After
    fun tearDown() = server.close()

    private fun api(): MirachApi = MirachApiFactory.create(
        baseUrl = server.url("/").toString(),
        apiKey = "key-1",
        tokenProvider = { "tok-sent" },
        onSessionExpired = { expired += it },
        timeoutMillis = 500,
    )

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    private fun empty(code: Int) = server.enqueue(MockResponse.Builder().code(code).build())

    private fun request() = checkNotNull(server.takeRequest(5, TimeUnit.SECONDS)) { "no request" }

    private fun sentJson(): JsonElement = Json.parseToJsonElement(request().body!!.utf8())

    private fun error(code: String, message: String = "msg", extra: String = "") =
        """{"code":"$code","message":"$message"$extra}"""

    private val existenteJson = """{"patronId":"p-9","categoriaId":"c-9","categoria":"Ocio","bucket":"Deseos"}"""
    private val existente = PatronExistente(patronId = "p-9", categoriaId = "c-9", categoria = "Ocio", bucket = Bucket.Deseos)

    private fun category(id: String = "c-1", extra: String = "") =
        """{"id":"$id","nombre":"Ropa","bucket":"Deseos","icono":"shirt","esInterna":false,"transaccionesCount":12,""" +
            """"patrones":[{"id":"p-1","categoriaId":"$id","patron":"zara","matchType":"CONTAINS","prioridad":0}]$extra}"""

    // --- GET /api/buckets/{bucket}/detalle

    @Test
    fun bucketDetailAsksForTheMonthAndMapsGroupsAndMovements() = runBlocking<Unit> {
        json(
            200,
            """{"bucket":"Necesidades","periodo":"2026-09","fechaInicio":"2026-09-01","fechaFin":"2026-09-30",""" +
                """"fuenteIngreso":"detectado","total":"52300","porcentajeBp":2150,"metaBp":5000,"totalTransacciones":2,""" +
                """"totalCategorias":2,"grupos":[{"categoriaId":"c-s","nombre":"Supermercado","icono":"shopping-cart",""" +
                """"subtotal":"32400","conteo":1,"transacciones":[{"id":"t-1","fecha":"2026-09-14T00:00:00.000Z",""" +
                """"descripcion":"JUMBO","origen":"Banco de Chile","monto":"32400"}]},{"categoriaId":null,"nombre":"Sin categoría",""" +
                """"subtotal":"19900","conteo":1,"transacciones":[{"id":"t-2","fecha":"2026-09-20T00:00:00.000Z",""" +
                """"descripcion":"PAGO","origen":"BCI","monto":"19900"}]}]}""",
        )

        val detalle = api().bucketDetalle(Bucket.Necesidades, Periodo(2026, 9))

        val r = request()
        assertEquals("GET", r.method)
        assertEquals("/api/buckets/Necesidades/detalle", r.url.encodedPath)
        assertEquals("2026-09", r.url.queryParameter("periodo"))
        assertEquals("Bearer tok-sent", r.headers["Authorization"])
        assertEquals(
            BucketDetalle(
                bucket = Bucket.Necesidades,
                periodo = Periodo(2026, 9),
                total = 52_300,
                porcentajeBp = 2150,
                metaBp = 5000,
                totalTransacciones = 2,
                totalCategorias = 2,
                grupos = listOf(
                    GrupoCategoria(
                        categoriaId = "c-s", nombre = "Supermercado", icono = "shopping-cart", subtotal = 32_400, conteo = 1,
                        transacciones = listOf(
                            MovimientoBucket("t-1", Instant.parse("2026-09-14T00:00:00Z"), "JUMBO", "Banco de Chile", 32_400),
                        ),
                    ),
                    GrupoCategoria(
                        categoriaId = null, nombre = "Sin categoría", icono = null, subtotal = 19_900, conteo = 1,
                        transacciones = listOf(MovimientoBucket("t-2", Instant.parse("2026-09-20T00:00:00Z"), "PAGO", "BCI", 19_900)),
                    ),
                ),
            ),
            detalle,
        )
    }

    @Test
    fun anExpiredSessionOnTheBucketDetailIsReportedOnce() = runBlocking<Unit> {
        json(401, error("SESION_INVALIDA"))

        assertThrows(SessionExpiredException::class.java) { runBlocking { api().bucketDetalle(Bucket.Ahorro, Periodo(2026, 9)) } }
        assertEquals(listOf("tok-sent"), expired)
    }

    // --- PATCH /api/transacciones/{id}/categoria

    @Test
    fun reclassifyingSendsOnlyTheCategoryAndReadsTheAnswer() = runBlocking<Unit> {
        json(200, """{"id":"t-1","categoria":{"id":"c-r","nombre":"Ropa"},"bucket":"Deseos","movidos":0}""")

        val result = api().reclasificar("t-1", "c-r")

        val r = request()
        assertEquals("PATCH", r.method)
        assertEquals("/api/transacciones/t-1/categoria", r.url.encodedPath)
        assertEquals(Json.parseToJsonElement("""{"categoriaId":"c-r"}"""), Json.parseToJsonElement(r.body!!.utf8()))
        assertEquals(Reclasificacion(categoriaId = "c-r", categoriaNombre = "Ropa", bucket = Bucket.Deseos, movidos = 0), result)
    }

    @Test
    fun applyingToSimilarSendsThePeriodAndReadsHowManyMoved() = runBlocking<Unit> {
        json(200, """{"id":"t-1","categoria":{"id":"c","nombre":"Ropa"},"bucket":"Deseos","movidos":2}""")

        val result = api().reclasificar("t-1", "c", aplicarAParecidos = Periodo(2026, 9))

        assertEquals(Json.parseToJsonElement("""{"categoriaId":"c","aplicarAParecidos":{"periodo":"2026-09"}}"""), sentJson())
        assertEquals(2, result.movidos)
    }

    @Test
    fun aMovementIdWithSpecialCharactersIsEscapedInThePath() = runBlocking<Unit> {
        json(200, """{"id":"a/b","categoria":{"id":"c","nombre":"C"},"bucket":"Ahorro","movidos":0}""")

        api().reclasificar("a/b", "c")

        assertEquals("/api/transacciones/a%2Fb/categoria", request().url.encodedPath)
    }

    @Test
    fun aReclassificationTellsAMissingCategoryFromAMissingMovement() = runBlocking<Unit> {
        json(400, """{"message":"x"}""")
        json(404, error("TRANSACCION_NO_ENCONTRADA"))

        assertThrows(ReclasificarException.CategoryNotFound::class.java) { runBlocking { api().reclasificar("t-1", "c") } }
        assertThrows(ReclasificarException.MovementNotFound::class.java) { runBlocking { api().reclasificar("t-1", "c") } }
    }

    // --- GET /api/transacciones/{id}/parecidos

    @Test
    fun similarMovementsAskWithTheCategoryAndMonthAndMapTheSuggestion() = runBlocking<Unit> {
        json(200, """{"patron":"netflix","total":2,"existente":$existenteJson}""")

        val result = api().parecidos("t-1", "c-1", Periodo(2026, 9))

        val r = request()
        assertEquals("GET", r.method)
        assertEquals("/api/transacciones/t-1/parecidos", r.url.encodedPath)
        assertEquals("c-1", r.url.queryParameter("categoriaId"))
        assertEquals("2026-09", r.url.queryParameter("periodo"))
        assertEquals(Parecidos(patron = "netflix", total = 2, existente = existente), result)
    }

    @Test
    fun noSuggestionIsANullText() = runBlocking<Unit> {
        json(200, """{"patron":null,"total":0,"existente":null}""")

        assertEquals(Parecidos.Ninguno, api().parecidos("t-1", "c-1", Periodo(2026, 9)))
    }

    @Test
    fun similarMovementsTellAMissingMovementFromAMissingCategory() = runBlocking<Unit> {
        json(404, error("TRANSACCION_NO_ENCONTRADA"))
        json(404, error("CATEGORIA_NO_ENCONTRADA"))

        assertThrows(ReclasificarException.MovementNotFound::class.java) {
            runBlocking { api().parecidos("t-1", "c", Periodo(2026, 9)) }
        }
        assertThrows(ReclasificarException.CategoryNotFound::class.java) {
            runBlocking { api().parecidos("t-1", "c", Periodo(2026, 9)) }
        }
    }

    // --- GET /api/categorias (what the categories screens read)

    @Test
    fun theCatalogCarriesCountsPatternsAndWhetherACategoryIsInternal() = runBlocking<Unit> {
        json(200, """{"categorias":[${category()}]}""")

        val categoria = api().categorias().categorias.single()

        assertEquals(
            CategoriaCatalogo(
                id = "c-1", nombre = "Ropa", bucket = Bucket.Deseos, icono = "shirt", transaccionesCount = 12, esInterna = false,
                patrones = listOf(PatronCategoria(id = "p-1", patron = "zara", matchType = "CONTAINS")),
            ),
            categoria,
        )
    }

    // --- PATCH and DELETE /api/categorias/{id}

    @Test
    fun updatingACategorySendsOnlyWhatChanged() = runBlocking<Unit> {
        json(200, category())

        val updated = api().actualizarCategoria("c-1", CategoriaCambios(bucket = Bucket.Necesidades))

        val r = request()
        assertEquals("PATCH", r.method)
        assertEquals("/api/categorias/c-1", r.url.encodedPath)
        assertEquals(Json.parseToJsonElement("""{"bucket":"Necesidades"}"""), Json.parseToJsonElement(r.body!!.utf8()))
        assertEquals("c-1", updated.id)
    }

    @Test
    fun updatingACategoryMapsItsRejections() = runBlocking<Unit> {
        json(409, error("NOMBRE_DUPLICADO"))
        json(404, error("CATEGORIA_NO_ENCONTRADA"))
        json(403, error("CATEGORIA_INTERNA"))

        assertThrows(CategoriaException.DuplicateName::class.java) {
            runBlocking { api().actualizarCategoria("c-1", CategoriaCambios(nombre = "Ocio")) }
        }
        assertThrows(CategoriaException.NotFound::class.java) {
            runBlocking { api().actualizarCategoria("c-1", CategoriaCambios(nombre = "Ocio")) }
        }
        assertThrows(CategoriaException.IsInternal::class.java) {
            runBlocking { api().actualizarCategoria("c-1", CategoriaCambios(nombre = "Ocio")) }
        }
    }

    @Test
    fun deletingACategoryMapsMissingAndInternal() = runBlocking<Unit> {
        empty(204)
        json(404, error("CATEGORIA_NO_ENCONTRADA"))
        json(403, error("CATEGORIA_INTERNA"))

        api().eliminarCategoria("c-1")
        val r = request()
        assertEquals("DELETE", r.method)
        assertEquals("/api/categorias/c-1", r.url.encodedPath)
        assertThrows(CategoriaException.NotFound::class.java) { runBlocking { api().eliminarCategoria("c-1") } }
        assertThrows(CategoriaException.IsInternal::class.java) { runBlocking { api().eliminarCategoria("c-1") } }
    }

    // --- POST /api/patrones

    @Test
    fun creatingAPatternIsAlwaysContainsAndSendsNoPeriodUnlessAsked() = runBlocking<Unit> {
        json(201, """{"id":"p-7","categoriaId":"c-1","patron":"UBER","matchType":"CONTAINS","prioridad":0,"movidos":0}""")

        val created = api().crearPatron("c-1", "UBER", moverDelPeriodo = null)

        val r = request()
        assertEquals("POST", r.method)
        assertEquals("/api/patrones", r.url.encodedPath)
        assertEquals(
            Json.parseToJsonElement("""{"categoriaId":"c-1","matchType":"CONTAINS","patron":"UBER"}"""),
            Json.parseToJsonElement(r.body!!.utf8()),
        )
        assertEquals(PatronCreado(PatronCategoria("p-7", "UBER", "CONTAINS"), movidos = 0), created)
    }

    @Test
    fun creatingAPatternToMoveTheMonthSendsThePeriodAndReadsTheMovedCount() = runBlocking<Unit> {
        json(201, """{"id":"p-7","categoriaId":"c-1","patron":"acuenta","matchType":"CONTAINS","prioridad":0,"movidos":3}""")

        val created = api().crearPatron("c-1", "acuenta", moverDelPeriodo = Periodo(2026, 9))

        assertEquals(
            Json.parseToJsonElement("""{"categoriaId":"c-1","matchType":"CONTAINS","patron":"acuenta","moverDelPeriodo":"2026-09"}"""),
            sentJson(),
        )
        assertEquals(3, created.movidos)
    }

    @Test
    fun aDuplicatePatternNamesTheCategoryThatHoldsIt() = runBlocking<Unit> {
        json(409, error("PATRON_DUPLICADO", extra = ""","existente":$existenteJson"""))
        json(409, error("PATRON_DUPLICADO"))

        val named = assertThrows(PatronException.DuplicateOf::class.java) {
            runBlocking { api().crearPatron("c-1", "netflix", null) }
        }
        assertEquals(existente, named.existente)
        assertThrows(PatronException.Duplicate::class.java) { runBlocking { api().crearPatron("c-1", "netflix", null) } }
    }

    @Test
    fun aPatternOnTheInternalCategoryKeepsTheServerMessage() = runBlocking<Unit> {
        json(403, error("CATEGORIA_INTERNA", message = "Desconocido no admite patrones"))

        val rejected = assertThrows(PatronException.Rejected::class.java) { runBlocking { api().crearPatron("c-1", "x", null) } }
        assertEquals("Desconocido no admite patrones", rejected.serverMessage)
    }

    // --- POST /api/patrones/vista-previa

    @Test
    fun thePreviewSendsNoPeriodAndMapsTheMonthAndItsMatches() = runBlocking<Unit> {
        json(
            200,
            """{"periodo":"2026-09","patron":"acuenta","total":1,"coincidencias":[{"id":"t-4","descripcion":"ACUENTA MAIPU",""" +
                """"fecha":"2026-09-03T00:00:00.000Z","monto":"32400"}],"existente":null}""",
        )

        val preview = api().vistaPreviaPatron("c-1", "acuenta")

        val r = request()
        assertEquals("POST", r.method)
        assertEquals("/api/patrones/vista-previa", r.url.encodedPath)
        assertEquals(Json.parseToJsonElement("""{"categoriaId":"c-1","patron":"acuenta"}"""), Json.parseToJsonElement(r.body!!.utf8()))
        assertEquals(
            VistaPreviaPatron(
                periodo = Periodo(2026, 9),
                patron = "acuenta",
                total = 1,
                coincidencias = listOf(CoincidenciaPatron("t-4", "ACUENTA MAIPU", Instant.parse("2026-09-03T00:00:00Z"), 32_400)),
                existente = null,
            ),
            preview,
        )
    }

    @Test
    fun thePreviewNamesATextThatLivesInAnotherCategory() = runBlocking<Unit> {
        json(200, """{"periodo":"2026-09","patron":"netflix","total":0,"coincidencias":[],"existente":$existenteJson}""")

        assertEquals(existente, api().vistaPreviaPatron("c-1", "netflix").existente)
    }

    // --- PATCH and DELETE /api/patrones/{id}

    @Test
    fun editingAPatternSendsOnlyItsText() = runBlocking<Unit> {
        json(200, """{"id":"p-1","categoriaId":"c-1","patron":"zara home","matchType":"STARTS_WITH","prioridad":0}""")

        val updated = api().actualizarPatron("p-1", PatronCambios(patron = "zara home"))

        val r = request()
        assertEquals("PATCH", r.method)
        assertEquals("/api/patrones/p-1", r.url.encodedPath)
        assertEquals(Json.parseToJsonElement("""{"patron":"zara home"}"""), Json.parseToJsonElement(r.body!!.utf8()))
        assertEquals(PatronCategoria("p-1", "zara home", "STARTS_WITH"), updated)
    }

    @Test
    fun movingAPatternSendsOnlyTheNewCategory() = runBlocking<Unit> {
        json(200, """{"id":"p-9","categoriaId":"c-1","patron":"netflix","matchType":"CONTAINS","prioridad":0}""")

        api().actualizarPatron("p-9", PatronCambios(categoriaId = "c-1"))

        assertEquals(Json.parseToJsonElement("""{"categoriaId":"c-1"}"""), sentJson())
    }

    @Test
    fun deletingAPatternMapsAMissingOne() = runBlocking<Unit> {
        empty(204)
        json(404, error("PATRON_NO_ENCONTRADO"))

        api().eliminarPatron("p-1")
        val r = request()
        assertEquals("DELETE", r.method)
        assertEquals("/api/patrones/p-1", r.url.encodedPath)
        assertThrows(PatronException.PatternNotFound::class.java) { runBlocking { api().eliminarPatron("p-1") } }
    }

    @Test
    fun aPatternRejectionWithAnUnknownCodeKeepsTheServerMessage() = runBlocking<Unit> {
        json(400, error("OTRO", message = "Otra cosa"))

        val rejected = assertThrows(PatronException.Rejected::class.java) {
            runBlocking { api().actualizarPatron("p-1", PatronCambios(patron = "x")) }
        }
        assertEquals("Otra cosa", rejected.serverMessage)
        assertNull(expired.firstOrNull())
    }
}
