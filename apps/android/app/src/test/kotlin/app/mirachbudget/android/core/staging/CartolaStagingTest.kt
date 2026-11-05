package app.mirachbudget.android.core.staging

import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CartolaStagingTest {
    @get:Rule val temp = TemporaryFolder()

    private lateinit var directory: File
    private lateinit var staging: CartolaStaging

    @Before
    fun setUp() {
        directory = File(temp.root, "cartolas")
        staging = CartolaStaging(directory)
    }

    @Test
    fun `stages a pdf with its name, size, mime type and exact bytes`() {
        val bytes = ByteArray(2048) { (it % 251).toByte() }

        val file = staged(staging.stage(FakeSource("cartola.pdf", bytes)))

        assertEquals("cartola.pdf", file.filename)
        assertEquals(2048L, file.byteCount)
        assertEquals("application/pdf", file.mimeType)
        assertArrayEquals(bytes, file.readBytes())
        assertTrue(file.file.canonicalPath.startsWith(directory.canonicalPath))
    }

    @Test
    fun `stages an xlsx with the spreadsheet mime type`() {
        val file = staged(staging.stage(FakeSource("movimientos.xlsx", byteArrayOf(1, 2, 3))))

        assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file.mimeType)
        assertArrayEquals(byteArrayOf(1, 2, 3), file.readBytes())
    }

    @Test
    fun `accepts an uppercase extension`() {
        val file = staged(staging.stage(FakeSource("CARTOLA.PDF", byteArrayOf(9))))

        assertEquals("CARTOLA.PDF", file.filename)
        assertEquals("application/pdf", file.mimeType)
    }

    @Test
    fun `rejects xls and other extensions without opening the file`() {
        for (name in listOf("cartola.xls", "cartola.csv", "cartola", "cartola.pdf.exe")) {
            val source = FakeSource(name, byteArrayOf(1))

            assertEquals(StageResult.Rejected(CartolaFileProblem.UNSUPPORTED_EXTENSION), staging.stage(source))
            assertFalse(source.opened)
        }
        assertNothingStaged()
    }

    @Test
    fun `rejects a file without a display name as unsupported`() {
        val result = staging.stage(FakeSource(null, byteArrayOf(1)))

        assertEquals(StageResult.Rejected(CartolaFileProblem.UNSUPPORTED_EXTENSION), result)
        assertNothingStaged()
    }

    @Test
    fun `accepts exactly 10 MB`() {
        val file = staged(staging.stage(FakeSource("cartola.pdf", ByteArray(CartolaFileRules.MAX_BYTES))))

        assertEquals(10L * 1024 * 1024, file.byteCount)
        assertEquals(10L * 1024 * 1024, file.file.length())
    }

    @Test
    fun `rejects a declared size over 10 MB before opening the file`() {
        val source = FakeSource("cartola.pdf", byteArrayOf(1), declaredSize = 10L * 1024 * 1024 + 1)

        assertEquals(StageResult.Rejected(CartolaFileProblem.TOO_LARGE), staging.stage(source))
        assertFalse(source.opened)
        assertNothingStaged()
    }

    @Test
    fun `rejects a file that grows past 10 MB while copying and leaves no partial copy`() {
        val source = FakeSource("cartola.pdf", ByteArray(CartolaFileRules.MAX_BYTES + 1), declaredSize = null)

        assertEquals(StageResult.Rejected(CartolaFileProblem.TOO_LARGE), staging.stage(source))
        assertNothingStaged()
    }

    @Test
    fun `a failed copy is unreadable and leaves no partial copy`() {
        val source = FakeSource("cartola.pdf", ByteArray(4096), failAfterBytes = 1000)

        assertEquals(StageResult.Rejected(CartolaFileProblem.UNREADABLE), staging.stage(source))
        assertNothingStaged()
    }

    @Test
    fun `a source that cannot be opened is unreadable`() {
        val source = object : CartolaSource {
            override fun displayName() = "cartola.pdf"
            override fun size(): Long? = 10L
            override fun openInputStream(): InputStream = throw SecurityException("no permission")
        }

        assertEquals(StageResult.Rejected(CartolaFileProblem.UNREADABLE), staging.stage(source))
        assertNothingStaged()
    }

    @Test
    fun `two files with the same name never collide`() {
        val first = staged(staging.stage(FakeSource("cartola.pdf", byteArrayOf(1))))
        val second = staged(staging.stage(FakeSource("cartola.pdf", byteArrayOf(2))))

        assertArrayEquals(byteArrayOf(1), first.readBytes())
        assertArrayEquals(byteArrayOf(2), second.readBytes())
    }

    @Test
    fun `a display name with path segments stays inside the staging directory`() {
        val file = staged(staging.stage(FakeSource("../../evil.pdf", byteArrayOf(1))))

        assertEquals("evil.pdf", file.filename)
        assertTrue(file.file.canonicalPath.startsWith(directory.canonicalPath))
    }

    @Test
    fun `discard removes the staged copy and keeps the others`() {
        val gone = staged(staging.stage(FakeSource("a.pdf", byteArrayOf(1))))
        val kept = staged(staging.stage(FakeSource("b.pdf", byteArrayOf(2))))

        staging.discard(gone)

        assertFalse(gone.file.exists())
        assertFalse(gone.file.parentFile!!.exists())
        assertTrue(kept.file.exists())
    }

    @Test
    fun `discard never deletes outside the staging directory`() {
        val outsider = File(temp.newFolder("outside"), "keep.pdf").apply { writeBytes(byteArrayOf(1)) }

        staging.discard(CartolaFile(outsider, "keep.pdf", 1))

        assertTrue(outsider.exists())
    }

    @Test
    fun `purgeAll removes the whole staging directory`() {
        staged(staging.stage(FakeSource("a.pdf", byteArrayOf(1))))
        staged(staging.stage(FakeSource("b.xlsx", byteArrayOf(2))))

        staging.purgeAll()

        assertFalse(directory.exists())
    }

    @Test
    fun `the requested mime types are pdf and xlsx`() {
        assertEquals(
            listOf("application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            CartolaFileRules.PICKER_MIME_TYPES.toList(),
        )
    }

    private fun staged(result: StageResult): CartolaFile {
        assertTrue("expected Staged, got $result", result is StageResult.Staged)
        return (result as StageResult.Staged).file
    }

    private fun assertNothingStaged() {
        val leftovers = directory.walkTopDown().filter { it.isFile }.toList()
        assertTrue("unexpected staged files: $leftovers", leftovers.isEmpty())
    }

    private class FakeSource(
        private val name: String?,
        private val bytes: ByteArray,
        private val declaredSize: Long? = bytes.size.toLong(),
        private val failAfterBytes: Int? = null,
    ) : CartolaSource {
        var opened = false

        override fun displayName() = name

        override fun size() = declaredSize

        override fun openInputStream(): InputStream {
            opened = true
            val data = ByteArrayInputStream(bytes)
            val limit = failAfterBytes ?: return data
            return object : InputStream() {
                private var read = 0

                override fun read(): Int {
                    if (read >= limit) throw IOException("connection lost")
                    read++
                    return data.read()
                }
            }
        }
    }
}
