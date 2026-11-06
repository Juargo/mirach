package app.mirachbudget.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import androidx.core.content.IntentCompat
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.share.SharedIntentParser

class MainActivity : ComponentActivity() {
    private val dependencies get() = (application as MirachApplication).dependencies

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A recreated activity (rotation, process restore) already offered its launch intent.
        if (savedInstanceState == null) offerSharedCartola(intent)
        val dependencies = dependencies
        setContent {
            MirachTheme {
                Surface(color = MirachTheme.colors.base.background) {
                    RootRoute(dependencies)
                }
            }
        }
    }

    /** A share while Mirach is already open (`singleTask` in the manifest) arrives here. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        offerSharedCartola(intent)
    }

    private fun offerSharedCartola(intent: Intent?) {
        intent ?: return
        val stream = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        val uri = SharedIntentParser.sharedUri(
            action = intent.action,
            stream = stream?.toString(),
            data = intent.dataString,
            launchedFromHistory = (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0,
        ) ?: return
        dependencies.sharedCartola.offer(uri)
    }
}
