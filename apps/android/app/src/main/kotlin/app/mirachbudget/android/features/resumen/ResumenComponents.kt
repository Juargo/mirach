package app.mirachbudget.android.features.resumen

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.BucketBar
import app.mirachbudget.android.core.design.EstadoMark
import app.mirachbudget.android.core.design.HalfDonut
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.barFractions
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketResumen
import app.mirachbudget.android.core.networking.EstadoSemaforo
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ResumenMes

/** From this font scale on, rows go to one column so no figure is squeezed or truncated. */
private const val LARGE_TEXT_SCALE = 1.3f

@Composable
internal fun isLargeText() = LocalDensity.current.fontScale >= LARGE_TEXT_SCALE

@Composable
internal fun Modifier.card() = this
    .fillMaxWidth()
    .background(MirachTheme.colors.base.card)
    .border(1.dp, MirachTheme.colors.base.border)
    .padding(12.dp)

@Composable
fun LoadingBlock(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(top = 48.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text("Cargando tu resumen…", color = MirachTheme.colors.base.mutedForeground)
    }
}

@Composable
fun ErrorBlock(failure: ResumenViewModel.Failure, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(top = 48.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            when (failure) {
                ResumenViewModel.Failure.Connection -> "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
                ResumenViewModel.Failure.Server -> "No pudimos cargar el resumen. Inténtalo de nuevo en unos segundos."
            },
            color = MirachTheme.colors.feedback.errorText,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onRetry) { Text("Reintentar") }
    }
}

/** A month without income: the message plus "Subir cartola", which opens the Subir tab (as on iOS). */
@Composable
fun EmptyMonth(onUpload: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(top = 32.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // The two texts read as one element; the button stays its own element so it remains reachable.
        Column(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Todavía no hay datos este mes", style = MaterialTheme.typography.titleMedium, color = MirachTheme.colors.base.foreground)
            Text(
                "Cuando subas una cartola, aquí verás cómo se repartió tu mes.",
                color = MirachTheme.colors.base.mutedForeground,
                textAlign = TextAlign.Center,
            )
        }
        Button(onClick = onUpload, modifier = Modifier.padding(top = 8.dp)) { Text("Subir cartola") }
    }
}

/** Month arrows over the months that have data; an arrow with no month beyond it is disabled. */
@Composable
fun MonthSelector(periodo: Periodo, anterior: Periodo?, siguiente: Periodo?, onSelect: (Periodo) -> Unit, modifier: Modifier = Modifier) {
    val title: @Composable () -> Unit = {
        Text(
            Format.monthTitle(periodo),
            style = MirachTextStyles.cuerpoDestacado,
            color = MirachTheme.colors.base.foreground,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
    }
    if (isLargeText()) {
        // Large text: the title gets the full width, the arrows sit under it.
        Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            title()
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Arrow("‹", "Mes anterior", anterior, onSelect)
                Arrow("›", "Mes siguiente", siguiente, onSelect)
            }
        }
    } else {
        Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Arrow("‹", "Mes anterior", anterior, onSelect)
            title()
            Arrow("›", "Mes siguiente", siguiente, onSelect)
        }
    }
}

@Composable
private fun Arrow(glyph: String, label: String, target: Periodo?, onSelect: (Periodo) -> Unit) {
    // IconButton keeps the 48dp minimum touch target.
    IconButton(
        onClick = { target?.let(onSelect) },
        enabled = target != null,
        modifier = Modifier.semantics {
            contentDescription = label
            target?.let { stateDescription = Format.month(it) }
        },
    ) {
        Text(
            glyph,
            style = MaterialTheme.typography.headlineMedium,
            color = if (target != null) MirachTheme.colors.base.foreground else MirachTheme.colors.base.mutedForeground,
        )
    }
}

/** The month with data: verdict, the bucket bars with the half donut, and the income row. */
@Composable
fun ResumenContent(mes: ResumenMes, modifier: Modifier = Modifier, onOpenBucket: ((Bucket) -> Unit)? = null) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MirachSpacing.m)) {
        MonthVerdict(mes.estadoMes)
        if (mes.buckets.none { it.total > 0 }) {
            Text(
                "Sin gastos este mes",
                color = MirachTheme.colors.base.mutedForeground,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        val bars: @Composable () -> Unit = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                mes.buckets.forEach { item -> BucketBarFor(item, onOpen = onOpenBucket?.let { open -> { open(item.bucket) } }) }
            }
        }
        if (isLargeText()) {
            // Large text: the bars take the full width; the donut and its legend are left out.
            bars()
        } else {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { bars() }
                // The donut sits on the trailing edge of the screen, so it reaches into the screen padding.
                HalfDonut(
                    fills = mes.buckets.map { MirachTheme.colors.bucket.fill(it.bucket) },
                    realBp = mes.buckets.map { it.porcentajeBp },
                    targetBp = mes.buckets.map { it.metaBp },
                    modifier = Modifier.offset(x = MirachSpacing.m),
                )
            }
            Text(
                DONUT_LEGEND,
                style = MirachTextStyles.etiqueta,
                color = MirachTheme.colors.base.mutedForeground,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth().clearAndSetSemantics {},
            )
        }
        IncomeRow(mes)
    }
}

/** The month verdict as the headline: a 16dp mark in the state color and the phrase in titulo. Not shown without state. */
@Composable
private fun MonthVerdict(estado: EstadoSemaforo?) {
    val verdict = monthVerdict(estado) ?: return
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MirachSpacing.s),
    ) {
        EstadoMark(checkNotNull(estado), size = 16.dp)
        Text(verdict, style = MirachTextStyles.titulo, color = MirachTheme.colors.base.foreground)
    }
}

@Composable
private fun IncomeRow(mes: ResumenMes) {
    Row(
        Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = mes.incomeRowDescription() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MirachSpacing.s),
    ) {
        Text(INCOME_LABEL, style = MirachTextStyles.etiqueta, color = MirachTheme.colors.base.mutedForeground, modifier = Modifier.weight(1f))
        Text(mes.incomeRowText(), style = MirachTextStyles.etiqueta.mirachFigures(), color = MirachTheme.colors.base.foreground)
    }
}

/** What TalkBack offers on a bucket bar that opens its movements (iOS: «Ver los movimientos»). */
internal const val BUCKET_ROW_HINT = "Ver los movimientos"

/** One bucket bar. Always shown, so the donut is never the only way to see a bucket. With [onOpen] it opens the bucket's movements. */
@Composable
private fun BucketBarFor(item: BucketResumen, onOpen: (() -> Unit)? = null) {
    BucketBar(
        name = item.bucket.label,
        color = MirachTheme.colors.bucket.fill(item.bucket),
        estado = item.estado,
        fractions = barFractions(item.porcentajeBp, item.metaBp),
        caption = item.barCaption(),
        description = item.accessibilityLabel(),
        onOpen = onOpen,
        openHint = BUCKET_ROW_HINT,
    )
}
