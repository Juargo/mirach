package app.mirachbudget.android.features.cartolassubidas

import app.mirachbudget.android.core.networking.CartolaSubida
import java.time.Instant

/** A processed import, a failed one whose bank was never resolved, and an older processed one (as on iOS). */
object CartolasSubidasSamples {
    val procesada = CartolaSubida(
        id = "g-3",
        banco = "Banco de Chile",
        nombreArchivo = "cartola-septiembre.xlsx",
        estado = CartolaSubida.Estado.Procesada,
        motivoFallo = null,
        fecha = Instant.ofEpochSecond(1_790_985_600),
        totalTransacciones = 37,
    )
    val fallida = CartolaSubida(
        id = "g-2",
        banco = null,
        nombreArchivo = "estado-de-cuenta.pdf",
        estado = CartolaSubida.Estado.Fallida,
        motivoFallo = "No se reconoció el formato del archivo",
        fecha = Instant.ofEpochSecond(1_790_899_200),
        totalTransacciones = 0,
    )
    val unMovimiento = CartolaSubida(
        id = "g-1",
        banco = "BancoEstado",
        nombreArchivo = "cuenta-rut.xlsx",
        estado = CartolaSubida.Estado.Procesada,
        motivoFallo = null,
        fecha = Instant.ofEpochSecond(1_788_307_200),
        totalTransacciones = 1,
    )
    val cartolas = listOf(procesada, fallida, unMovimiento)
}
