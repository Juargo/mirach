package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CartolaEdit
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.CategoriaException
import app.mirachbudget.android.core.networking.IngestaException
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.catalogo
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.commitResult
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.fondo
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.preview
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.restaurantes
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.row
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.sugerencia
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.supermercado
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CatalogState
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CategoryFormErrors
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.PreviewRefresh
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.Step
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SubirCartolaReviewTest : SubirCartolaTestBase() {
    private val nueva = NuevaCategoria(nombre = "Farmacia", bucket = Bucket.Necesidades, patron = "MOVIMIENTO", icono = null)
    private val farmacia = CategoriaCatalogo("cat-farmacia", "Farmacia", Bucket.Necesidades, null)

    @Test
    fun `the review needs the catalog`() = runTest {
        api.onCategorias = { throw IOException("offline") }
        val vm = deciding()

        vm.startReview()

        assertEquals(Step.Decidiendo(preview()), vm.state.value.step)
    }

    @Test
    fun `choosing a category records an edit for that row only`() = runTest {
        val vm = reviewing()

        vm.choose("cat-resto", 0)

        assertEquals(mapOf(0 to "cat-resto"), vm.state.value.edits)
        assertNull(vm.state.value.reviewNotice)
    }

    @Test
    fun `choosing the server suggestion undoes the edit`() = runTest {
        val vm = reviewing()
        vm.choose("cat-resto", 0)

        vm.choose("cat-super", 0)

        assertEquals(emptyMap<Int, String>(), vm.state.value.edits)
    }

    @Test
    fun `duplicates, incomes and unknown categories cannot be chosen`() = runTest {
        val vm = reviewing()

        vm.choose("cat-resto", 3)
        vm.choose("cat-resto", 4)
        vm.choose("cat-gone", 0)
        vm.choose("cat-resto", 99)

        assertEquals(emptyMap<Int, String>(), vm.state.value.edits)
    }

    @Test
    fun `confirming commits only the touched rows, in row order`() = runTest {
        api.onCommitIngesta = { _, _, _ -> commitResult }
        val vm = reviewing()
        vm.choose("cat-fondo", 2)
        vm.choose("cat-resto", 0)
        assertEquals("Confirmar (2 cambios)", SubirCartolaMessages.confirmTitle(vm.state.value.edits.size))

        vm.confirm()

        assertEquals(listOf(CartolaEdit(0, "cat-resto"), CartolaEdit(2, "cat-fondo")), api.commitCalls.single().third)
        assertEquals(1, vm.state.value.importsCompleted)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertEquals("Confirmar", SubirCartolaMessages.confirmTitle(0))
        assertEquals("Confirmar (1 cambio)", SubirCartolaMessages.confirmTitle(1))
    }

    @Test
    fun `an edit that would not fit in one import is refused with a notice`() = runTest {
        // Each edit carries a 4 KB id: about 64 of them fill the 256 KB the server takes.
        val long = CategoriaCatalogo("x".repeat(4096), "Larga", Bucket.Deseos, null)
        api.onCategorias = { CatalogoCategorias(catalogo.categorias + long) }
        val rows = (0 until 80).map { row(it) }
        val vm = reviewing(preview(rows))

        rows.forEach { vm.choose(long.id, it.rowIndex) }

        val edits = vm.state.value.edits
        assertEquals(
            "No caben más cambios en una sola importación. Confirma los que ya hiciste o deshaz alguno.",
            vm.state.value.reviewNotice,
        )
        val accepted = edits.keys.sorted()
        assertEquals((0 until accepted.size).toList(), accepted)
        val bytes = app.mirachbudget.android.core.networking.IngestaMapper
            .editsJson(accepted.map { CartolaEdit(it, long.id) }).toByteArray(Charsets.UTF_8).size
        assertEquals(true, bytes <= SubirCartolaViewModel.MAX_EDITS_JSON_BYTES)
        assertEquals(true, accepted.size < rows.size)

        // Undoing one makes room again and clears the notice.
        vm.choose("cat-super", accepted.last())
        assertNull(vm.state.value.reviewNotice)
    }

    // --- create a category from a row

    @Test
    fun `creating a category applies it to the row, reloads the catalog, previews again and counts new matches`() =
        runTest {
            val before = preview()
            // After the new pattern: rows 1 and 2 now match Farmacia; row 0 is the one it was created from.
            val after = preview(
                listOf(
                    row(0, sugerido = sugerencia(Bucket.Necesidades, farmacia.id)),
                    row(1, sugerido = sugerencia(Bucket.Necesidades, farmacia.id)),
                    row(2, sugerido = sugerencia(Bucket.Necesidades, farmacia.id)),
                    before.filas[3],
                    // A duplicate the pattern now matches is not imported: not counted.
                    before.filas[4].copy(sugerido = sugerencia(Bucket.Necesidades, farmacia.id)),
                ),
            )
            api.onPreviewIngesta = { _, password -> if (password == null) throw IngestaException.PasswordRequired() else before }
            api.onCrearCategoria = { farmacia }
            val vm = started()
            vm.chooseFile(FakeSource("cartola.pdf"))
            vm.submitPassword("1234")
            vm.startReview()
            api.onPreviewIngesta = { _, _ -> after }
            api.onCategorias = { CatalogoCategorias(catalogo.categorias + farmacia) }

            vm.createCategory(nueva, 0)

            val state = vm.state.value
            assertEquals(listOf(nueva), api.crearCategoriaCalls)
            assertEquals(mapOf(0 to farmacia.id), state.edits)
            assertEquals(1, state.createdCategoryCount)
            assertEquals(2, api.categoriasCalls)
            assertEquals(CatalogState.Loaded(CatalogoCategorias(catalogo.categorias + farmacia)), state.catalog)
            assertEquals(listOf(null, "1234", "1234"), api.previewCalls.map { it.second })
            assertEquals(1, api.previewCalls.map { it.first }.distinct().size)
            assertEquals(Step.Revisando(after), state.step)
            assertEquals(PreviewRefresh.Idle, state.previewRefresh)
            assertEquals("«Farmacia» se aplicó a 2 filas más", state.reviewInfo)
            assertEquals(false, state.isCreatingCategory)
        }

    @Test
    fun `a new category that matches nothing else is only announced as created`() = runTest {
        api.onCrearCategoria = { farmacia }
        val vm = reviewing()
        api.onCategorias = { CatalogoCategorias(catalogo.categorias + farmacia) }

        vm.createCategory(nueva, 0)

        assertEquals("Categoría «Farmacia» creada.", vm.state.value.reviewInfo)
        assertEquals("«Farmacia» se aplicó a 1 fila más", SubirCartolaMessages.applied("Farmacia", 1))
    }

    @Test
    fun `a stale catalog read still offers the category just created`() = runTest {
        api.onCrearCategoria = { farmacia }
        val vm = reviewing()

        vm.createCategory(nueva, 0)

        assertEquals(CatalogState.Loaded(CatalogoCategorias(catalogo.categorias + farmacia)), vm.state.value.catalog)
    }

    @Test
    fun `a failed refresh keeps the category and the edits and can be retried`() = runTest {
        api.onCrearCategoria = { farmacia }
        val vm = reviewing()
        api.onPreviewIngesta = { _, _ -> throw IOException("offline") }

        vm.createCategory(nueva, 0)

        assertEquals(PreviewRefresh.Failed("Farmacia"), vm.state.value.previewRefresh)
        assertEquals(mapOf(0 to farmacia.id), vm.state.value.edits)
        assertEquals(
            "«Farmacia» se creó, pero no pudimos actualizar la vista previa. Tus cambios siguen aquí.",
            SubirCartolaMessages.refreshFailed("Farmacia"),
        )
        // While it is not refreshed, nothing can be chosen or confirmed... but retry works.
        api.onPreviewIngesta = { _, _ -> preview() }

        vm.retryPreviewRefresh()

        assertEquals(PreviewRefresh.Idle, vm.state.value.previewRefresh)
        assertEquals("Categoría «Farmacia» creada.", vm.state.value.reviewInfo)
        assertEquals(1, api.crearCategoriaCalls.size)
    }

    @Test
    fun `category errors land on their form field`() = runTest {
        val cases = listOf(
            CategoriaException.InvalidName() to CategoryFormErrors(name = "El nombre debe tener entre 1 y 40 caracteres"),
            CategoriaException.BucketNotAssignable() to
                CategoryFormErrors(bucket = "Elige un grupo: Necesidades, Gustos o Ahorro"),
            CategoriaException.InvalidIcon() to CategoryFormErrors(general = "Elige un ícono válido de la lista"),
            CategoriaException.InvalidPattern(0) to
                CategoryFormErrors(pattern = "Escribe un texto válido para el patrón (de 1 a 200 caracteres)"),
            CategoriaException.InvalidMatchType(0) to CategoryFormErrors(pattern = "Ese tipo de coincidencia no es válido"),
            CategoriaException.InvalidRegex(0) to CategoryFormErrors(pattern = "Esa expresión regular no es válida"),
            CategoriaException.DuplicateName() to CategoryFormErrors(name = "Ya tienes una categoría con ese nombre"),
            CategoriaException.DuplicatePattern(0) to CategoryFormErrors(pattern = "Ya tienes un patrón con ese texto"),
            CategoriaException.Rejected("Algo raro") to CategoryFormErrors(general = "Algo raro"),
            IOException("offline") to
                CategoryFormErrors(general = "No pudimos crear la categoría. Revisa tu conexión e inténtalo de nuevo."),
            IllegalStateException("boom") to CategoryFormErrors(general = "No pudimos crear la categoría. Inténtalo de nuevo."),
        )
        val vm = reviewing()
        for ((error, expected) in cases) {
            api.onCrearCategoria = { throw error }

            vm.createCategory(nueva, 0)

            assertEquals("$error", expected, vm.state.value.categoryFormErrors)
            assertEquals(false, vm.state.value.isCreatingCategory)
        }
        assertEquals(0, vm.state.value.createdCategoryCount)
        assertEquals(emptyMap<Int, String>(), vm.state.value.edits)

        vm.resetCategoryForm()
        assertEquals(true, vm.state.value.categoryFormErrors.isEmpty)
    }

    @Test
    fun `a category cannot be created from a row that is not editable`() = runTest {
        val vm = reviewing()

        vm.createCategory(nueva, 4)
        vm.createCategory(nueva, 3)

        assertEquals(emptyList<NuevaCategoria>(), api.crearCategoriaCalls)
    }

    // --- 400 after edits (catalog drift)

    @Test
    fun `a rejected commit with edits reloads the catalog, drops gone categories and returns to the review once`() =
        runTest {
            var commits = 0
            api.onCommitIngesta = { _, _, _ ->
                commits++
                throw IngestaException.Rejected("Categoría inválida")
            }
            val vm = reviewing()
            vm.choose("cat-resto", 0)
            vm.choose("cat-fondo", 2)
            // Restaurantes was deleted elsewhere.
            api.onCategorias = { CatalogoCategorias(listOf(supermercado, fondo)) }

            vm.confirm()

            assertEquals(Step.Revisando(preview()), vm.state.value.step)
            assertEquals(mapOf(2 to "cat-fondo"), vm.state.value.edits)
            assertEquals(
                "No pudimos aplicar tus cambios. Revisa la clasificación e inténtalo de nuevo.",
                vm.state.value.reviewNotice,
            )
            assertEquals(1, stagedCopies().size)

            // A second rejection is not about the edits, even if the catalog drifted again: the
            // server's message, back to the start, with no second catalog reload.
            api.onCategorias = { CatalogoCategorias(listOf(supermercado)) }
            val catalogReads = api.categoriasCalls
            vm.confirm()

            assertEquals(catalogReads, api.categoriasCalls)

            assertEquals(Step.Inicial("Categoría inválida"), vm.state.value.step)
            assertEquals(2, commits)
            assertEquals(emptyList<Any>(), stagedCopies())
        }

    @Test
    fun `a rejected commit whose edits are all still valid is about the file`() = runTest {
        api.onCommitIngesta = { _, _, _ -> throw IngestaException.Rejected(null) }
        val vm = reviewing()
        vm.choose("cat-resto", 0)

        vm.confirm()

        assertEquals(
            Step.Inicial("No pudimos leer la cartola. Revisa que sea una cartola válida."),
            vm.state.value.step,
        )
        assertEquals(emptyList<Any>(), stagedCopies())
    }

    @Test
    fun `a catalog changed elsewhere drops the edits whose category is gone`() = runTest {
        val vm = reviewing()
        vm.choose(restaurantes.id, 0)
        vm.choose(fondo.id, 2)
        api.onCategorias = { CatalogoCategorias(listOf(supermercado, fondo)) }

        vm.catalogDidChange()

        assertEquals(mapOf(2 to fondo.id), vm.state.value.edits)
        assertEquals(
            "Algunas categorías que elegiste ya no existen. Esas filas volvieron a su sugerencia.",
            vm.state.value.reviewNotice,
        )
    }
}
