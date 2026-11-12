package app.mirachbudget.android.core.design

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.window.DialogProperties

// Confirmation dialogs share one look: square, flat, generated text styles. Behavior stays with the caller.

/** A confirmation dialog with a [title] in «Cuerpo destacado» and a body in «Cuerpo». */
@Composable
fun MirachAlertDialog(
    onDismissRequest: () -> Unit,
    title: String,
    confirmButton: @Composable () -> Unit,
    dismissButton: @Composable () -> Unit,
    properties: DialogProperties = DialogProperties(),
    text: @Composable () -> Unit,
) {
    val colors = MirachTheme.colors.base
    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = { Text(title, style = MirachTextStyles.cuerpoDestacado) },
        text = { ProvideTextStyle(MirachTextStyles.cuerpo) { text() } },
        confirmButton = confirmButton,
        dismissButton = dismissButton,
        shape = RoundedCornerShape(MirachRadius.base),
        containerColor = colors.background,
        titleContentColor = colors.foreground,
        textContentColor = colors.foreground,
        properties = properties,
    )
}

/** A dialog action as a text button in «Botón»; [contentColor] is only for a colored action. */
@Composable
fun DialogTextButton(text: String, onClick: () -> Unit, enabled: Boolean = true, contentColor: Color = MirachTheme.colors.base.foreground) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(MirachRadius.base),
        colors = ButtonDefaults.textButtonColors(contentColor = contentColor),
    ) { Text(text, style = MirachTextStyles.boton) }
}

/** The irreversible action of a dialog: filled in `destructive`, «Botón» text. */
@Composable
fun DialogDestructiveButton(text: String, onClick: () -> Unit, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(MirachRadius.base),
        colors = ButtonDefaults.buttonColors(
            containerColor = MirachTheme.colors.base.destructive,
            contentColor = MirachTheme.colors.base.primaryForeground,
        ),
    ) { Text(text, style = MirachTextStyles.boton) }
}
