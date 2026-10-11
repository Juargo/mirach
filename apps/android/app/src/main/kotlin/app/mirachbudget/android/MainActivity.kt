package app.mirachbudget.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.Surface
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.features.version.ApiVersionRoute
import app.mirachbudget.android.features.version.ApiVersionViewModel
import app.mirachbudget.android.features.version.ConfigurationErrorScreen

class MainActivity : ComponentActivity() {
    private val dependencies by lazy { AppEnvironment.make() }

    private val versionViewModel: ApiVersionViewModel by viewModels {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = ApiVersionViewModel(dependencies.api) as T
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MirachTheme {
                Surface(color = MirachTheme.colors.base.background) {
                    if (dependencies.configurationProblem != null) {
                        ConfigurationErrorScreen()
                    } else {
                        ApiVersionRoute(versionViewModel)
                    }
                }
            }
        }
    }
}
