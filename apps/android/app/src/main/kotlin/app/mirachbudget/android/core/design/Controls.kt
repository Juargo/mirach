package app.mirachbudget.android.core.design

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// Shared controls restyled to Figma's «Botón» and «Campo»: square corners, generated text styles.

/** Measures of the shared controls. The button is 52dp tall in Figma, above the 48dp touch target. */
internal object ControlMetrics {
    val buttonHeight: Dp = 52.dp
    val cornerRadius: Dp = MirachRadius.base

    /** Padding of the `Primeros pasos` style panel in Figma; there is no token for 14. */
    val panelPadding: Dp = 14.dp
}

private val ControlShape = RoundedCornerShape(ControlMetrics.cornerRadius)

/** Full-width primary action: filled in `primary`, «Botón» text. [busy] swaps the label for a spinner. */
@Composable
fun MirachPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    containerColor: Color = MirachTheme.colors.base.primary,
    contentColor: Color = MirachTheme.colors.base.primaryForeground,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = modifier.fillMaxWidth().heightIn(min = ControlMetrics.buttonHeight),
        shape = ControlShape,
        colors = ButtonDefaults.buttonColors(containerColor = containerColor, contentColor = contentColor),
        contentPadding = PaddingValues(MirachSpacing.m),
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = contentColor)
        else Text(text, style = MirachTextStyles.boton)
    }
}

/** Full-width secondary action: 1dp border in `input` (Figma `borde/fuerte`), «Botón» text in `foreground`. */
@Composable
fun MirachSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    MirachSecondaryButton(onClick, modifier, enabled) { Text(text) }
}

/** Same button with its own content (a label plus a chevron, for instance); the text keeps the «Botón» style. */
@Composable
fun MirachSecondaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit,
) {
    val colors = MirachTheme.colors.base
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().heightIn(min = ControlMetrics.buttonHeight),
        shape = ControlShape,
        border = BorderStroke(1.dp, if (enabled) colors.input else colors.border),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = colors.foreground),
        contentPadding = PaddingValues(MirachSpacing.m),
    ) {
        ProvideTextStyle(MirachTextStyles.boton) { content() }
    }
}

/**
 * Text field with Material's floating label (it keeps the screen-reader label). The box is square with
 * a 1dp border in `border`, `foreground` when focused and `destructive` when [isError].
 */
@Composable
fun MirachTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isError: Boolean = false,
    singleLine: Boolean = true,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val colors = MirachTheme.colors.base
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        label = { Text(label, style = MirachTextStyles.etiqueta) },
        textStyle = MirachTextStyles.cuerpo,
        enabled = enabled,
        isError = isError,
        singleLine = singleLine,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        shape = ControlShape,
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = colors.foreground,
            unfocusedTextColor = colors.foreground,
            focusedBorderColor = colors.foreground,
            unfocusedBorderColor = colors.border,
            errorBorderColor = colors.destructive,
            focusedLabelColor = colors.mutedForeground,
            unfocusedLabelColor = colors.mutedForeground,
            errorLabelColor = colors.mutedForeground,
            cursorColor = colors.foreground,
        ),
    )
}

/**
 * Figma's «Primeros pasos» panel: a flat `card` surface, no border, with a header and short lines in
 * «Etiqueta». Content goes in the column; the spacing between lines is 6dp as in the frame.
 */
@Composable
fun InfoPanel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth().background(MirachTheme.colors.base.card).padding(ControlMetrics.panelPadding),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) { content() }
}
