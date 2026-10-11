package app.mirachbudget.android.features.resumen

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketResumen
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ResumenMes

object ResumenSamples {
    fun periodo(text: String): Periodo = checkNotNull(Periodo.parse(text))

    fun mes(
        periodo: String = "2026-09",
        ingreso: Long = 1_000_000,
        sinIngreso: Boolean = false,
        totals: List<Long> = listOf(450_000, 305_000, 0),
    ): ResumenMes {
        val bps = listOf(5_000, 3_000, 2_000)
        return ResumenMes(
            periodo = periodo(periodo),
            sinIngreso = sinIngreso,
            totalIngreso = ingreso,
            estadoGlobal = null,
            buckets = Bucket.entries.mapIndexed { i, bucket ->
                BucketResumen(
                    bucket = bucket,
                    total = totals[i],
                    porcentajeBp = if (sinIngreso) null else (totals[i] * 10_000 / ingreso).toInt(),
                    metaBp = bps[i],
                    estado = null,
                )
            },
        )
    }
}
