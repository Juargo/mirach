package app.mirachbudget.android.features.resumen

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachCopy
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.BucketResumen
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ResumenMes

/** From this font scale on, rows go to one column so no figure is squeezed or truncated. */
private const val LARGE_TEXT_SCALE = 1.3f

@Composable
private fun isLargeText() = LocalDensity.current.fontScale >= LARGE_TEXT_SCALE

@Composable
private fun Modifier.card() = this
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

/** The "Subir cartola" action arrives with the Subir tab (T6); until then the message stands alone. */
@Composable
fun EmptyMonth(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(top = 32.dp).semantics(mergeDescendants = true) {},
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
}

/** Month arrows over the months that have data; an arrow with no month beyond it is disabled. */
@Composable
fun MonthSelector(periodo: Periodo, anterior: Periodo?, siguiente: Periodo?, onSelect: (Periodo) -> Unit, modifier: Modifier = Modifier) {
    val title: @Composable () -> Unit = {
        Text(
            Format.monthTitle(periodo),
            style = MaterialTheme.typography.titleLarge,
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

/** The month with data: income, the distribution chart and one row per bucket. */
@Composable
fun ResumenContent(mes: ResumenMes, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        IncomeCard(mes)
        if (mes.hasSpending()) {
            DistribucionChart(mes.buckets)
        } else {
            Text(
                "Sin gastos este mes",
                color = MirachTheme.colors.base.mutedForeground,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            mes.buckets.forEach { BucketRow(it) }
        }
    }
}

@Composable
private fun IncomeCard(mes: ResumenMes) {
    Column(
        Modifier.card().clearAndSetSemantics { contentDescription = mes.incomeAccessibilityLabel() },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(MirachCopy.Bucket.ingreso, style = MaterialTheme.typography.bodySmall, color = MirachTheme.colors.base.mutedForeground)
        Text(
            Format.income(mes.totalIngreso),
            style = MaterialTheme.typography.headlineSmall.mirachFigures(),
            color = MirachTheme.colors.ingreso.text,
        )
    }
}

/**
 * Donut of how the month's spend split between the three buckets: the slices are proportional to
 * each bucket's `total`, and nothing is computed or shown as a percentage here. The legend rows
 * below are the accessible way in, so the chart is read as one summary.
 */
@Composable
fun DistribucionChart(buckets: List<BucketResumen>, modifier: Modifier = Modifier) {
    val colors = MirachTheme.colors
    val sweeps = sweepAngles(buckets.map { it.total })
    val gap = if (sweeps.count { it > 0f } > 1) 2f else 0f
    val description = chartDescription(buckets)
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Canvas(
            Modifier
                .size(180.dp)
                .clearAndSetSemantics {
                    contentDescription = "Distribución del gasto"
                    stateDescription = description
                },
        ) {
            val stroke = size.minDimension * 0.19f
            val inset = stroke / 2
            var start = -90f
            buckets.forEachIndexed { i, item ->
                val sweep = sweeps[i]
                if (sweep > 0f) {
                    drawArc(
                        color = colors.bucket.fill(item.bucket),
                        startAngle = start + gap / 2,
                        sweepAngle = (sweep - gap).coerceAtLeast(0.5f),
                        useCenter = false,
                        topLeft = Offset(inset, inset),
                        size = Size(size.width - stroke, size.height - stroke),
                        style = Stroke(width = stroke),
                    )
                }
                start += sweep
            }
        }
    }
}

/** One legend row: swatch, name, spend, share of the income and target. Always shown, so the chart is never the only way to see a bucket. */
@Composable
private fun BucketRow(item: BucketResumen) {
    val name: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // The bucket color is a fill; the name next to it is the real label.
            Box(Modifier.size(14.dp).background(MirachTheme.colors.bucket.fill(item.bucket)))
            Text(item.bucket.label, style = MaterialTheme.typography.titleMedium, color = MirachTheme.colors.base.cardForeground)
        }
    }
    val figures: @Composable (Alignment.Horizontal) -> Unit = { alignment ->
        Column(horizontalAlignment = alignment, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                Format.expense(item.total),
                style = MaterialTheme.typography.titleMedium.mirachFigures(),
                color = MirachTheme.colors.feedback.expenseText,
            )
            Text(
                "${Format.percent(item.porcentajeBp)} del ingreso",
                style = MaterialTheme.typography.bodySmall.mirachFigures(),
                color = MirachTheme.colors.base.mutedForeground,
            )
            Text(
                "Meta: ${Format.percent(item.metaBp)}",
                style = MaterialTheme.typography.bodySmall.mirachFigures(),
                color = MirachTheme.colors.base.mutedForeground,
            )
        }
    }
    Box(Modifier.card().clearAndSetSemantics { contentDescription = item.accessibilityLabel() }) {
        if (isLargeText()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                name()
                figures(Alignment.Start)
            }
        } else {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                name()
                Spacer(Modifier.weight(1f))
                figures(Alignment.End)
            }
        }
    }
}
