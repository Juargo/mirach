package app.mirachbudget.android.features.detallebucket

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.Periodo

/**
 * One opening of the bucket detail from the Resumen: the bucket, the Resumen's month and an id of
 * its own, so each opening gets a fresh view model (as Cartolas subidas does). [saved] is what a
 * `rememberSaveable` keeps across a rotation.
 */
data class DetalleBucketOpening(val bucket: Bucket, val periodo: Periodo, val id: String) {
    val saved: String get() = "${bucket.apiName}|${periodo.apiValue}|$id"

    companion object {
        fun restore(saved: String): DetalleBucketOpening? {
            val parts = saved.split("|")
            if (parts.size != 3) return null
            val bucket = Bucket.fromApi(parts[0]) ?: return null
            val periodo = Periodo.parse(parts[1]) ?: return null
            return DetalleBucketOpening(bucket, periodo, parts[2])
        }
    }
}
