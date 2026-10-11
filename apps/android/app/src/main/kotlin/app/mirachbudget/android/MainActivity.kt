package app.mirachbudget.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import app.mirachbudget.android.core.design.MirachTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dependencies = (application as MirachApplication).dependencies
        setContent {
            MirachTheme {
                Surface(color = MirachTheme.colors.base.background) {
                    RootRoute(dependencies)
                }
            }
        }
    }
}
