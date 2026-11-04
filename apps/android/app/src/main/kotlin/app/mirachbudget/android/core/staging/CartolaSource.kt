package app.mirachbudget.android.core.staging

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import java.io.InputStream

/** A picked document as staging sees it. Any call may throw: staging maps that to UNREADABLE. */
interface CartolaSource {
    fun displayName(): String?

    /** `null` when the provider does not know it. */
    fun size(): Long?

    fun openInputStream(): InputStream?
}

/** A document picked with the Storage Access Framework (`OpenDocument`). */
class ContentResolverCartolaSource(
    private val resolver: ContentResolver,
    private val uri: Uri,
) : CartolaSource {
    override fun displayName(): String? = queryColumn(OpenableColumns.DISPLAY_NAME) { getString(it) }

    override fun size(): Long? = queryColumn(OpenableColumns.SIZE) { getLong(it) }

    override fun openInputStream(): InputStream? = resolver.openInputStream(uri)

    private fun <T> queryColumn(column: String, read: android.database.Cursor.(Int) -> T): T? =
        resolver.query(uri, arrayOf(column), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(column)
            if (index < 0 || !cursor.moveToFirst() || cursor.isNull(index)) null else cursor.read(index)
        }
}
