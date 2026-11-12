package app.mirachbudget.android.features.subircartola

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.core.networking.CartolaRow
import app.mirachbudget.android.core.networking.ClasificacionPreview
import app.mirachbudget.android.features.resumen.fill
import app.mirachbudget.android.features.resumen.isLargeText

/**
 * Screen 04's accordion: how the server classified the new rows, bucket → category → movement, with the
 * counts and totals it sent. Read-only: editing goes through «Revisar y editar». Everything starts collapsed.
 */
@Composable
internal fun PreviewSummary(preview: CartolaPreview) {
    // A server that predates the summary sends none: the screen is the one before it.
    val clasificacion = preview.clasificacion ?: return
    val expanded = remember(preview) { mutableStateMapOf<String, Boolean>() }
    fun isOpen(key: String) = expanded[key] == true
    fun toggle(key: String) { expanded[key] = !isOpen(key) }

    Text(
        PreviewSummaryPresentation.unknownsMessage(clasificacion),
        style = if (clasificacion.desconocidos > 0) MirachTextStyles.cuerpoDestacado else MirachTextStyles.cuerpo,
        color = if (clasificacion.desconocidos > 0) MirachTheme.colors.base.foreground else MirachTheme.colors.base.mutedForeground,
        modifier = Modifier.testTag("subir.desconocidos"),
    )
    if (clasificacion.ingresos.cantidad == 0 && clasificacion.buckets.isEmpty()) return

    Column(
        Modifier
            .fillMaxWidth()
            .background(MirachTheme.colors.base.card)
            .border(1.dp, MirachTheme.colors.base.border),
    ) {
        if (clasificacion.ingresos.cantidad > 0) {
            Group(
                key = "ingresos",
                open = isOpen("ingresos"),
                onToggle = ::toggle,
                swatch = null,
                title = SubirCartolaMessages.INCOMES_TITLE,
                count = clasificacion.ingresos.cantidad,
                amount = Format.income(clasificacion.ingresos.total),
                amountColor = MirachTheme.colors.base.cardForeground,
                spoken = PreviewSummaryPresentation.spokenSummary(clasificacion.ingresos),
                tag = "subir.ingresos",
            ) {
                PreviewSummaryPresentation.incomeRows(preview).forEach { Movement(it) }
            }
            if (clasificacion.buckets.isNotEmpty()) Divider()
        }
        clasificacion.buckets.forEachIndexed { index, group ->
            val groupKey = group.bucket.apiName
            Group(
                key = groupKey,
                open = isOpen(groupKey),
                onToggle = ::toggle,
                swatch = MirachTheme.colors.bucket.fill(group.bucket),
                title = PreviewSummaryPresentation.title(group),
                count = group.cantidad,
                amount = Format.expense(group.total),
                amountColor = MirachTheme.colors.feedback.expenseText,
                spoken = PreviewSummaryPresentation.spokenSummary(group),
                tag = "subir.bucket.$groupKey",
            ) {
                group.categorias.forEach { categoria ->
                    val categoryKey = "$groupKey|${categoria.key}"
                    Group(
                        key = categoryKey,
                        open = isOpen(categoryKey),
                        onToggle = ::toggle,
                        swatch = null,
                        title = categoria.nombre,
                        count = categoria.cantidad,
                        amount = Format.expense(categoria.total),
                        amountColor = MirachTheme.colors.feedback.expenseText,
                        spoken = PreviewSummaryPresentation.spokenSummary(categoria),
                        tag = "subir.categoria.${categoria.key}",
                        indent = 12.dp,
                    ) {
                        PreviewSummaryPresentation.rows(categoria, preview).forEach { Movement(it) }
                    }
                }
            }
            if (index < clasificacion.buckets.lastIndex) Divider()
        }
    }
}

/** One accordion level: a tappable header and, when open, its [content] below. */
@Composable
private fun Group(
    key: String,
    open: Boolean,
    onToggle: (String) -> Unit,
    swatch: Color?,
    title: String,
    count: Int,
    amount: String,
    amountColor: Color,
    spoken: String,
    tag: String,
    indent: androidx.compose.ui.unit.Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    val state = if (open) SubirCartolaMessages.EXPANDED else SubirCartolaMessages.COLLAPSED
    Column(Modifier.padding(start = indent)) {
        Header(
            swatch = swatch, title = title, count = count, amount = amount, amountColor = amountColor, open = open,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClickLabel = state) { onToggle(key) }
                .semantics(mergeDescendants = true) {
                    contentDescription = spoken
                    stateDescription = state
                    role = Role.Button
                }
                .testTag(tag)
                .padding(horizontal = MirachSpacing.m, vertical = 12.dp),
        )
        if (open) Column(Modifier.padding(bottom = 4.dp)) { content() }
    }
}

/** Title, count and amount of a group; at large text sizes the amount drops under the title. */
@Composable
private fun Header(
    swatch: Color?,
    title: String,
    count: Int,
    amount: String,
    amountColor: Color,
    open: Boolean,
    modifier: Modifier,
) {
    val colors = MirachTheme.colors
    val titleBlock: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            swatch?.let { Box(Modifier.size(10.dp).background(it)) }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = MirachTextStyles.cuerpoDestacado, color = colors.base.cardForeground)
                Text(
                    PreviewSummaryPresentation.countText(count),
                    style = MirachTextStyles.etiqueta,
                    color = colors.base.mutedForeground,
                )
            }
        }
    }
    val amountText: @Composable () -> Unit = {
        Text(amount, style = MirachTextStyles.cuerpo.mirachFigures(), color = amountColor)
    }
    val chevron: @Composable () -> Unit = {
        Text(
            "›",
            style = MirachTextStyles.cuerpoDestacado,
            color = colors.base.mutedForeground,
            modifier = Modifier.rotate(if (open) 90f else 0f),
        )
    }
    if (isLargeText()) {
        Row(modifier, verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                titleBlock()
                amountText()
            }
            Spacer(Modifier.width(8.dp))
            chevron()
        }
    } else {
        Row(modifier, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { titleBlock() }
            Spacer(Modifier.width(12.dp))
            amountText()
            Spacer(Modifier.width(8.dp))
            chevron()
        }
    }
}

@Composable
private fun Movement(row: CartolaRow) {
    val colors = MirachTheme.colors
    val detail = Format.shortDate(row.fecha)
    Row(
        Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = "${row.descripcion}. ${row.spokenAmount}. $detail" }
            .testTag("subir.fila.${row.rowIndex}")
            .padding(start = 24.dp, end = 12.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(row.descripcion, style = MirachTextStyles.cuerpo, color = colors.base.cardForeground, maxLines = 2)
            Text(detail, style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground)
        }
        Spacer(Modifier.width(12.dp))
        Text(
            row.amountText,
            style = MirachTextStyles.cuerpo.mirachFigures(),
            color = if (row.cargo != 0L) colors.feedback.expenseText else colors.base.cardForeground,
        )
    }
}

@Composable
private fun Divider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(MirachTheme.colors.base.border))
}
