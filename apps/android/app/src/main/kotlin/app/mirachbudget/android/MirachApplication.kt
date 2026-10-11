package app.mirachbudget.android

import android.app.Application

/** Holds the dependency graph for the process, so the session survives activity recreation. */
class MirachApplication : Application() {
    val dependencies: AppEnvironment.Dependencies by lazy { AppEnvironment.make(this) }
}
