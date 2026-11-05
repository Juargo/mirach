package app.mirachbudget.android.core.staging

import java.io.File
import java.io.IOException
import java.util.UUID

/** Why a picked file is refused before any call to the API (mirrors iOS `CartolaFileProblem`). */
enum class CartolaFileProblem {
    UNSUPPORTED_EXTENSION,
    TOO_LARGE,

    /** The system would not let the app read it. */
    UNREADABLE,
}

sealed interface StageResult {
    data class Staged(val file: CartolaFile) : StageResult

    data class Rejected(val problem: CartolaFileProblem) : StageResult
}

/** The rules the catalog puts on a file before it is sent (`subir-cartola.md`, "Elegir archivo"). */
object CartolaFileRules {
    /** The API's own limit: 10 MB. */
    const val MAX_BYTES = 10 * 1024 * 1024

    private val mimeTypesByExtension = linkedMapOf(
        "pdf" to "application/pdf",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    /** What the Storage Access Framework picker is asked to show. */
    val PICKER_MIME_TYPES: Array<String> = mimeTypesByExtension.values.toTypedArray()

    /** `null` when the extension (case-insensitive) is not one the API reads. */
    fun mimeTypeFor(filename: String): String? =
        mimeTypesByExtension[filename.substringAfterLast('.', missingDelimiterValue = "").lowercase()]
}

/** A statement staged in the app's own cache folder. The picked document is never read again. */
data class CartolaFile(
    val file: File,
    /** The original name: the API decides how to read the file from its extension. */
    val filename: String,
    /** Size of the copy in bytes. */
    val byteCount: Long,
) {
    val mimeType: String get() = CartolaFileRules.mimeTypeFor(filename) ?: "application/octet-stream"

    fun readBytes(): ByteArray = file.readBytes()
}

/**
 * Keeps a private copy of the picked statement for as long as the flow lasts: commit needs
 * the file again, and the grant on the picked document may end at any moment. Each copy gets
 * its own subfolder so the original name survives without two files ever colliding.
 */
class CartolaStaging(private val directory: File) {
    fun stage(source: CartolaSource): StageResult {
        val filename: String
        val declaredSize: Long?
        try {
            // Strip any path segments a provider might put in the display name.
            filename = source.displayName()?.let { File(it).name }.orEmpty()
            declaredSize = source.size()
        } catch (e: Exception) {
            return StageResult.Rejected(CartolaFileProblem.UNREADABLE)
        }
        if (CartolaFileRules.mimeTypeFor(filename) == null) {
            return StageResult.Rejected(CartolaFileProblem.UNSUPPORTED_EXTENSION)
        }
        // Check before copying, as iOS does: a huge file must not fill the device.
        if (declaredSize != null && declaredSize > CartolaFileRules.MAX_BYTES) {
            return StageResult.Rejected(CartolaFileProblem.TOO_LARGE)
        }

        val folder = File(directory, UUID.randomUUID().toString())
        val copy = File(folder, filename)
        return try {
            folder.mkdirs()
            val copied = copyCapped(source, copy)
            if (copied == null) {
                folder.deleteRecursively()
                StageResult.Rejected(CartolaFileProblem.TOO_LARGE)
            } else {
                StageResult.Staged(CartolaFile(copy, filename, copied))
            }
        } catch (e: Exception) {
            folder.deleteRecursively()
            StageResult.Rejected(CartolaFileProblem.UNREADABLE)
        }
    }

    /** Deletes one staged copy (end of the flow, discard, sign-out). */
    fun discard(staged: CartolaFile) {
        // Only ever delete inside our own folder, whatever file is passed in.
        val folder = staged.file.parentFile ?: return
        if (folder.parentFile?.canonicalFile != directory.canonicalFile) return
        folder.deleteRecursively()
    }

    /** Deletes everything staged, including leftovers of a run killed before the flow ended. */
    fun purgeAll() {
        directory.deleteRecursively()
    }

    /**
     * Streams the source into [target], stopping as soon as it passes the limit: the declared
     * size may be missing or wrong. Returns the bytes copied, or `null` when over the limit.
     */
    private fun copyCapped(source: CartolaSource, target: File): Long? {
        val input = source.openInputStream() ?: throw IOException("no input stream")
        input.use { stream ->
            target.outputStream().use { output ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var total = 0L
                while (true) {
                    val read = stream.read(buffer)
                    if (read < 0) return total
                    total += read
                    if (total > CartolaFileRules.MAX_BYTES) return null
                    output.write(buffer, 0, read)
                }
            }
        }
    }
}
