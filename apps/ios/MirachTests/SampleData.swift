import Foundation
@testable import Mirach

/// Realistic months for view model tests.
enum SampleData {
    static func mes(_ periodo: String, ingreso: Int = 1_000_000, sinIngreso: Bool = false) -> ResumenMes {
        ResumenMes(
            periodo: Periodo(periodo)!,
            sinIngreso: sinIngreso,
            totalIngreso: ingreso,
            estadoGlobal: sinIngreso ? nil : .amarillo,
            buckets: [
                BucketResumen(bucket: .necesidades, total: 450_000, porcentajeBp: sinIngreso ? nil : 4500, metaBp: 5000, estado: .verde),
                BucketResumen(bucket: .deseos, total: 305_000, porcentajeBp: sinIngreso ? nil : 3050, metaBp: 3000, estado: .amarillo),
                BucketResumen(bucket: .ahorro, total: 0, porcentajeBp: sinIngreso ? nil : 0, metaBp: 2000, estado: nil),
            ]
        )
    }

    static let septiembre = mes("2026-09")
}

extension SampleData {
    /// Ids of the sample catalog, so tests can name them.
    enum Cat {
        static let supermercado = "cat-super"
        static let transporte = "cat-transp"
        static let restaurantes = "cat-rest"
        static let fondo = "cat-fondo"
        static let desconocidoDeseos = "cat-desc-deseos"
    }

    static let catalog = CatalogoCategorias(categorias: [
        CategoriaCatalogo(id: "cat-desc-nec", nombre: "Desconocido", bucket: .necesidades),
        CategoriaCatalogo(id: Cat.supermercado, nombre: "Supermercado", bucket: .necesidades),
        CategoriaCatalogo(id: Cat.transporte, nombre: "Transporte", bucket: .necesidades),
        CategoriaCatalogo(id: Cat.desconocidoDeseos, nombre: "Desconocido", bucket: .deseos),
        CategoriaCatalogo(id: Cat.restaurantes, nombre: "Restaurantes", bucket: .deseos),
        CategoriaCatalogo(id: "cat-desc-aho", nombre: "Desconocido", bucket: .ahorro),
        CategoriaCatalogo(id: Cat.fondo, nombre: "Fondo de emergencia", bucket: .ahorro),
    ])

    /// 2026-10-03T00:00:00Z plus `day` days.
    static func date(day: Int) -> Date { Date(timeIntervalSince1970: 1_790_985_600 + Double(day) * 86_400) }

    /// Row 0: suggested Supermercado. 1: suggested Restaurantes. 2: no suggestion. 3: an income.
    /// 4: already loaded (duplicate).
    static let rows: [CartolaRow] = [
        CartolaRow(
            rowIndex: 0, fecha: date(day: 0), descripcion: "LIDER EXPRESS", cargo: 25_990, abono: 0,
            esDuplicado: false, sugerido: .init(bucket: .necesidades, categoriaId: Cat.supermercado)
        ),
        CartolaRow(
            rowIndex: 1, fecha: date(day: 1), descripcion: "RESTAURANT LA PUNTA", cargo: 18_500, abono: 0,
            esDuplicado: false, sugerido: .init(bucket: .deseos, categoriaId: Cat.restaurantes)
        ),
        CartolaRow(
            rowIndex: 2, fecha: date(day: 2), descripcion: "TRANSF A JUAN PEREZ", cargo: 40_000, abono: 0,
            esDuplicado: false, sugerido: nil
        ),
        CartolaRow(
            rowIndex: 3, fecha: date(day: 3), descripcion: "ABONO SUELDO", cargo: 0, abono: 1_200_000,
            esDuplicado: false, sugerido: nil
        ),
        CartolaRow(
            rowIndex: 4, fecha: date(day: 4), descripcion: "COPEC", cargo: 30_000, abono: 0,
            esDuplicado: true, sugerido: .init(bucket: .necesidades, categoriaId: Cat.transporte)
        ),
    ]

    static let preview = CartolaPreview(
        banco: "Banco de Chile", tipoCuenta: "Cuenta Corriente", numeroCuenta: "00-123-45678-09",
        totalFilas: 5, duplicados: 1, nuevas: 4, filas: rows
    )
    static let commit = CartolaCommitResult(totalTransacciones: 37, duplicadosOmitidos: 5)
}

extension SampleData {
    /// Deseos of September 2026: two categories and «Sin categoría» last, as the API sends them.
    static let deseosDetalle = BucketDetalle(
        bucket: .deseos, periodo: Periodo("2026-09")!, total: 610_400, porcentajeBp: 3300, metaBp: 3000,
        totalTransacciones: 4, totalCategorias: 3,
        grupos: [
            GrupoCategoria(
                categoriaId: Cat.restaurantes, nombre: "Restaurantes", icono: "utensils", subtotal: 210_900, conteo: 2,
                transacciones: [
                    MovimientoBucket(id: "t-1", fecha: date(day: 0), descripcion: "RESTAURANT LA PUNTA", origen: "Banco de Chile", monto: 118_500),
                    MovimientoBucket(id: "t-2", fecha: date(day: 1), descripcion: "PIZZERIA BELLA NAPOLI", origen: "Manual", monto: 92_400),
                ]
            ),
            GrupoCategoria(
                categoriaId: "cat-susc", nombre: "Suscripciones", icono: nil, subtotal: 15_480, conteo: 1,
                transacciones: [
                    MovimientoBucket(id: "t-3", fecha: date(day: 2), descripcion: "NETFLIX.COM", origen: "Banco de Chile", monto: 15_480)
                ]
            ),
            GrupoCategoria(
                categoriaId: nil, nombre: "Sin categoría", icono: nil, subtotal: 384_020, conteo: 1,
                transacciones: [
                    MovimientoBucket(id: "t-4", fecha: date(day: 3), descripcion: "MERCADO LIBRE", origen: "Banco de Chile", monto: 384_020)
                ]
            ),
        ]
    )

    static let deseosVacio = BucketDetalle(
        bucket: .deseos, periodo: Periodo("2026-08")!, total: 0, porcentajeBp: nil, metaBp: 3000,
        totalTransacciones: 0, totalCategorias: 0, grupos: []
    )
}
