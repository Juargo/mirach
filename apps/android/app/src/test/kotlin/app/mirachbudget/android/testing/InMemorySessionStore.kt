package app.mirachbudget.android.testing

import app.mirachbudget.android.core.session.Session
import app.mirachbudget.android.core.session.SessionStore

class InMemorySessionStore(private var session: Session? = null) : SessionStore {
    var failOnSave = false
    var failOnClear = false

    override fun load(): Session? = session

    override fun save(session: Session) {
        if (failOnSave) throw IllegalStateException("save failed")
        this.session = session
    }

    override fun clear() {
        if (failOnClear) throw IllegalStateException("clear failed")
        session = null
    }
}
