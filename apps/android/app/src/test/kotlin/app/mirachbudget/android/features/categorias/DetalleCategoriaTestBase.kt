package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.features.categorias.CategoriasSamples.catalogo
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.Content
import app.mirachbudget.android.testing.FakeMirachApi
import org.junit.Assert.assertEquals

/** The detail of «Supermercado» (or another id) over the sample catalog, recording what it tells the other screens. */
abstract class DetalleCategoriaTestBase {
    protected val api = FakeMirachApi()
    protected var changes = 0
    protected val deleted = mutableListOf<String>()

    protected fun viewModel(id: String = "cat-super") =
        DetalleCategoriaViewModel(api, id, onChange = { changes++ }, onDeleted = { deleted += it })

    protected suspend fun loaded(id: String = "cat-super"): DetalleCategoriaViewModel {
        api.onCategorias = { catalogo }
        val vm = viewModel(id)
        vm.load()
        assertEquals(catalogo.categoria(id), vm.state.value.category)
        return vm
    }

    protected fun DetalleCategoriaViewModel.shown(): CategoriaCatalogo = (state.value.content as Content.Loaded).categoria
}
