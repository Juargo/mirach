package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.core.networking.Consentimientos
import app.mirachbudget.android.core.staging.CartolaStaging
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.catalogo
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.preview
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.Step
import app.mirachbudget.android.testing.FakeMirachApi
import java.io.File
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.rules.TemporaryFolder

/** A view model over a scripted API and a real staging folder inside a JUnit temp dir. */
abstract class SubirCartolaTestBase {
    @get:Rule val temp = TemporaryFolder()

    protected val api = FakeMirachApi()
    protected lateinit var directory: File
    protected lateinit var staging: CartolaStaging

    @Before
    fun setUpStaging() {
        directory = File(temp.root, "cartolas")
        staging = CartolaStaging(directory)
        api.onConsentimientos = { Consentimientos(cartolasVigente = true) }
        api.onCategorias = { catalogo }
    }

    protected fun viewModel() = SubirCartolaViewModel(api, staging, Dispatchers.Unconfined)

    /** Consent in force: the flow opens on the initial screen. */
    protected suspend fun started(): SubirCartolaViewModel {
        val vm = viewModel()
        vm.start()
        assertEquals(Step.Inicial(null), vm.state.value.step)
        return vm
    }

    /** A file picked and previewed: the decision screen with the catalog loaded. */
    protected suspend fun deciding(result: CartolaPreview = preview()): SubirCartolaViewModel {
        api.onPreviewIngesta = { _, _ -> result }
        val vm = started()
        vm.chooseFile(FakeSource("cartola.pdf"))
        assertEquals(Step.Decidiendo(result), vm.state.value.step)
        return vm
    }

    protected suspend fun reviewing(result: CartolaPreview = preview()): SubirCartolaViewModel {
        val vm = deciding(result)
        vm.startReview()
        assertEquals(Step.Revisando(result), vm.state.value.step)
        return vm
    }

    /** Every staged copy still on disk. */
    protected fun stagedCopies(): List<File> = directory.walkTopDown().filter { it.isFile }.toList()
}
