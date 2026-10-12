package app.mirachbudget.android.features.version

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures

/** Stateless: renders [state] and reports the retry tap. */
@Composable
fun ApiVersionScreen(state: ApiVersionState, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (state) {
            ApiVersionState.Idle -> Unit
            ApiVersionState.Loading -> {
                CircularProgressIndicator()
                Text("Conectando con el servidor…", style = MaterialTheme.typography.bodyMedium)
            }
            is ApiVersionState.Loaded -> {
                Text("Mirach", style = MaterialTheme.typography.headlineLarge, color = MirachTheme.colors.base.foreground)
                Text(
                    "API ${state.info.version} · ${state.info.commit}",
                    style = MaterialTheme.typography.bodyMedium.mirachFigures(),
                    color = MirachTheme.colors.base.mutedForeground,
                )
            }
            is ApiVersionState.Failed -> {
                Text(
                    state.message,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MirachTheme.colors.feedback.errorText,
                    textAlign = TextAlign.Center,
                )
                Button(onClick = onRetry) { Text("Reintentar") }
            }
        }
    }
}
