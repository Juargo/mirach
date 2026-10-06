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
