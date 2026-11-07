package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.CategoriaException
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.categorias.CategoriasSamples.catalogo
import app.mirachbudget.android.features.categorias.CategoriasViewModel.Content
import app.mirachbudget.android.features.categorias.CategoriasViewModel.Failure
import app.mirachbudget.android.testing.FakeMirachApi
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CategoriasViewModelTest {
    private val api = FakeMirachApi()
    private var changes = 0
    private val created = CategoriaCatalogo(id = "cat-new", nombre = "Mascotas", bucket = Bucket.Deseos, icono = "paw-print")
    private val form = NuevaCategoria(nombre = "Mascotas", bucket = Bucket.Deseos, patron = null, icono = "paw-print")

    private fun viewModel() = CategoriasViewModel(api, onChange = { changes++ })

    /** Each catalog call takes the next answer; the last one repeats. */
    private fun answers(vararg results: suspend () -> CatalogoCategorias) {
        var index = 0
        api.onCategorias = { results[minOf(index++, results.lastIndex)]() }
    }

    private suspend fun loaded(): CategoriasViewModel {
        answers({ catalogo })
        val vm = viewModel()
        vm.load()
        assertEquals(Content.Loaded(catalogo), vm.state.value.content)
        return vm
    }

    private fun CategoriasViewModel.catalog(): CatalogoCategorias = (state.value.content as Content.Loaded).catalog

    // --- loading

    @Test
    fun startsLoadingThenShowsTheCatalog() = runTest {
        answers({ catalogo })
        val vm = viewModel()
        assertEquals(Content.Loading, vm.state.value.content)

        vm.load()

        assertEquals(Content.Loaded(catalogo), vm.state.value.content)
        assertEquals(1, api.categoriasCalls)
    }

    @Test
    fun anEmptyCatalogIsALoadedOneSoTheThreeGroupsStillAppear() = runTest {
        answers({ CatalogoCategorias(emptyList()) })
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Loaded(CatalogoCategorias(emptyList())), vm.state.value.content)
    }

    @Test
    fun aNetworkErrorIsAConnectionFailureAndRetryAsksAgain() = runTest {
        answers({ throw IOException("offline") }, { catalogo })
        val vm = viewModel()

        vm.load()
        assertEquals(Content.Failed(Failure.Connection), vm.state.value.content)

        vm.retry()
        assertEquals(Content.Loaded(catalogo), vm.state.value.content)
        assertEquals(2, api.categoriasCalls)
    }

    @Test
    fun aServerProblemIsAServerFailure() = runTest {
        answers({ throw ApiException(500) })
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Failed(Failure.Server), vm.state.value.content)
    }

    @Test
    fun anExpiredSessionShowsNoError() = runTest {
        answers({ throw SessionExpiredException() })
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Loading, vm.state.value.content)
    }

    @Test
    fun aLoadCancelledBeforeItFinishedRunsAgainOnTheNextAppearance() = runTest {
        answers({ throw CancellationException("left") }, { catalogo })
        val vm = viewModel()

        runCatching { vm.loadIfNeeded() }
        vm.loadIfNeeded()
        vm.loadIfNeeded()

        assertEquals(Content.Loaded(catalogo), vm.state.value.content)
        assertEquals(2, api.categoriasCalls)
    }

    @Test
    fun aLateAnswerFromAnOlderRequestDoesNotOverwriteTheNewerOne() = runTest {
        val slow = CompletableDeferred<CatalogoCategorias>()
        val newer = CatalogoCategorias(listOf(created))
        answers({ slow.await() }, { newer })
        val vm = viewModel()

        val first = launch { vm.load() }
        runCurrent()
        vm.load()
        slow.complete(catalogo)
        first.join()

        assertEquals(Content.Loaded(newer), vm.state.value.content)
    }

    @Test
    fun aFailedRefreshKeepsTheListAndSaysSoUntilTheNextSuccess() = runTest {
        val vm = loaded()
        answers({ throw IOException("offline") }, { catalogo })

        vm.refresh()
        assertEquals(Content.Loaded(catalogo), vm.state.value.content)
        assertEquals("No se pudo actualizar la lista.", vm.state.value.refreshNotice)
        assertFalse(vm.state.value.isRefreshing)

        vm.refresh()
        assertNull(vm.state.value.refreshNotice)
    }

    @Test
    fun aChangeMadeElsewhereRereadsTheCatalogAndAFailureSaysTheChangeDidApply() = runTest {
        val vm = loaded()
        val after = CatalogoCategorias(listOf(created))
        answers({ after }, { throw IOException("offline") })

        vm.catalogDidChange()
        assertEquals(Content.Loaded(after), vm.state.value.content)

        vm.catalogDidChange()
        assertEquals(Content.Loaded(after), vm.state.value.content)
        assertEquals(
            "El cambio se aplicó, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar.",
            vm.state.value.refreshNotice,
        )
    }

    // --- creating

    @Test
    fun creatingSendsTheFormAsIsAndTheCategoryJoinsItsGroupInNameOrder() = runTest {
        val vm = loaded()
        api.onCrearCategoria = { created }

        vm.create(form)

        assertEquals(listOf(form), api.crearCategoriaCalls)
        assertEquals(listOf("Desconocido", "Mascotas", "Restaurantes", "Vacía"), vm.catalog().deBucket(Bucket.Deseos).map { it.nombre })
        assertEquals("Categoría «Mascotas» creada", vm.state.value.announcement)
        assertEquals(1, vm.state.value.createdCount)
        assertTrue(vm.state.value.formErrors.isEmpty)
        assertFalse(vm.state.value.isCreating)
        assertEquals("the other screens are told once", 1, changes)
    }

    @Test
    fun whileCreatingASecondSubmitIsIgnored() = runTest {
        val vm = loaded()
        val gate = CompletableDeferred<CategoriaCatalogo>()
        api.onCrearCategoria = { gate.await() }

        val first = launch { vm.create(form) }
        runCurrent()
        assertTrue(vm.state.value.isCreating)
        vm.create(form)
        gate.complete(created)
        first.join()

        assertEquals(1, api.crearCategoriaCalls.size)
        assertFalse(vm.state.value.isCreating)
    }

    @Test
    fun eachRejectionLandsOnItsFieldAndTheFormStaysOpen() = runTest {
        val cases = listOf(
            CategoriaException.InvalidName() to "El nombre debe tener entre 1 y 40 caracteres",
            CategoriaException.DuplicateName() to "Ya tienes una categoría con ese nombre",
            CategoriaException.BucketNotAssignable() to "Elige un grupo: Necesidades, Gustos o Ahorro",
            CategoriaException.InvalidIcon() to "Elige un ícono válido de la lista",
            CategoriaException.Rejected("Otra cosa") to "Otra cosa",
        )
        for ((error, text) in cases) {
            val vm = loaded()
            api.onCrearCategoria = { throw error }

            vm.create(form)

            val errors = vm.state.value.formErrors
            assertEquals(text, errors.name ?: errors.bucket ?: errors.general)
            assertEquals("the form must not close", 0, vm.state.value.createdCount)
            assertNull(vm.state.value.announcement)
            assertEquals(Content.Loaded(catalogo), vm.state.value.content)
        }
        assertEquals(0, changes)
    }

    @Test
    fun aConnectionFailureWhileCreatingKeepsTheFormWithAGeneralMessage() = runTest {
        val vm = loaded()
        api.onCrearCategoria = { throw IOException("offline") }

        vm.create(form)

        assertEquals("No pudimos crear la categoría. Revisa tu conexión e inténtalo de nuevo.", vm.state.value.formErrors.general)
        assertFalse(vm.state.value.isCreating)
    }

    @Test
    fun anExpiredSessionWhileCreatingShowsNoFormError() = runTest {
        val vm = loaded()
        api.onCrearCategoria = { throw SessionExpiredException() }

        vm.create(form)

        assertTrue(vm.state.value.formErrors.isEmpty)
        assertFalse(vm.state.value.isCreating)
    }

    @Test
    fun openingTheFormAgainClearsTheErrorsOfTheLastAttempt() = runTest {
        val vm = loaded()
        api.onCrearCategoria = { throw CategoriaException.DuplicateName() }
        vm.create(form)
        assertFalse(vm.state.value.formErrors.isEmpty)

        vm.resetForm()

        assertTrue(vm.state.value.formErrors.isEmpty)
    }

    @Test
    fun aRefreshThatStartedBeforeTheCreationCannotTakeTheNewCategoryAway() = runTest {
        val vm = loaded()
        val stale = CompletableDeferred<CatalogoCategorias>()
        answers({ stale.await() })
        api.onCrearCategoria = { created }

        val refresh = launch { vm.refresh() }
        runCurrent()
        vm.create(form)
        stale.complete(catalogo)
        refresh.join()

        assertTrue(vm.catalog().categorias.any { it.id == "cat-new" })
    }

    @Test
    fun creatingIsIgnoredWhileTheCatalogIsNotLoaded() = runTest {
        val vm = viewModel()

        vm.create(form)

        assertTrue(api.crearCategoriaCalls.isEmpty())
    }

    // --- announcements

    @Test
    fun aPullToRefreshDropsTheAnnouncementButTheRereadAfterTheWriteKeepsIt() = runTest {
        val vm = loaded()
        api.onCrearCategoria = { created }
        vm.create(form)

        vm.catalogDidChange()
        assertEquals("Categoría «Mascotas» creada", vm.state.value.announcement)

        vm.refresh()
        assertNull(vm.state.value.announcement)
    }

    @Test
    fun dismissingTheAnnouncementClearsIt() = runTest {
        val vm = loaded()
        api.onCrearCategoria = { created }
        vm.create(form)

        vm.dismissAnnouncement()

        assertNull(vm.state.value.announcement)
    }

    @Test
    fun aDeletionFromTheDetailIsAnnouncedByTheList() = runTest {
        val vm = loaded()

        vm.announceDeletion("Mascotas")

        assertEquals("Categoría «Mascotas» eliminada", vm.state.value.announcement)
    }
}
