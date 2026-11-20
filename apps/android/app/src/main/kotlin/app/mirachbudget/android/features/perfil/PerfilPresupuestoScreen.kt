package app.mirachbudget.android.features.perfil

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.mirachbudget.android.core.design.FieldError
import app.mirachbudget.android.core.design.MirachPrimaryButton
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.ScreenBar
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.features.categorias.CenteredMessage
import app.mirachbudget.android.features.categorias.Loading
import app.mirachbudget.android.features.perfil.PerfilPresupuestoViewModel.LoadState
import app.mirachbudget.android.features.perfil.PerfilPresupuestoViewModel.SaveState
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * "Perfil de porcentajes", pushed from the Perfil tab. [onSaved] runs after a successful save, and
 * the screen closes through [onBack]. Each opening gets its own view model, kept across rotation.
 */
@Composable
fun PerfilPresupuestoRoute(api: MirachApi, onBack: () -> Unit, onSaved: () -> Unit, modifier: Modifier = Modifier) {
    val currentOnSaved by rememberUpdatedState(onSaved)
    val currentOnBack by rememberUpdatedState(onBack)
    val opening = rememberSaveable { UUID.randomUUID().toString() }
    val viewModel = viewModel<PerfilPresupuestoViewModel>(
        key = "perfil-presupuesto-$opening",
        factory = viewModelFactory {
            initializer { PerfilPresupuestoViewModel(api, onSaved = { currentOnSaved(); currentOnBack() }) }
        },
    )
    PerfilPresupuestoScreen(viewModel, onBack, modifier)
}

@Composable
private fun PerfilPresupuestoScreen(viewModel: PerfilPresupuestoViewModel, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    BackHandler(onBack = onBack)
    LaunchedEffect(viewModel) { viewModel.loadIfNeeded() }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = { ScreenBar(title = PerfilPresupuestoMessages.TITLE, onBack = onBack) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Column(
                Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = MirachSpacing.l, vertical = MirachSpacing.m),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                when (val load = state.load) {
                    LoadState.Loading -> Loading(PerfilPresupuestoMessages.LOADING)
                    is LoadState.Failed -> CenteredMessage(
                        PerfilPresupuestoMessages.load(load.failure),
                        "Reintentar",
                        onAction = { scope.launch { viewModel.load() } },
                    )
                    LoadState.Loaded -> {
                        Text(
                            PerfilPresupuestoMessages.NOTE,
                            style = MirachTextStyles.cuerpo,
                            color = MirachTheme.colors.base.mutedForeground,
                            modifier = Modifier.padding(bottom = MirachSpacing.s),
                        )
                        Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            PERFIL_CARDS.forEach { card ->
                                ProfileCard(card, selected = state.selected == card.perfil, onSelect = { viewModel.select(card.perfil) })
                            }
                        }
                    }
                }
            }
            if (state.load == LoadState.Loaded) {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = MirachSpacing.l, vertical = MirachSpacing.m),
                    verticalArrangement = Arrangement.spacedBy(MirachSpacing.s),
                ) {
                    (state.save as? SaveState.Failed)?.let { FieldError(PerfilPresupuestoMessages.save(it.failure)) }
                    MirachPrimaryButton(
                        PerfilPresupuestoMessages.SAVE,
                        onClick = { scope.launch { viewModel.save() } },
                        enabled = state.canSave,
                        busy = state.save == SaveState.Saving,
                    )
                }
            }
        }
    }
}

/** One selectable card: a single element for a screen reader, with a decorative bar. */
@Composable
private fun ProfileCard(card: PerfilCard, selected: Boolean, onSelect: () -> Unit) {
    val colors = MirachTheme.colors
    val stroke = if (selected) BorderStroke(2.dp, colors.base.primary) else BorderStroke(1.dp, colors.base.border)
    Column(
        Modifier
            .fillMaxWidth()
            .background(colors.base.card)
            .border(stroke)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
            .clearAndSetSemantics { contentDescription = card.description }
            .padding(MirachSpacing.m),
        verticalArrangement = Arrangement.spacedBy(MirachSpacing.s),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
            Text(card.title, style = MirachTextStyles.cuerpoDestacado, color = colors.base.foreground, modifier = Modifier.weight(1f))
            if (card.recommended) {
                Text(
                    PerfilPresupuestoMessages.RECOMMENDED,
                    style = MirachTextStyles.mini,
                    color = colors.base.primaryForeground,
                    modifier = Modifier.background(colors.base.primary).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        Text(card.caption, style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground)
        DistributionBar(card)
    }
}

/** Necesidades, Gustos and Ahorro side by side, widths proportional to the shares, 2dp apart. */
@Composable
private fun DistributionBar(card: PerfilCard) {
    val bucket = MirachTheme.colors.bucket
    Row(Modifier.fillMaxWidth().height(6.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Box(Modifier.weight(card.necesidades.toFloat()).fillMaxSize().background(bucket.necesidades))
        Box(Modifier.weight(card.gustos.toFloat()).fillMaxSize().background(bucket.gustos))
        Box(Modifier.weight(card.ahorro.toFloat()).fillMaxSize().background(bucket.ahorro))
    }
}
