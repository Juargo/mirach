package app.mirachbudget.android.features.version

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme

/** Shown instead of the app when the build has no API key (see ConfigurationCheck). */
@Composable
fun ConfigurationErrorScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(MirachSpacing.l),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "La app no está configurada correctamente.",
            style = MirachTextStyles.cuerpo,
            color = MirachTheme.colors.feedback.errorText,
            textAlign = TextAlign.Center,
        )
    }
}
