package app.mirachbudget.android.core.design

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.networking.EstadoSemaforo

private const val FULL_BP = 10_000f

/** Fill and target tick as fractions (0 to 1) of the track width. Drawing only: no figure is shown from these. */
data class BarFractions(val fill: Float, val tick: Float)

/** [shareBp] is the real share of income (null without income), [targetBp] the target; both clamp to the track. */
fun barFractions(shareBp: Int?, targetBp: Int): BarFractions = BarFractions(
    fill = ((shareBp ?: 0) / FULL_BP).coerceIn(0f, 1f),
    tick = (targetBp / FULL_BP).coerceIn(0f, 1f),
)

/**
 * Bucket bar: name and [estado] on top (omitted without one), a 10dp track with the bucket-color fill
 * and a 2dp by 18dp target tick, and the [caption] under it. Read as one element with [description];
 * with [onOpen] it is a button that offers [openHint].
 */
@Composable
fun BucketBar(
    name: String,
    color: Color,
    estado: EstadoSemaforo?,
    fractions: BarFractions,
    caption: String,
    description: String,
    modifier: Modifier = Modifier,
    onOpen: (() -> Unit)? = null,
    openHint: String? = null,
) {
    val colors = MirachTheme.colors.base
    val clickable = if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier
    Column(
        modifier.then(clickable).clearAndSetSemantics {
            contentDescription = description
            if (onOpen != null) {
                role = Role.Button
                onClick(label = openHint) { onOpen(); true }
            }
        },
        verticalArrangement = Arrangement.spacedBy(MirachSpacing.xs),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
            Text(name, style = MirachTextStyles.cuerpoDestacado, color = colors.foreground, modifier = Modifier.weight(1f))
            estado?.let { Estado(it) }
        }
        BoxWithConstraints(Modifier.fillMaxWidth().height(18.dp)) {
            Box(Modifier.align(Alignment.CenterStart).fillMaxWidth().height(10.dp).background(colors.card))
            Box(Modifier.align(Alignment.CenterStart).fillMaxWidth(fractions.fill).height(10.dp).background(color))
            Box(
                Modifier
                    .align(Alignment.CenterStart)
                    .offset(x = maxWidth * fractions.tick - 1.dp)
                    .width(2.dp)
                    .height(18.dp)
                    .background(colors.foreground),
            )
        }
        Text(caption, style = MirachTextStyles.etiqueta.mirachFigures(), color = colors.mutedForeground)
    }
}
