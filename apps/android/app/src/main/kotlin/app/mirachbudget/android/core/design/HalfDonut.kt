package app.mirachbudget.android.core.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.formatting.Format
import kotlin.math.cos
import kotlin.math.sin

/** Degrees left between neighbouring segments. */
const val DONUT_GAP_DEGREES = 1.5f

private const val TOP_ANGLE = 270f
private const val HALF_TURN = 180f

/** One arc in Compose angles (0 at three o'clock, clockwise): [startAngle] and a positive [sweepAngle]. */
data class DonutSegment(val startAngle: Float, val sweepAngle: Float) {
    val midAngle: Float get() = startAngle + sweepAngle / 2

    /** A label needs room: below this sweep the segment is drawn without its percentage. */
    val showsLabel: Boolean get() = sweepAngle >= DONUT_MIN_LABEL_SWEEP
}

const val DONUT_MIN_LABEL_SWEEP = 16f

/** The ring has room for whole percentages only; the bar captions carry the exact figure. */
fun donutLabel(bp: Int): String = Format.percent(Math.round(bp / 100.0).toInt() * 100)

/**
 * The visible half runs from the top (270) through the left (180) to the bottom (90). Each share gets
 * a slice of the half proportional to its part of the sum and loses half the gap at both ends.
 * Negative or missing shares count as 0; a sum of 0 draws nothing.
 */
fun donutSegments(sharesBp: List<Int?>): List<DonutSegment> {
    val shares = sharesBp.map { maxOf(it ?: 0, 0).toFloat() }
    val sum = shares.sum()
    if (sum == 0f) return emptyList()
    var covered = 0f
    return shares.map { share ->
        val slice = HALF_TURN * share / sum
        val segment = DonutSegment(
            startAngle = TOP_ANGLE - covered - slice + DONUT_GAP_DEGREES / 2,
            sweepAngle = maxOf(slice - DONUT_GAP_DEGREES, 0f),
        )
        covered += slice
        segment
    }
}

private data class Ring(val outerRadius: Float, val innerRatio: Float, val alpha: Float)

private val outerRing = Ring(outerRadius = 150f, innerRatio = 0.74f, alpha = 1f)
private val innerRing = Ring(outerRadius = 104f, innerRatio = 0.80f, alpha = 0.4f)

/**
 * Half donut centred on the trailing edge, so only the leading half shows (150dp by 300dp). The outer
 * ring is the month ([realBp], by real share), the inner one the target ([targetBp]) at 40% opacity.
 * Hidden from screen readers: the bucket bars carry the same data.
 */
@Composable
fun HalfDonut(fills: List<Color>, realBp: List<Int?>, targetBp: List<Int>, modifier: Modifier = Modifier) {
    val colors = MirachTheme.colors.base
    val measurer = rememberTextMeasurer()
    val labelStyle = MirachTextStyles.etiqueta.copy(fontWeight = FontWeight.SemiBold)
    val real = donutSegments(realBp)
    val target = donutSegments(targetBp)
    Canvas(modifier.size(150.dp, 300.dp).clipToBounds().clearAndSetSemantics {}) {
        val center = Offset(size.width, size.height / 2)
        // White on the jade of Ahorro is 3.51:1: the documented contrast exception uses the dark text there.
        val outerLabels = realBp.indices.map { if (it == fills.lastIndex) colors.foreground else colors.background }
        drawRing(outerRing, center, real, fills, realBp.map { it ?: 0 }, outerLabels, measurer, labelStyle)
        drawRing(innerRing, center, target, fills, targetBp, targetBp.map { colors.foreground }, measurer, labelStyle)
    }
}

private fun DrawScope.drawRing(
    ring: Ring,
    center: Offset,
    segments: List<DonutSegment>,
    fills: List<Color>,
    labelBp: List<Int>,
    labelColors: List<Color>,
    measurer: TextMeasurer,
    labelStyle: androidx.compose.ui.text.TextStyle,
) {
    val innerRadius = ring.outerRadius * ring.innerRatio
    val strokeWidth = (ring.outerRadius - innerRadius).dp.toPx()
    val middle = ((ring.outerRadius + innerRadius) / 2).dp.toPx()
    segments.forEachIndexed { i, segment ->
        if (segment.sweepAngle <= 0f) return@forEachIndexed
        drawArc(
            color = fills[i].copy(alpha = ring.alpha),
            startAngle = segment.startAngle,
            sweepAngle = segment.sweepAngle,
            useCenter = false,
            topLeft = Offset(center.x - middle, center.y - middle),
            size = Size(middle * 2, middle * 2),
            style = Stroke(width = strokeWidth),
        )
        if (!segment.showsLabel) return@forEachIndexed
        val radians = Math.toRadians(segment.midAngle.toDouble())
        val label = measurer.measure(donutLabel(labelBp[i]), labelStyle)
        drawText(
            label,
            color = labelColors[i],
            topLeft = Offset(
                center.x + (middle * cos(radians)).toFloat() - label.size.width / 2,
                center.y + (middle * sin(radians)).toFloat() - label.size.height / 2,
            ),
        )
    }
}
