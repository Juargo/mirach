package app.mirachbudget.android.core.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.networking.EstadoSemaforo

/** The state word from the design copy (VIS-02: the word always travels with the color). */
val EstadoSemaforo.word: String
    get() = when (this) {
        EstadoSemaforo.Verde -> MirachCopy.Estado.bien
        EstadoSemaforo.Amarillo -> MirachCopy.Estado.cerca
        EstadoSemaforo.Rojo -> MirachCopy.Estado.sobre
    }

/** Fill of the state mark. */
fun EstadoColors.mark(estado: EstadoSemaforo): Color = when (estado) {
    EstadoSemaforo.Verde -> bien
    EstadoSemaforo.Amarillo -> cerca
    EstadoSemaforo.Rojo -> sobre
}

/** Color of the state word; the design has no separate text token for "sobre", so it uses the fill. */
fun EstadoColors.text(estado: EstadoSemaforo): Color = when (estado) {
    EstadoSemaforo.Verde -> bienText
    EstadoSemaforo.Amarillo -> cercaText
    EstadoSemaforo.Rojo -> sobre
}

/** A square in the state color. Decoration only: the word next to it carries the meaning. */
@Composable
fun EstadoMark(estado: EstadoSemaforo, size: Dp, modifier: Modifier = Modifier) {
    Box(modifier.size(size).background(MirachTheme.colors.estado.mark(estado)))
}

/** Estado: a 10dp mark and the word in etiqueta, 6dp apart. Screen readers get the word only. */
@Composable
fun Estado(estado: EstadoSemaforo, modifier: Modifier = Modifier) {
    Row(
        modifier.clearAndSetSemantics { contentDescription = estado.word },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        EstadoMark(estado, size = 10.dp)
        Text(estado.word, style = MirachTextStyles.etiqueta, color = MirachTheme.colors.estado.text(estado))
    }
}
