package app.mirachbudget.android.features.session

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.networking.VersionInfo

@Composable
fun ValidatingScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text(
            "Verificando tu sesión… la primera vez puede tardar hasta un minuto.",
            color = MirachTheme.colors.base.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun ConnectionFailedScreen(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "Problema de conexión. Revisa tu conexión e inténtalo de nuevo.",
            color = MirachTheme.colors.base.foreground,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onRetry) { Text("Reintentar") }
    }
}

/** Placeholder of the signed-in area until the Resumen arrives; `/version` stays as a footnote. */
@Composable
fun SignedInScreen(version: VersionInfo?, onSignOut: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize().padding(24.dp)) {
        Column(
            modifier = Modifier.align(Alignment.Center),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Mirach", style = MaterialTheme.typography.headlineLarge, color = MirachTheme.colors.base.foreground)
            Text("Sesión iniciada.", color = MirachTheme.colors.base.mutedForeground)
            OutlinedButton(onClick = onSignOut) { Text("Cerrar sesión") }
        }
        version?.let {
            Text(
                "API ${it.version} · ${it.commit}",
                style = MaterialTheme.typography.bodySmall.mirachFigures(),
                color = MirachTheme.colors.base.mutedForeground,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}
